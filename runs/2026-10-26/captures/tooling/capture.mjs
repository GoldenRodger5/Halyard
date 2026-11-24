/**
 * B-roll capture of journey 1 (first adaptation, guest) on the phone surface.
 * Uses the UNMODIFIED harness backend from journey-capture.mjs (a copy of
 * scripts/journey.mjs @ 8c44a5b4 with only import paths repointed).
 *
 *   node capture.mjs --mode=video|shots|explore --base http://127.0.0.1:8531 --out DIR
 */
import { chromium } from "/Users/isaacmineo/PROJECT_2025/recipe-fix-capture-8c44a5b4/node_modules/playwright-core/index.mjs";
import { loadFixtures, makeBackend, wire, pacingShim } from "./journey-capture.mjs";
import { mkdirSync, writeFileSync, readdirSync, renameSync } from "fs";
import { join } from "path";

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const MODE = arg("mode", "explore");
const BASE = arg("base", "http://127.0.0.1:8531");
const OUT = arg("out", "./out");
const CHROME = process.env.CHROME_PATH;
mkdirSync(OUT, { recursive: true });

const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const DSF = MODE === "shots" ? 3 : 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fx = await loadFixtures();
const CHROME_ARGS = (process.env.CHROME_ARGS || "").split(" ").filter(Boolean);
const browser = await chromium.launch({ executablePath: CHROME, args: CHROME_ARGS });
const ctxOpts = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true, userAgent: SAFARI_UA,
  reducedMotion: "no-preference", colorScheme: "light", serviceWorkers: "block",
};
/*
 * Playwright's recordVideo records at CSS-pixel size (390x844) and pads the
 * requested 780x1688 frame with grey, at ~0.7 Mbit/s VP8. So the video is taken
 * from Chromium's own compositor frames via CDP Page.startScreencast at device
 * pixels (780x1688, DSF 2) instead, and assembled with ffmpeg afterwards.
 */
const FRAMES = join(OUT, "screencast");
if (MODE === "video") mkdirSync(FRAMES, { recursive: true });
const frameLog = [];
const ctx = await browser.newContext(ctxOpts);
const be = makeBackend(fx, { base: BASE });
be.fx = fx;

const events = { console: [], pageerrors: [], harnessAborts: [], externalRequests: [], blockedExternal: [], notes: [] };
const rec = { note: (s) => events.notes.push(s), abort: (u) => events.harnessAborts.push(u) };

await ctx.addInitScript(() => {
  try {
    localStorage.setItem("recipefix-theme", "light");
    localStorage.setItem("rf_has_opened_before", "true");
    localStorage.setItem("rf-cookie-consent", "accepted");
  } catch { /* private mode */ }
});
await ctx.addInitScript(pacingShim);
/*
 * Guard (added for this capture): anything that is not the local app, the
 * harness-answered *.supabase.co, or Google Fonts is aborted and logged, so no
 * request can escape to a production backend or a model provider.
 */
await ctx.route((u) => {
  const h = u.hostname;
  return !(h === "127.0.0.1" || h === "localhost" || h.endsWith(".supabase.co") || h === "fonts.googleapis.com" || h === "fonts.gstatic.com");
}, (route) => { events.blockedExternal.push(route.request().url().slice(0, 200)); return route.abort(); });
await wire(ctx, be, rec);

const t0 = Date.now(); // video starts with the page
const page = await ctx.newPage();
let cdp = null;
if (MODE === "video") {
  cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    const name = `f${String(frameLog.length).padStart(5, "0")}.png`;
    writeFileSync(join(FRAMES, name), Buffer.from(f.data, "base64"));
    frameLog.push({ name, ts: f.metadata.timestamp, w: f.metadata.deviceWidth, sy: f.metadata.scrollOffsetY });
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "png", maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 });
}
const vt = () => +((Date.now() - t0) / 1000).toFixed(2);
page.on("console", (m) => { if (m.type() === "error") events.console.push({ t: vt(), text: m.text().slice(0, 300) }); });
page.on("pageerror", (e) => events.pageerrors.push({ t: vt(), text: String(e).slice(0, 300) }));
page.on("request", (r) => {
  const h = new URL(r.url()).hostname;
  if (h !== "127.0.0.1" && h !== "localhost") events.externalRequests.push(`${r.method()} ${h}${new URL(r.url()).pathname}`.slice(0, 160));
});

async function tap(...locs) {
  for (const loc of locs) {
    const n = await loc.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = loc.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        await el.click({ timeout: 5000 }).catch(async () => { await el.click({ timeout: 3000, force: true }); });
        await page.waitForTimeout(450);
        return el;
      }
    }
  }
  return null;
}
const role = (r, name, exact = false) => page.getByRole(r, { name, exact });

/** Eased rAF scroll to a document Y; returns intervals (in video seconds) when the tomato line was on screen. */
async function smoothTo(y, ms) {
  const r = await page.evaluate(async ({ y, ms }) => {
    const tom = [...document.querySelectorAll("li, p, span, div")].filter((e) => e.children.length === 0 || e.tagName === "LI")
      .find((e) => /1½ \(14\.5-oz\) can crushed tomatoes/.test(e.textContent || "") && (e.textContent || "").length < 120);
    const vis = () => { if (!tom) return false; const b = tom.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; };
    const from = scrollY; const max = document.documentElement.scrollHeight - innerHeight; const to = Math.max(0, Math.min(max, y));
    const start = performance.now(); const spans = []; let on = null;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    await new Promise((res) => {
      const f = (now) => {
        const t = Math.min(1, (now - start) / ms);
        scrollTo(0, from + (to - from) * ease(t));
        const v = vis();
        if (v && on === null) on = Date.now(); if (!v && on !== null) { spans.push([on, Date.now()]); on = null; }
        if (t < 1) requestAnimationFrame(f); else res();
      };
      requestAnimationFrame(f);
    });
    if (on !== null) spans.push([on, Date.now()]);
    return { spans, tomFound: !!tom, endVisible: vis() };
  }, { y, ms });
  return { ...r, spans: r.spans.map(([a, b]) => [+((a - t0) / 1000).toFixed(2), +((b - t0) / 1000).toFixed(2)]) };
}
/** Document Y that puts the step containing `re` with its top at `pad` px below the sticky chrome. */
async function stepY(re, pad = 140) {
  return page.evaluate(({ src, pad }) => {
    const re = new RegExp(src);
    const note = [...document.querySelectorAll("[data-recipefix-changed]")].find((n) => re.test(n.textContent || ""));
    if (!note) return null;
    const li = note.closest("li");
    const lb = li.getBoundingClientRect(); const nb = note.getBoundingClientRect();
    // Prefer showing the whole step; if too tall, anchor the note in the lower half.
    let y = scrollY + lb.top - pad;
    if (nb.bottom - lb.top + pad > innerHeight - 80) y = scrollY + nb.bottom - innerHeight + 90;
    return { y, liTop: scrollY + lb.top, noteTop: scrollY + nb.top, noteBottom: scrollY + nb.bottom };
  }, { src: re.source, pad });
}
/** Document Y that frames the title, the Dairy-Free / Serves row and the "What RecipeFix changed ... from 4 to 6 servings" line. */
async function headerY() {
  return page.evaluate(() => {
    const t = [...document.querySelectorAll("h1,h2")].find((e) => /Chicken Tikka Masala/.test(e.textContent || ""));
    const sum = [...document.querySelectorAll("p,div,span")].filter((e) => /^What RecipeFix changed/.test((e.textContent || "").trim())).pop();
    const tb = t.getBoundingClientRect(); const sb = sum?.getBoundingClientRect();
    let y = scrollY + tb.top - 140;
    if (sb && sb.bottom - tb.top + 140 > innerHeight - 75) y = scrollY + sb.bottom - (innerHeight - 75);
    return { y, titleTop: scrollY + tb.top, summaryBottom: sb ? scrollY + sb.bottom : null, summaryText: sum?.textContent?.trim().slice(0, 160) };
  });
}
const NOTES = [
  { key: "tomato_sauce_note", re: /Start checking at 10 minutes/ },
  { key: "broiler_note", re: /Allow two broiler batches/ },
  { key: "gentle_simmer_note", re: /keep the sauce at a gentle simmer/ },
];

const timeline = [];
const mark = (label) => timeline.push({ t: vt(), label });

// ---- journey 1, as the harness drives it (landing composer -> Adapt) ----
await page.goto(BASE + "/?home", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await sleep(MODE === "video" ? 1500 : 900);
mark("landing");
const input = page.getByRole("textbox", { name: "Search recipes or paste a recipe link" }).first();
await input.fill(be.originalUrl(be.tikka));
await sleep(500);
await tap(role("button", "Dairy-Free", true));
await sleep(300);
await tap(role("button", "More servings"));
await tap(role("button", "More servings"));
await input.scrollIntoViewIfNeeded();
await sleep(MODE === "video" ? 1500 : 300);
mark("composer-filled");
await tap(role("button", /^Adapt recipe/));
mark("adapt-tapped (working state + simulated stream)");
await page.getByText(/RecipeFix changed this step/).first().waitFor({ state: "visible", timeout: 30000 });
await page.evaluate(() => window.scrollTo(0, 0));
mark("result-visible");
await sleep(MODE === "video" ? 3200 : 1200);
mark("header-held");

const info = await page.evaluate(() => { const vp = [innerWidth, innerHeight, devicePixelRatio];
  const hdr = document.querySelector("header, [data-app-header], nav");
  const stickies = [...document.querySelectorAll("*")].filter((e) => ["sticky", "fixed"].includes(getComputedStyle(e).position) && e.getBoundingClientRect().height > 20)
    .map((e) => ({ tag: e.tagName, cls: (e.className || "").toString().slice(0, 80), top: e.getBoundingClientRect().top, h: e.getBoundingClientRect().height }));
  return { vp, url: location.href, h: document.documentElement.scrollHeight, stickies, method: document.querySelector("[data-recipe-method]")?.getBoundingClientRect().top + scrollY };
});
events.notes.push(`result page: ${JSON.stringify(info)}`);

if (MODE === "explore") {
  await page.screenshot({ path: join(OUT, "explore-top.png") });
  await page.screenshot({ path: join(OUT, "explore-full.png"), fullPage: true });
  const ys = {}; for (const n of NOTES) ys[n.key] = await stepY(n.re);
  console.log(JSON.stringify({ info, ys }, null, 2));
}

const readable = {};
if (MODE === "video") {
  // Pass the ingredient list quickly, straight to the method.
  const hy = await headerY();
  events.notes.push(`headerY: ${JSON.stringify(hy)}`);
  await smoothTo(hy.y, 1300);
  const hs = vt(); await sleep(2800); readable.header_summary = { start: hs, end: vt() };
  const first = await stepY(NOTES[0].re);
  const pass = await smoothTo(first.y, 1400);
  readable.tomato_line_spans = [...(pass.spans || [])];
  for (const n of NOTES) {
    const p = await stepY(n.re);
    const mv = await smoothTo(p.y, 1100);
    readable.tomato_line_spans.push(...mv.spans);
    const start = vt();
    await sleep(3000);
    readable[n.key] = { start, end: vt() };
  }
  await sleep(600);
  // Back to the top: header again (passes the ingredients; timed).
  const back = await smoothTo(0, 1600);
  readable.tomato_line_spans.push(...back.spans);
  const s2 = vt(); await sleep(2500);
  readable.header_return = { start: s2, end: vt() };
  mark("end");
}

if (MODE === "shots") {
  await page.screenshot({ path: join(OUT, "recipefix-adapt-a1-result-top.png") });
  const hy = await headerY();
  events.notes.push(`headerY: ${JSON.stringify(hy)}`);
  await page.evaluate((y) => window.scrollTo(0, y), hy.y); await sleep(500);
  await page.screenshot({ path: join(OUT, "recipefix-adapt-a2-result-header-dairyfree-4to6.png") });
  for (const [i, n] of NOTES.entries()) {
    const p = await stepY(n.re);
    await page.evaluate((y) => window.scrollTo(0, y), p.y);
    await sleep(500);
    await page.screenshot({ path: join(OUT, `recipefix-adapt-b${i + 1}-${n.key.replace(/_/g, "-")}.png`) });
  }
  // How a changed ingredient line is marked: the heavy cream -> coconut cream row, clipped to that row only.
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll("li")].find((e) => /coconut cream/.test(e.textContent || "") && /heavy cream|Swapped|swapped/i.test(e.textContent || "") && (e.textContent || "").length < 400);
    if (!el) return null; el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect();
    return { x: 0, y: Math.max(0, b.top - 8), width: innerWidth, height: b.height + 16 };
  });
  if (box) { await sleep(400); await page.screenshot({ path: join(OUT, "recipefix-adapt-c-swapped-ingredient-row.png"), clip: box }); }
  events.notes.push(`swapped-row clip: ${JSON.stringify(box)}`);
}

if (cdp) { await sleep(300); await cdp.send("Page.stopScreencast").catch(() => {}); await sleep(300); }
const endWall = Date.now() / 1000;
if (MODE === "video") {
  // ffmpeg concat list: each frame held until the next one (screencast only emits on change).
  const lines = [];
  frameLog.forEach((f, i) => { const next = frameLog[i + 1]?.ts ?? endWall; lines.push(`file '${f.name}'`, `duration ${Math.max(0.001, next - f.ts).toFixed(4)}`); });
  lines.push(`file '${frameLog[frameLog.length - 1].name}'`);
  writeFileSync(join(FRAMES, "concat.txt"), lines.join("\n") + "\n");
  events.notes.push(`screencast frames: ${frameLog.length}; first frame at page-time ${(frameLog[0].ts - t0 / 1000).toFixed(3)} s`);
  events.firstFrameOffset = +(frameLog[0].ts - t0 / 1000).toFixed(3);
}
const videoPath = null;
await ctx.close();
await browser.close();
if (videoPath) renameSync(videoPath, join(OUT, "recipefix-adapt-phone.webm"));
writeFileSync(join(OUT, `run-${MODE}.json`), JSON.stringify({ mode: MODE, dsf: DSF, timeline, readable, adaptRequests: be.state.adaptRequests, harnessLog: be.log, ...events }, null, 2));
console.log(JSON.stringify({ timeline, readable, console: events.console, pageerrors: events.pageerrors, blocked: events.blockedExternal, external: [...new Set(events.externalRequests)], harnessAborts: events.harnessAborts, harnessLog: be.log }, null, 2));
