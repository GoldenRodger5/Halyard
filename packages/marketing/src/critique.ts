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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Ledger } from './ledger.js';
import { LEDGER_FILE, REPO_ROOT, SPEND_CAP_USD } from './runContext.js';
import { duration, type StudioRecord } from './studio.js';

const MODEL = process.env.MK_CRITIC_MODEL || 'gpt-5.5';
const PRICE = { input: 1.75, output: 14 }; // $/Mtok, Halyard PRICING_PER_MTOK['gpt-5.5'] (estimate)
export const POST_BAR = { stop: 7, stay: 7, engage: 6, human: 7 };

export interface Critique {
  verdict: 'post' | 'revise' | 'reject';
  scores: { stop: number; stay: number; engage: number; human: number };
  would_leave_at: string;
  first_impression: string;
  problems: string[];
  fixes: string[];
  model: string;
  cost_usd: number;
  at: string;
}

function frames(dir: string, record: StudioRecord): string[] {
  const out = path.join(dir, 'critique-frames');
  mkdirSync(out, { recursive: true });
  const files: string[] = [];
  if (record.outputs.video) {
    const video = path.resolve(REPO_ROOT, record.outputs.video);
    const d = duration(video);
    // The first frame (the cover), then evenly through the video.
    const times = [0.05, ...Array.from({ length: 9 }, (_, i) => ((i + 1) * d) / 10)].map((t) => Math.min(t, d - 0.1));
    for (const [i, t] of times.entries()) {
      const f = path.join(out, `f${String(i).padStart(2, '0')}.jpg`);
      execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=540:-1', '-q:v', '4', f]);
      files.push(f);
    }
  }
  for (const s of [...(record.outputs.slides ?? []), ...(record.outputs.tiktok_slides ?? [])].slice(0, 10)) {
    const f = path.join(out, `s-${path.basename(s)}`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.resolve(REPO_ROOT, s), '-vf', 'scale=540:-1', '-q:v', '4', f]);
    files.push(f);
  }
  return files;
}

const RUBRIC = `You are reviewing a short social post BEFORE it is published, as a sharp, honest viewer scrolling TikTok / Reels / Shorts, not as its maker.
Look at the frames in order (frame 1 is the cover / first second). Judge only what a viewer sees and feels.
Score 1-10:
- stop: would you stop scrolling on the first frame?
- stay: would you watch to the end (or swipe to the last slide)?
- engage: would you comment, save or share it?
- human: does it look made by a person with taste (10) or like templated AI slop (1)? Penalise: text blocked by other text or by platform buttons, squashed or distorted images, tiny type, dead empty space, repetitive layouts, stiff stock phrasing, anything that looks like an ad.
Then: the exact moment you would leave (or "never"), your first impression in one sentence, concrete problems, and concrete fixes a designer could act on today.
verdict: "post" only if stop>=7, stay>=7, engage>=6, human>=7; "reject" if the concept itself is weak; otherwise "revise".
Reply with JSON only: {"verdict":"post|revise|reject","scores":{"stop":n,"stay":n,"engage":n,"human":n},"would_leave_at":"...","first_impression":"...","problems":["..."],"fixes":["..."]}`;

export async function critique(runDir: string): Promise<Critique> {
  const dir = path.resolve(runDir);
  const record = JSON.parse(readFileSync(path.join(dir, 'record.json'), 'utf8')) as StudioRecord;
  const imgs = frames(dir, record);
  if (!imgs.length) throw new Error(`${record.id}: no video or slides to review`);
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set');
  const ledger = new Ledger(LEDGER_FILE, SPEND_CAP_USD);
  ledger.assertCanSpend(0.08);
  const caption = Object.values(record.posts)[0]?.text ?? '';
  const content = [
    { type: 'input_text', text: `${RUBRIC}\n\nFormat: ${record.format}. Summary: ${record.summary}.\nCaption that ships with it:\n${caption}\n\nFrames (${imgs.length}) follow in order.` },
    ...imgs.map((f) => ({ type: 'input_image', image_url: `data:image/jpeg;base64,${readFileSync(f).toString('base64')}`, detail: 'low' })),
  ];
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
  const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Omit<Critique, 'model' | 'cost_usd' | 'at'>;
  const s = parsed.scores;
  // The bar is enforced here, not trusted from the model's own verdict.
  const meets = s.stop >= POST_BAR.stop && s.stay >= POST_BAR.stay && s.engage >= POST_BAR.engage && s.human >= POST_BAR.human;
  const out: Critique = { ...parsed, verdict: meets ? 'post' : parsed.verdict === 'reject' ? 'reject' : 'revise', model: MODEL, cost_usd: usd, at: new Date().toISOString() };
  writeFileSync(path.join(dir, 'critique.json'), `${JSON.stringify(out, null, 2)}\n`);
  return out;
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
