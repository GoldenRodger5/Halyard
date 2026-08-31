/** What can actually be generated: post type × what renders it. */
import { POST_TYPES, POST_TYPE_CATALOG, POST_FORMATS, POST_FORMAT_CATALOG } from '@halyard/core';
import { VIDEO_FORMATS } from '../packages/render/src/video/index.js';
import { RENDERABLE_FORMATS } from '../packages/render/src/image/formatSlides.js';

console.log(`${'post type'.padEnd(17)} ${'media'.padEnd(9)} ${'channel'.padEnd(12)} renderer`);
console.log('-'.repeat(70));
for (const id of POST_TYPES) {
  const pt = POST_TYPE_CATALOG[id] as unknown as { id: string; media: string; channel: string };
  let renderer = '?';
  if (pt.media === 'video') renderer = `videoForFormat (${VIDEO_FORMATS.length} formats)`;
  else if (pt.media === 'carousel') renderer = `slidesForFormat (${RENDERABLE_FORMATS.length} formats)`;
  else if (pt.media === 'image') renderer = 'still templates';
  else if (pt.media === 'text') renderer = 'caption only — NO template layer';
  console.log(`${pt.id.padEnd(17)} ${pt.media.padEnd(9)} ${pt.channel.padEnd(12)} ${renderer}`);
}
console.log(`\n${POST_FORMATS.length} formats; ${POST_FORMATS.filter((f) => POST_FORMAT_CATALOG[f]).length} in catalogue`);
