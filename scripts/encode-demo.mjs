/**
 * Encodes the recorded demo to an MP4 the TikTok portal will accept. §181.
 *
 * Playwright writes WebM at whatever bitrate it likes; the portal wants MP4 and
 * caps at 50 MB. This transcodes, reports the size, and fails loudly if the
 * result is over the cap rather than leaving a file that will be rejected on
 * upload.
 */
import { readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
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
