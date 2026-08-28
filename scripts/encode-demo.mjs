/**
 * Encodes the recorded demo to an MP4 the TikTok portal will accept. §181.
 *
 * §196. Runs whether or not the test passed, and never overwrites a longer take
 * with a shorter one.
 *
 * A real recording was lost to the opposite of both. An assertion looked for
 * text hidden inside a collapsed panel, so a successful Login Kit round trip was
 * marked failed; the script was chained with `&&`, so it never ran; and the raw
 * capture was then deleted before anyone looked at it. The authorization was
 * real, the video was real, and all that was wrong was a selector.
 *
 * The capture is the artefact. Whether the assertions afterwards were happy is a
 * separate question, and not one worth destroying footage over.
 *
 * Playwright writes WebM at whatever bitrate it likes; the portal wants MP4 and
 * caps at 50 MB. This transcodes, reports the size, and fails loudly if the
 * result is over the cap rather than leaving a file that will be rejected on
 * upload.
 */
import { readdirSync, statSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const RAW = 'docs/tiktok-review/raw';
const OUT = 'docs/tiktok-review/halyard-tiktok-demo.mp4';
const CAP_MB = 50;

if (!existsSync(RAW)) {
  console.error(`No recording at ${RAW}. Run: pnpm demo:tiktok`);
  process.exit(1);
}

const webms = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.webm')) webms.push(full);
  }
};
walk(RAW);

if (webms.length === 0) {
  console.error('No .webm was recorded. Did the spec run?');
  process.exit(1);
}

const newest = webms.map((f) => ({ f, t: statSync(f).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
mkdirSync('docs/tiktok-review', { recursive: true });

/*
 * Keep the previous take if this one is materially shorter. A run that stops
 * early — a failed assertion, an interrupted authorization — should not quietly
 * replace a complete recording with a stub.
 */
if (existsSync(OUT)) {
  const prevBytes = statSync(OUT).size;
  const nextBytes = statSync(newest).size;
  if (nextBytes < prevBytes * 0.6) {
    const kept = OUT.replace(/\.mp4$/, `.previous-${Date.now()}.mp4`);
    renameSync(OUT, kept);
    console.log(`Previous, longer take preserved as ${kept}`);
  }
}

execFileSync(
  'ffmpeg',
  ['-y', '-i', newest, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '26',
   '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT],
  { stdio: 'inherit' },
);

const mb = statSync(OUT).size / 1_000_000;
console.log(`\n${OUT}  ${mb.toFixed(1)} MB`);
if (mb > CAP_MB) {
  console.error(`Over the ${CAP_MB} MB portal limit. Re-encode with a higher -crf.`);
  process.exit(1);
}
