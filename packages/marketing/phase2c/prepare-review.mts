import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {CreativeAsset} from '../src/socialStudioContract.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'media-manifest.json'), 'utf8'));
function media(file: string, label: string, kind: 'image' | 'video', width: number, height: number, seconds?: number) {
  const absolute = path.join(root, file);
  const sha256 = createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
  const pinned = manifest.files.find((a: {path: string; sha256: string}) => a.path === file);
  if (!pinned || pinned.sha256 !== sha256) throw Error('Unpinned or changed review file: ' + file);
  const asset: CreativeAsset = {path: absolute, kind, sha256, width: pinned.width ?? width, height: pinned.height ?? height,
    ...(seconds ? {durationSeconds: seconds} : {}),
    origin: 'See Phase2C source manifest and inherited Phase2/2B source evidence.',
    rights: 'Existing Google-generated illustration; first-party historical RecipeFix proof; Inter OFL; existing synthetic narration; CC0 kitchen effects; credited CC BY 4.0 music.',
    ...(kind === 'image' ? {altText: label} : {})};
  return {...asset, label};
}
const newFilm = media('packages/marketing/phase2c/renders/second-tray.mp4', 'The second tray · cohesive cut', 'video', 1080, 1920, 12.8);
const animatic = media('packages/marketing/phase2c/renders/animatic.mp4', 'Accepted rough animatic · not the finished export', 'video', 540, 960, 12.8);
const baselines = [
  media('packages/marketing/phase2/cinema/broiler-product-v3.mp4', 'PR118 · generated-food edit', 'video', 1080, 1920, 12),
  media('packages/marketing/phase2b/audio/renders/recipefix-narration.mp4', 'PR123 · narrated screenshot composition', 'video', 1080, 1920, 13.5),
];
const soundBaseline = media('packages/marketing/phase2b/audio/renders/recipefix-sound-only.mp4', 'PR123 · same old picture, sound-only', 'video', 1080, 1920, 13.5);
const proof = [
  media('packages/marketing/phase2b/video/assets/original-serves.png', 'Actual Original serves four', 'image', 270, 93),
  media('packages/marketing/phase2b/video/assets/settings-end.png', 'Actual Dairy-Free and six-serving endpoint', 'image', 390, 844),
  media('packages/marketing/phase2b/video/assets/broiler-proof.png', 'Actual historical broiler-method proof', 'image', 390, 844),
];
const audio = JSON.parse(fs.readFileSync(path.join(root, 'packages/marketing/phase2b/audio/sources.json'), 'utf8'));
const socialCaption = 'AI cooking-plan illustration, not a cooked or tested result. Based on RecipeFix’s recorded October 21, 2026 combined Dairy-Free 4→6 Chicken Tikka Masala adaptation. Two foil-lined sheets; broil one at a time, then finish the batches in sauce. No automatic oven detection or fresh inference.\n\nOpen Chicken Tikka Masala → Make it fit: https://recipefix.app/original-recipes/chicken-tikka-masala\n\nSynthetic Chris narration. Music: ' + audio.requiredMusicCredit;
const catalog = {ideas: [], referenceAssets: [newFilm, animatic, ...baselines, soundBaseline, ...proof],
  newFilm, animatic, baselines, soundBaseline, proof, socialCaption,
  storyboard: JSON.parse(fs.readFileSync(path.join(here, 'storyboard.json'), 'utf8')),
  verdict: 'REVISE against the premium bar; keep this cohesive direction. Independent full-film review confirms one coherent food world and no visible unsupported-rim defect. Soft macro, held later scene and understated muted product benefit remain. Founder approval is pending.',
  publishingVariantsAdded: 0, founderDecision: 'unreviewed'};
fs.writeFileSync(path.join(here, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
console.log(JSON.stringify({reviewAssets: catalog.referenceAssets.length, publishingVariantsAdded: 0, newFilmSha256: newFilm.sha256}));
