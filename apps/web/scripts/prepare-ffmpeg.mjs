import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ffmpegSource = require('ffmpeg-static');
if (!ffmpegSource) throw new Error('ffmpeg-static path missing');

const webRoot = process.cwd();
const binDir = path.resolve(webRoot, 'bin');
const ffmpegTarget = path.join(binDir, 'ffmpeg');
await fs.mkdir(binDir, { recursive: true });
await fs.copyFile(ffmpegSource, ffmpegTarget);
await fs.chmod(ffmpegTarget, 0o755);

const sourceFonts = path.resolve(webRoot, '../../packages/render/assets/fonts');
const targetFonts = path.join(binDir, 'fonts');
await fs.mkdir(targetFonts, { recursive: true });
await fs.cp(sourceFonts, targetFonts, { recursive: true, force: true });

console.log('Prepared MomentCircuit runtime assets:', {
  ffmpeg: ffmpegTarget,
  fonts: targetFonts,
});
