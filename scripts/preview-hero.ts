/**
 * §313. Generate the hero a piece would actually get, from its own words.
 *
 *   pnpm exec tsx scripts/preview-hero.ts "Bread was an accident" out.png
 *
 * Uses the same prompt builder the worker uses, so what a preview looks like is
 * what production looks like — a preview with its own prompt would be a second
 * implementation of the decision that matters most here.
 */
import { Buffer } from 'node:buffer';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenAiImageClient } from '../packages/core/src/imagery/openai.js';
import { heroPrompt } from '../apps/worker/src/heroImage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
  const at = line.indexOf('=');
  if (at <= 0 || line.trimStart().startsWith('#')) continue;
  const key = line.slice(0, at).trim();
  if (!process.env[key]) process.env[key] = line.slice(at + 1).trim();
}

async function main(): Promise<void> {
  const subject = process.argv[2];
  const out = process.argv[3];
  if (!subject || !out) throw new Error('usage: preview-hero.ts "<subject>" <out.png>');

  const prompt = heroPrompt({ subject });
  console.log(prompt);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set.');
  const client = new OpenAiImageClient({ apiKey });
  const image = await client.generate({ prompt, aspectRatio: '9:16' });
  writeFileSync(out, Buffer.from(image.data));
  console.log(`${out} — ${(image.data.length / 1024).toFixed(0)}kB`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
