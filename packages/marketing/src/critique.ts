/**
 * The viewer review: a vision model watches the post the way a stranger in the
 * feed would, and says whether it earns the next second.
 *
 *   pnpm mk critique <run-dir>
 *
 * Input: frames sampled across the video (or the slides), the caption, and the
 * format. Output: critique.json beside the record with 1–10 scores for
 * stop / stay / engage / looks-made-by-a-person, the moment a viewer would leave,
 * and concrete fixes. `publish --live` refuses a run whose verdict is not "post".
 *
 * Scope: a reviewer, not a judge of truth. Facts and claims are checked by the
 * fact bank, the copy gate and the knowledge pack; this only judges whether a
 * person would watch, and whether anything looks cheap, blocked or squashed.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Ledger } from './ledger.js';
import { LEDGER_FILE, REPO_ROOT, SPEND_CAP_USD } from './runContext.js';
import { duration, type StudioRecord } from './studio.js';
import { marketingOpenAIKey } from './openaiKey.js';

const MODEL = process.env.MK_CRITIC_MODEL || 'gpt-5.5';
const PRICE = { input: 1.75, output: 14 }; // $/Mtok, Halyard PRICING_PER_MTOK['gpt-5.5'] (estimate)
export const POST_BAR = { stop: 7, stay: 7, engage: 6, human: 7 };

export interface Critique {
  verdict: 'post' | 'revise' | 'reject';
  scores: { stop: number; stay: number; engage: number; human: number };
  cringe: string[];
  pro_team_would_post: boolean;
  would_leave_at: string;
  first_impression: string;
  problems: string[];
  fixes: string[];
  model: string;
  cost_usd: number;
  at: string;
  /** Every individual review behind the verdict (median of several; one review moves ±1). */
  samples?: Array<Pick<Critique, 'scores' | 'cringe' | 'pro_team_would_post'>>;
}

interface Frame {
  file: string;
  label: string;
}

/**
 * One frame a second, each labelled with its time. Ten evenly spaced stills
 * with no timestamps made the reviewer read a long shot as "a duplicate slide"
 * and a frame between two items as "a blank frame" (2026-10-27).
 */
function frames(dir: string, record: StudioRecord): Frame[] {
  const out = path.join(dir, 'critique-frames');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const files: Frame[] = [];
  if (record.outputs.video) {
    const video = path.resolve(REPO_ROOT, record.outputs.video);
    const d = duration(video);
    // The cover, then one a second (at most 40).
    const step = Math.max(1, d / 40);
    const times = [0.05];
    for (let t = 1; t < d - 0.6; t += step) times.push(t);
    times.push(d - 0.3);
    for (const [i, t] of times.entries()) {
      const f = path.join(out, `f${String(i).padStart(2, '0')}.jpg`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=540:-1', '-q:v', '4', f]);
      files.push({ file: f, label: i === 0 ? 'cover (0.0 s)' : `${t.toFixed(1)} s` });
    }
  }
  for (const s of [...(record.outputs.slides ?? []), ...(record.outputs.tiktok_slides ?? [])].slice(0, 10)) {
    const f = path.join(out, `s-${path.basename(s)}`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.resolve(REPO_ROOT, s), '-vf', 'scale=540:-1', '-q:v', '4', f]);
    files.push({ file: f, label: `slide ${files.length + 1}` });
  }
  return files;
}

const RUBRIC = `You are reviewing a short social post BEFORE it is published, as a sharp, honest viewer scrolling TikTok / Reels / Shorts, not as its maker.
Look at the frames in order. Each is labelled: the cover, then one frame per second of video, so consecutive frames of the same shot are that shot continuing (not a duplicate), and a frame caught mid-transition is motion (not a blank slide). Judge only what a viewer watching the whole video sees and feels.
Score 1-10:
- stop: would you stop scrolling on the first frame?
- stay: would you watch to the end (or swipe to the last slide)?
- engage: would you comment, save or share it?
- human: does it look made by a person with taste (10) or like templated AI slop (1)? Penalise: text blocked by other text or by platform buttons, squashed or distorted images, tiny type, dead empty space, repetitive layouts, stiff stock phrasing, anything that looks like an ad.
Context for your scores: this account cannot film live cooking footage or show a presenter. Its videos are still photos with on-screen text, motion and sound. Score against the best posts of THAT kind in the food, diet and allergy niche (a 10 is the best such post you have seen), not against live-action creators.
Then, the owner's bar: list anything dumb, cringe, try-hard, preachy or obviously AI-made (empty list if none), and answer honestly whether the social team at a well-known food brand would publish this exactly as is (pro_team_would_post).
Then: the exact moment you would leave (or "never"), your first impression in one sentence, concrete problems, and concrete fixes a designer could act on today.
verdict: "post" only if stop>=7, stay>=7, engage>=6, human>=7 and cringe is empty; "reject" if the concept itself is weak; otherwise "revise".
Reply with JSON only: {"verdict":"post|revise|reject","scores":{"stop":n,"stay":n,"engage":n,"human":n},"cringe":["..."],"pro_team_would_post":true|false,"would_leave_at":"...","first_impression":"...","problems":["..."],"fixes":["..."]}`;

export async function critique(runDir: string, opts: { samples?: number } = {}): Promise<Critique> {
  const dir = path.resolve(runDir);
  const record = JSON.parse(readFileSync(path.join(dir, 'record.json'), 'utf8')) as StudioRecord;
  const imgs = frames(dir, record);
  if (!imgs.length) throw new Error(`${record.id}: no video or slides to review`);
  const key = marketingOpenAIKey();
  const ledger = new Ledger(LEDGER_FILE, SPEND_CAP_USD);
  const caption = Object.values(record.posts)[0]?.text ?? '';
  const content = [
    { type: 'input_text', text: `${RUBRIC}\n\nFormat: ${record.format}. Summary: ${record.summary}.\nCaption that ships with it:\n${caption}\n\nFrames (${imgs.length}) follow in order, each after its label.` },
    ...imgs.flatMap((f) => [
      { type: 'input_text', text: f.label },
      { type: 'input_image', image_url: `data:image/jpeg;base64,${readFileSync(f.file).toString('base64')}`, detail: 'low' },
    ]),
  ];
  type One = Omit<Critique, 'verdict' | 'samples'> & { verdict: Critique['verdict'] };
  const once = async (): Promise<{ parsed: One; usd: number }> => {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      // Reasoning tokens count against max_output_tokens: a small budget truncated the JSON once (2026-10-27).
      body: JSON.stringify({ model: MODEL, input: [{ role: 'user', content }], max_output_tokens: 8000, reasoning: { effort: 'low' }, text: { format: { type: 'json_object' } } }),
    });
    if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { output?: Array<{ content?: Array<{ type: string; text?: string }> }>; usage?: { input_tokens: number; output_tokens: number } };
    const text = (j.output ?? []).flatMap((o) => o.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('');
    const usd = Number((((j.usage?.input_tokens ?? 0) / 1e6) * PRICE.input + ((j.usage?.output_tokens ?? 0) / 1e6) * PRICE.output).toFixed(5));
    ledger.record({ run: record.id, provider: 'openai', model: MODEL, purpose: 'viewer critique (vision)', units: { inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 }, usd, basis: 'Halyard price table estimate' });
    return { parsed: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as One, usd };
  };
  // One review moves a point either way on the same video (2026-10-27), so the gate reads the
  // median of several, and the pro-team and cringe calls by majority.
  const n = Math.max(1, opts.samples ?? Number(process.env.MK_CRITIC_SAMPLES ?? 3));
  ledger.assertCanSpend(0.03 * n);
  const runs = await Promise.all(Array.from({ length: n }, () => once()));
  const out = aggregate(runs.map((x) => x.parsed));
  out.cost_usd = Number(runs.reduce((a, x) => a + x.usd, 0).toFixed(5));
  out.model = MODEL;
  out.at = new Date().toISOString();
  writeFileSync(path.join(dir, 'critique.json'), `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2]! : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2;
};

/**
 * Several reviews of one video into one verdict: median scores, majority for "a pro team would
 * post it" and for "nothing cringe". The words (impression, problems, fixes) come from the review
 * whose total is closest to the median total. The bar is enforced here, never trusted from a
 * model's own verdict.
 */
export function aggregate(reviews: Array<Omit<Critique, 'samples'>>): Critique {
  if (!reviews.length) throw new Error('no reviews to aggregate');
  const keys = ['stop', 'stay', 'engage', 'human'] as const;
  const scores = Object.fromEntries(keys.map((k) => [k, median(reviews.map((r) => r.scores[k]))])) as Critique['scores'];
  const majority = (f: (r: Omit<Critique, 'samples'>) => boolean) => reviews.filter(f).length * 2 > reviews.length;
  const proTeam = majority((r) => r.pro_team_would_post === true);
  const clean = majority((r) => (r.cringe ?? []).length === 0);
  const total = (r: Omit<Critique, 'samples'>) => keys.reduce((a, k) => a + r.scores[k], 0);
  const mid = median(reviews.map(total));
  const rep = [...reviews].sort((a, b) => Math.abs(total(a) - mid) - Math.abs(total(b) - mid))[0]!;
  // "A pro team would post it exactly as is" is advisory since 2026-10-27: it said no to every
  // video, two real food-media shorts included, so as a gate it only ever meant "never".
  const meets = keys.every((k) => scores[k] >= POST_BAR[k]) && clean;
  return {
    ...rep,
    scores,
    cringe: clean ? [] : (rep.cringe?.length ? rep.cringe : reviews.find((r) => (r.cringe ?? []).length)?.cringe ?? []),
    pro_team_would_post: proTeam,
    verdict: meets ? 'post' : majority((r) => r.verdict === 'reject') ? 'reject' : 'revise',
    samples: reviews.map((r) => ({ scores: r.scores, cringe: r.cringe ?? [], pro_team_would_post: r.pro_team_would_post })),
    model: '',
    cost_usd: 0,
    at: '',
  };
}

export function readCritique(runDir: string): Critique | null {
  const f = path.join(path.resolve(runDir), 'critique.json');
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Critique) : null;
}

/** Every run dir under runs/<date>/ that has a record.json. */
export function runDirs(date: string): string[] {
  const base = path.join(REPO_ROOT, 'runs', date);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((d) => path.join(base, d))
    .filter((d) => existsSync(path.join(d, 'record.json')));
}
