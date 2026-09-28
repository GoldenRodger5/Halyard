import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const source = require('ffmpeg-static');
if (!source) throw new Error('ffmpeg-static path missing');
const targetDir = path.resolve(process.cwd(), 'bin');
const target = path.join(targetDir, 'ffmpeg');
await fs.mkdir(targetDir, { recursive: true });
await fs.copyFile(source, target);
await fs.chmod(target, 0o755);
console.log('Prepared ffmpeg binary:', target);
