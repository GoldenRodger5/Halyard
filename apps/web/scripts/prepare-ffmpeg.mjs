import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const ffmpegSource = require('ffmpeg-static');
if (!ffmpegSource) throw new Error('ffmpeg-static path missing');

const webRoot = process.cwd();
const binDir = path.resolve(webRoot, 'bin');
const ffmpegTarget = path.join(binDir, 'ffmpeg');
await fs.mkdir(binDir, { recursive: true });
await fs.copyFile(ffmpegSource, ffmpegTarget);
await fs.chmod(ffmpegTarget, 0o755);

let ytDlpTarget = null;
if (process.platform === 'linux') {
  const version = '2026.08.19';
  const expectedSha256 = '58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a';
  ytDlpTarget = path.join(binDir, 'yt-dlp');
  let validExisting = false;
  try {
    const existing = await fs.readFile(ytDlpTarget);
    validExisting = crypto.createHash('sha256').update(existing).digest('hex') === expectedSha256;
  } catch {}
  if (!validExisting) {
    const response = await fetch(
      `https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp_linux`
    );
    if (!response.ok) throw new Error(`yt-dlp download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (sha256 !== expectedSha256) throw new Error('yt-dlp checksum mismatch');
    await fs.writeFile(ytDlpTarget, bytes);
  }
  await fs.chmod(ytDlpTarget, 0o755);
}

const sourceFonts = path.resolve(webRoot, '../../packages/render/assets/fonts');
const targetFonts = path.join(binDir, 'fonts');
await fs.mkdir(targetFonts, { recursive: true });
await fs.cp(sourceFonts, targetFonts, { recursive: true, force: true });

console.log('Prepared MomentCircuit runtime assets:', {
  ffmpeg: ffmpegTarget,
  ytDlp: ytDlpTarget,
  fonts: targetFonts,
});
