import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(process.cwd() + '/package.json');
const {chromium} = require('@playwright/test');
const origin = 'http://127.0.0.1:4380';
const out = '/Volumes/T9/Developer/Builds/recipefix-phase2c-20261029/evidence/gallery';
fs.mkdirSync(out, {recursive: true});
const catalog = await fetch(origin + '/catalog.json').then(r => r.json());
const browser = await chromium.launch({headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
const failures = [], playback = [];
try {
  for (const width of [360, 390]) {
    const page = await browser.newPage({viewport: {width, height: 844}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(origin);
    await page.locator('#film video').waitFor();
    await page.evaluate(async () => {
      document.querySelectorAll('img').forEach(i => {i.loading = 'eager';});
      await Promise.all([...document.images].map(i => i.decode()));
    });
    const layout = await page.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      brokenImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).length}));
    if (layout.width !== layout.scrollWidth || layout.brokenImages || errors.length) failures.push({width, layout, errors});
    const video = page.locator('#film video');
    await video.scrollIntoViewIfNeeded();
    for (const muted of [true, false]) {
      const receipt = await video.evaluate(async (v, muted) => {
        v.currentTime = 0; v.muted = muted; v.volume = 1;
        await v.play();
        await new Promise((ok, fail) => {
          v.addEventListener('ended', ok, {once: true});
          setTimeout(() => fail(Error('Full playback timeout')), 20000);
        });
        const q = v.getVideoPlaybackQuality();
        return {ended: v.ended, duration: v.duration, time: v.currentTime, muted,
          totalFramesCumulative: q.totalVideoFrames, droppedFramesCumulative: q.droppedVideoFrames};
      }, muted);
      playback.push({width, sha256: catalog.newFilm.sha256, ...receipt,
        sensoryLimit: 'Unmuted transport is not an agent hearing or taste judgment.'});
      if (!receipt.ended || receipt.duration !== 12.8) failures.push({width, muted, receipt});
    }
    for (const time of [0.5, 2.5, 4, 4.59, 4.8, 7.5, 9, 11.5, 12.5]) {
      await video.evaluate(async (v, time) => {
        await new Promise(ok => {v.addEventListener('seeked', ok, {once: true}); v.currentTime = time;});
      }, time);
      await video.screenshot({path: path.join(out, `film-${width}-${time}.png`)});
    }
    await page.screenshot({path: path.join(out, `gallery-${width}.png`), fullPage: true});
    await page.close();
  }
  const media = catalog.newFilm;
  const url = origin + '/media/' + media.sha256 + path.extname(media.path);
  const range = await fetch(url, {headers: {range: 'bytes=0-63'}});
  if (range.status !== 206 || (await range.arrayBuffer()).byteLength !== 64) failures.push('Video range delivery failed');
  if ((await fetch(origin + '/media/not-in-catalog.mp4')).status !== 404) failures.push('Uncatalogued media exposed');
  const receipt = {checkedAt: new Date().toISOString(), failures, playback,
    publicScreenshotsInFilm: false, publishingVariantsAdded: catalog.publishingVariantsAdded,
    reviewAssets: catalog.referenceAssets.length, evidenceRoot: out};
  fs.writeFileSync(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
