/**
 * Record the TikTok review demo by capturing the screen. §194.
 *
 * The automated path drives a browser, and TikTok will not complete a QR login
 * inside one — the code scans, the phone confirms, and the desktop page never
 * moves. Bundled Chromium advertises itself and TikTok declines quietly. Real
 * Chrome with the automation flag off usually gets through; this exists for when
 * it does not.
 *
 * Here there is no automation to detect. You drive your own browser, already
 * signed in to everything, and ffmpeg records the screen. The result is the most
 * honest possible demo — literally a person using the product.
 *
 * Usage:
 *   pnpm demo:screen          start recording, then press q to stop
 *
 * macOS will ask for Screen Recording permission the first time. Grant it to
 * your terminal and run again.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, renameSync } from 'node:fs';

const RAW = 'docs/tiktok-review/raw/screen.mov';
const OUT = 'docs/tiktok-review/halyard-tiktok-demo.mp4';
const CAP_MB = 50;

mkdirSync('docs/tiktok-review/raw', { recursive: true });

const steps = [
  'Open a NEW Chrome window with ONLY these tabs — no email, no Slack, nothing personal.',
  '',
  '  1. https://halyard-ten.vercel.app/accounts   (signed in, TikTok showing NOT CONNECTED)',
  '',
  'Then, once recording starts, do this without rushing:',
  '',
  '   A. Show the TikTok card in its disconnected state (pause ~2s)',
  '   B. Click Connect',
  '   C. Let TikTok\'s consent screen load — pause so the permissions are readable',
  '   D. Click Authorize',
  '   E. Wait for the return to Halyard and the confirmation screen',
  '   F. Click Confirm and connect',
  '   G. Show the TikTok card now connected, with its capability line',
  '   H. Go to Content, open the TikTok video item',
  '   I. Scroll to "TikTok posting settings"',
  '   J. Choose a visibility; toggle Comments / Duet / Stitch',
  '   K. Show the content-disclosure controls',
  '   L. Tick the Music Usage Confirmation',
  '   M. Click Save TikTok settings and let it reach READY TO POST',
  '   N. STOP. Do not approve, do not publish.',
  '',
  'Then come back here and press q.',
];

console.log('\n' + '─'.repeat(72));
console.log(steps.join('\n'));
console.log('─'.repeat(72) + '\n');
console.log('Recording starts in 8 seconds. Switch to Chrome now.\n');
await new Promise((r) => setTimeout(r, 8000));

/*
 * `-r 25` because avfoundation defaults higher and the file gets large for no
 * benefit; the encode below targets the portal's 50 MB ceiling anyway.
 */
const ff = spawn(
  'ffmpeg',
  ['-y', '-f', 'avfoundation', '-capture_cursor', '1', '-r', '25', '-i', '4:none', RAW],
  { stdio: ['inherit', 'inherit', 'inherit'] },
);

console.log('● RECORDING. Press q here when you have finished.\n');

await new Promise((resolve) => ff.on('close', resolve));

if (!existsSync(RAW)) {
  console.error('\nNothing was recorded. If macOS asked for Screen Recording permission,');
  console.error('grant it to your terminal in System Settings → Privacy & Security, then retry.');
  process.exit(1);
}

console.log('\nEncoding for the TikTok portal …');
const enc = spawn(
  'ffmpeg',
  ['-y', '-i', RAW, '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-crf', '26',
   '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT],
  { stdio: ['inherit', 'inherit', 'inherit'] },
);
await new Promise((resolve) => enc.on('close', resolve));

const mb = statSync(OUT).size / 1_000_000;
console.log(`\n${OUT}  ${mb.toFixed(1)} MB`);
if (mb > CAP_MB) {
  console.error(`Over the ${CAP_MB} MB limit. Re-encode with a higher -crf, or record a shorter take.`);
  process.exit(1);
}
console.log('Under the 50 MB portal limit. Tell Claude and it will verify the contents.');
