/**
 * Small pieces the History and Versus formats share (and the quiz format
 * does inline): the copy rules every post is held to, a stamp/thud effect, and
 * the narrator's words mapped onto the script.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { forbiddenMatches, type GateCheck } from '../copyGate.js';
import { forbiddenClaims, type KnowledgePack } from '../knowledge.js';
import { check, humanTextProblems, type PlatformPost, type Studio } from '../studio.js';
import type { TimedWord } from '../makeShort.js';

/** A low thud with a paper slap on top: a rubber stamp, or a card landing. Synthesised, no licence question. */
export function thud(s: Studio): string {
  const out = path.join(s.pub, 'sfx-thud.wav');
  if (!existsSync(out))
    execFileSync('ffmpeg', [
      '-v', 'error', '-y',
      '-f', 'lavfi', '-i', 'sine=frequency=62:duration=0.32',
      '-f', 'lavfi', '-i', 'anoisesrc=color=brown:duration=0.12:amplitude=0.9',
      '-filter_complex', '[0]afade=t=out:st=0.02:d=0.3,volume=1.6[a];[1]lowpass=f=1800,afade=t=out:st=0.01:d=0.11,volume=0.9[b];[a][b]amix=inputs=2:normalize=0',
      '-ar', '48000', out,
    ]);
  return 'sfx-thud.wav';
}

/**
 * The script's words with the narrator's times. ElevenLabs aligns the exact
 * characters it was given, so splitting both on whitespace pairs them 1:1;
 * when it does not (it never has), fall back to evenly spread times so a
 * caption is late rather than wrong.
 */
export function timedScript(script: string, words: TimedWord[], seconds: number): Array<{ text: string; t: number; end: number }> {
  const parts = script.split(/\s+/).filter(Boolean);
  if (parts.length === words.length) return parts.map((text, i) => ({ text, t: words[i]!.start, end: words[i]!.end }));
  return parts.map((text, i) => ({ text, t: (i / parts.length) * seconds, end: ((i + 1) / parts.length) * seconds }));
}

export const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9%]/g, '');

const LIMITS: Record<string, number> = { tiktok: 2200, instagram: 2200, x: 280, threads: 500, youtube: 5000 };

/** Caption lengths, YouTube title, no links on X, no forbidden claims, no bait, reads human. */
export function copyRules(pack: KnowledgePack, posts: Record<string, PlatformPost>, onScreen: string[]): GateCheck {
  const problems: string[] = [];
  const everything = [...Object.values(posts).flatMap((p) => [p.text, ...(p.thread ?? []), p.title ?? '']), ...onScreen];
  for (const [k, p] of Object.entries(posts)) {
    for (const part of [p.text, ...(p.thread ?? [])]) if (part.length > LIMITS[p.platform]!) problems.push(`${k}: ${part.length} chars > ${LIMITS[p.platform]}`);
    if (p.platform === 'x' && /https?:\/\//.test([p.text, ...(p.thread ?? [])].join(' '))) problems.push(`${k}: no links on X`);
    if (p.platform === 'youtube' && (!p.title || p.title.length > 100 || !p.title.includes('#shorts'))) problems.push(`${k}: title must be ≤100 chars and carry #shorts`);
    const tags = (p.text.match(/#\w+/g) ?? []).length;
    if (['tiktok', 'instagram'].includes(p.platform) && (tags < 3 || tags > 5 || !/#recipefix\b/i.test(p.text))) problems.push(`${k}: ${tags} hashtags (want 3–5 incl. #recipefix)`);
  }
  for (const c of forbiddenClaims(pack)) for (const ex of c.examples ?? []) for (const txt of everything) if (forbiddenMatches(txt, ex)) problems.push(`forbidden (${c.id}): "${ex}" in "${txt.slice(0, 60)}"`);
  if (/comment below|follow for|like if|tag a friend|smash that/i.test(everything.join(' '))) problems.push('engagement bait wording');
  // The one historical jingle quoted as a quote is not our claim.
  const own = everything.join(' ').replace(/tomato pills will cure all your ills/gi, '');
  const health = /\bsafe for\b|\bcures?\b|\bheals?\b|\bhealth(y|ier)\b|doctor[- ]approved|\bboosts?\b/i.exec(own);
  if (health) problems.push(`health or safety wording: "${health[0]}"`);
  problems.push(...humanTextProblems(everything));
  return check('copy.platform_rules', problems.length === 0, 'caption lengths, YouTube title, no X links, 3–5 hashtags incl. #recipefix, no forbidden claims, no bait, no health claims, reads human', problems);
}
