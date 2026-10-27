/**
 * Publish a QA-passed run to every platform through Blotato.
 *
 *   pnpm mk accounts                               list connected accounts (read-only)
 *   pnpm mk publish <run-dir> [--only a,b]         DRY RUN: print exactly what would be sent
 *   pnpm mk publish <run-dir> --live [--at ISO]    upload media, create posts, poll to a public URL
 *
 * Rules, enforced here rather than remembered:
 * - A run whose QA failed is never published.
 * - A post already submitted for this run (publish.json) is never submitted again.
 * - Each account id must be listed by Blotato for the platform it is used on.
 * - A submission id is not proof: the post counts as live only with status
 *   `published` and a public URL.
 * - TikTok: "Your brand" on (it promotes our own product), AI-generated label on
 *   when the voice is synthetic.
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from './runContext.js';
import type { PlatformKey, PlatformPost, StudioRecord } from './studio.js';

const API = 'https://backend.blotato.com/v2';
const TARGET: Record<PlatformKey, string> = { tiktok: 'tiktok', instagram: 'instagram', x: 'twitter', threads: 'threads', youtube: 'youtube', facebook: 'facebook', pinterest: 'pinterest' };
/** RecipeFix's connected Blotato accounts (verified by `mk accounts`); env overrides: BLOTATO_ACCOUNT_<PLATFORM>. */
const DEFAULT_ACCOUNTS: Partial<Record<PlatformKey, string>> = { instagram: '64295', tiktok: '54896', x: '23940', threads: '8692', pinterest: '9034', youtube: '46296' };
/** One post per platform unless asked: the video wherever video is native. */
const DEFAULT_POSTS = ['tiktok', 'instagram_reel', 'youtube', 'x', 'threads'];

function key(): string {
  const k = process.env.BLOTATO_API_KEY;
  if (!k) throw new Error('BLOTATO_API_KEY is not set (source the Halyard .env)');
  return k;
}

async function api<T>(method: string, p: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API}${p}`, { method, headers: { 'blotato-api-key': key(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  if (!r.ok) throw new Error(`Blotato ${method} ${p} → ${r.status}: ${text.slice(0, 400)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

interface Account {
  id: string;
  platform: string;
  fullname?: string;
  username?: string;
}

export async function listAccounts(): Promise<Account[]> {
  const r = await api<{ items?: Account[] }>('GET', '/users/me/accounts');
  return (r.items ?? []).map((a) => ({ ...a, id: String(a.id) }));
}

export function accountFor(platform: PlatformKey): string | undefined {
  return process.env[`BLOTATO_ACCOUNT_${platform.toUpperCase()}`] ?? DEFAULT_ACCOUNTS[platform];
}

export function buildTarget(post: PlatformPost): Record<string, unknown> {
  const t: Record<string, unknown> = { targetType: TARGET[post.platform] };
  if (post.platform === 'tiktok') {
    Object.assign(t, {
      privacyLevel: process.env.MK_TIKTOK_PRIVACY ?? 'PUBLIC_TO_EVERYONE',
      disabledComments: false,
      disabledDuet: false,
      disabledStitch: false,
      isBrandedContent: false,
      isYourBrand: true,
      isAiGenerated: Boolean(post.ai_voice),
    });
    if (post.kind === 'carousel') Object.assign(t, { autoAddMusic: true, imageCoverIndex: 0, ...(post.title ? { title: post.title.slice(0, 90) } : {}) });
    if (post.kind === 'video' && post.cover_ms !== undefined) t.videoCoverTimestamp = post.cover_ms;
  }
  if (post.platform === 'instagram' && post.kind === 'video') t.mediaType = 'reel';
  if (post.platform === 'youtube') Object.assign(t, { title: (post.title ?? post.text.split('\n')[0]!).slice(0, 100), privacyStatus: 'public', shouldNotifySubscribers: false, containsSyntheticMedia: Boolean(post.ai_voice) });
  if (post.platform === 'facebook') {
    const pageId = process.env.BLOTATO_FACEBOOK_PAGE_ID;
    if (!pageId) throw new Error('facebook needs BLOTATO_FACEBOOK_PAGE_ID');
    Object.assign(t, { pageId, ...(post.kind === 'video' ? { mediaType: 'reel' } : {}) });
  }
  if (post.platform === 'pinterest') {
    const boardId = process.env.BLOTATO_PINTEREST_BOARD_ID;
    if (!boardId) throw new Error('pinterest needs BLOTATO_PINTEREST_BOARD_ID');
    Object.assign(t, { boardId, title: (post.title ?? post.text.split('\n')[0]!).slice(0, 100) });
  }
  return t;
}

const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };

async function upload(file: string): Promise<string> {
  const abs = path.resolve(REPO_ROOT, file);
  const ext = path.extname(abs).toLowerCase();
  const { presignedUrl, publicUrl } = await api<{ presignedUrl: string; publicUrl: string }>('POST', '/media/uploads', { filename: path.basename(abs) });
  const put = await fetch(presignedUrl, { method: 'PUT', headers: { 'content-type': MIME[ext] ?? 'application/octet-stream' }, body: readFileSync(abs) });
  if (!put.ok) throw new Error(`upload of ${path.basename(abs)} → ${put.status}: ${(await put.text()).slice(0, 200)}`);
  return publicUrl;
}

interface Submission {
  post: string;
  platform: PlatformKey;
  accountId: string;
  postSubmissionId: string;
  submittedAt: string;
  status: string;
  publicUrl?: string;
  errorMessage?: string;
  mediaUrls: string[];
}

export async function publishRun(runDir: string, opts: { live: boolean; only?: string[]; at?: string }): Promise<void> {
  const dir = path.resolve(runDir);
  const record = JSON.parse(readFileSync(path.join(dir, 'record.json'), 'utf8')) as StudioRecord;
  if (!record.qa.passed) throw new Error(`${record.id}: QA did not pass; nothing is published. See ${path.join(dir, 'preview.html')}`);
  const ledgerFile = path.join(dir, 'publish.json');
  const done: Submission[] = existsSync(ledgerFile) ? (JSON.parse(readFileSync(ledgerFile, 'utf8')) as Submission[]) : [];
  const wanted = (opts.only ?? DEFAULT_POSTS).filter((k) => record.posts[k]);
  const missing = (opts.only ?? []).filter((k) => !record.posts[k]);
  if (missing.length) throw new Error(`no such post in ${record.id}: ${missing.join(', ')} (has: ${Object.keys(record.posts).join(', ')})`);

  const accounts = opts.live ? await listAccounts() : null;
  console.log(`${opts.live ? 'LIVE' : 'DRY RUN'} · ${record.id} · ${wanted.length} posts${opts.at ? ` · scheduled ${opts.at}` : ''}`);
  for (const k of wanted) {
    const post = record.posts[k]!;
    const prior = done.find((d) => d.post === k && d.status !== 'failed');
    if (prior) {
      console.log(`  skip ${k}: already submitted (${prior.status}${prior.publicUrl ? ` ${prior.publicUrl}` : ''})`);
      continue;
    }
    const accountId = accountFor(post.platform);
    if (!accountId) {
      console.log(`  skip ${k}: no Blotato account for ${post.platform}`);
      continue;
    }
    if (accounts && !accounts.some((a) => a.id === accountId && a.platform === TARGET[post.platform])) {
      throw new Error(`${k}: account ${accountId} is not a connected ${TARGET[post.platform]} account (mk accounts)`);
    }
    const target = buildTarget(post);
    const sizes = post.media.map((m) => `${path.basename(m)} ${(statSync(path.resolve(REPO_ROOT, m)).size / 1e6).toFixed(1)} MB`);
    if (!opts.live) {
      console.log(`\n  ── ${k} → ${post.platform} (account ${accountId}) ──`);
      console.log(`  media: ${sizes.join(', ') || 'none'}`);
      console.log(`  target: ${JSON.stringify(target)}`);
      console.log(post.text.replace(/^/gm, '  │ '));
      for (const t of post.thread ?? []) console.log(`  ↳ thread:\n${t.replace(/^/gm, '  │ ')}`);
      continue;
    }
    const mediaUrls: string[] = [];
    for (const m of post.media) mediaUrls.push(await upload(m));
    const body = {
      post: {
        accountId,
        content: { text: post.text, platform: TARGET[post.platform], mediaUrls, ...(post.thread?.length ? { additionalPosts: post.thread.map((t) => ({ text: t, mediaUrls: [] })) } : {}) },
        target,
      },
      ...(opts.at ? { scheduledTime: opts.at } : {}),
    };
    const r = await api<{ postSubmissionId: string }>('POST', '/posts', body);
    const sub: Submission = { post: k, platform: post.platform, accountId, postSubmissionId: r.postSubmissionId, submittedAt: new Date().toISOString(), status: 'in-progress', mediaUrls };
    done.push(sub);
    writeFileSync(ledgerFile, JSON.stringify(done, null, 2));
    console.log(`  submitted ${k}: ${r.postSubmissionId}`);
  }
  if (opts.live) await pollAll(ledgerFile);
}

export async function pollAll(ledgerFile: string, timeoutMs = 10 * 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const subs = JSON.parse(readFileSync(ledgerFile, 'utf8')) as Submission[];
    const open = subs.filter((s) => s.status === 'in-progress');
    for (const s of open) {
      const st = await api<{ status: string; publicUrl?: string; errorMessage?: string; scheduledTime?: string }>('GET', `/posts/${s.postSubmissionId}`);
      Object.assign(s, { status: st.status, publicUrl: st.publicUrl, errorMessage: st.errorMessage });
    }
    writeFileSync(ledgerFile, JSON.stringify(subs, null, 2));
    if (!subs.some((s) => s.status === 'in-progress') || Date.now() > deadline) {
      for (const s of subs) console.log(`  ${s.post.padEnd(18)} ${s.status.padEnd(11)} ${s.publicUrl ?? s.errorMessage ?? ''}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
}
