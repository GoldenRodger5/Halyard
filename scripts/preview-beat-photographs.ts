/**
 * §407. One photograph per beat, each with the next shot in the rotation.
 *
 * The preview half of `beatPhotographs.ts`: generates the images to a directory
 * so they can be looked at, and so a composition can be rendered against real
 * pictures without running the whole pipeline.
 *
 *   pnpm exec tsx scripts/preview-beat-photographs.ts <dir> "subject|subject|..."
 */
import { writeFileSync } from 'node:fs';
import { chooseShot, shotId } from '@halyard/core';
import { heroPrompt } from '../apps/worker/src/heroImage.js';

const SUBJECTS = process.argv[3].split('|');

async function one(subject: string, shot: ReturnType<typeof chooseShot>, out: string) {
  const prompt = heroPrompt({ subject, shot });
  const r = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', n: 1 }),
  });
  const body = (await r.json()) as { data?: { b64_json?: string }[] };
  if (!body.data?.[0]?.b64_json) { console.error('failed:', subject); return false; }
  writeFileSync(out, Buffer.from(body.data[0].b64_json!, 'base64'));
  console.log(`  ${shot.id.padEnd(42)} ${subject}`);
  return true;
}

async function main() {
  const dir = process.argv[2];
  const history: string[] = [];
  for (const [i, subject] of SUBJECTS.entries()) {
    const shot = chooseShot({ format: 'history', recent: history });
    history.unshift(shotId(shot));
    await one(subject, shot, `${dir}/beat${i}.png`);
  }
}
main();
