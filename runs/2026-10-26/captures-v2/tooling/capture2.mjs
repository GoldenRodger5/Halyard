/**
 * RecipeFix capture v2 (commit e68b1404), phone 390x844 CSS @ DPR 3 (1170x2532 device px).
 * Uses the UNMODIFIED harness backend from journey-capture.mjs (a copy of
 * scripts/journey.mjs @ e68b1404 with only import paths / ROOT repointed).
 *
 *   node capture2.mjs --mode=explore|result|method|cook|servings-probe|shots --out DIR
 *
 * Video = CDP Page.startScreencast frames (Chromium compositor output at device px),
 * Chrome launched with --window-size=390,844 --force-device-scale-factor=3.
 * Every frame is written with its compositor timestamp; marks are logged in the
 * same clock so clips can be cut exactly afterwards (assemble.py).
 */
import { chromium } from "/Users/isaacmineo/PROJECT_2025/recipe-fix-capture-e68b1404/node_modules/playwright-core/index.mjs";
import { loadFixtures, makeBackend, wire, pacingShim } from "./journey-capture.mjs";
import { mkdirSync, writeFileSync } from "fs";
import { writeFile } from "fs/promises";
const pendingWrites = [];
import { join } from "path";

const arg = (n, d) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const MODE = arg("mode", "explore");
const BASE = arg("base", "http://127.0.0.1:8532");
const OUT = arg("out", "./out");
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FMT = process.env.SC_FORMAT || "png";
mkdirSync(OUT, { recursive: true });
const VIDEO = ["result", "method", "cook", "servings-probe"].includes(MODE) && process.env.NO_VIDEO !== "1";

const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const fx = await loadFixtures();
// Belt and braces: even if a request slipped past the in-process routes, these hosts cannot resolve.
const RESOLVER = "MAP *.supabase.co 0.0.0.0, MAP *.supabase.in 0.0.0.0, MAP *.openai.com 0.0.0.0, MAP recipefix.app 0.0.0.0, MAP *.recipefix.app 0.0.0.0, MAP *.posthog.com 0.0.0.0, MAP *.googleapis.com 0.0.0.0, MAP generativelanguage.googleapis.com 0.0.0.0, MAP *.lovable.app 0.0.0.0, MAP *.lovable.dev 0.0.0.0";
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ["--window-size=390,844", "--force-device-scale-factor=3", `--host-resolver-rules=${RESOLVER}`],
});
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: SAFARI_UA,
  reducedMotion: "no-preference", colorScheme: "light", serviceWorkers: "block",
});
const be = makeBackend(fx, { base: BASE });
be.fx = fx;
const events = { console: [], pageerrors: [], harnessAborts: [], allRequests: [], externalRequests: [], blockedExternal: [], notes: [] };
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
 * Guard, registered FIRST so it runs LAST (Playwright runs routes in reverse
 * registration order): anything that is not the local app or Google Fonts and
 * was not fulfilled by the harness (including a *.supabase.co request the
 * harness fell back on) is aborted and logged.
 */
await ctx.route((u) => {
  const h = u.hostname;
  return !(h === "127.0.0.1" || h === "localhost" || h === "fonts.googleapis.com" || h === "fonts.gstatic.com");
}, (route) => { events.blockedExternal.push(route.request().url().slice(0, 200)); return route.abort(); });
await wire(ctx, be, rec);

const page = await ctx.newPage();
const T0 = Date.now() / 1000;
const now = () => Date.now() / 1000;
const marks = [];
const mark = (label, extra) => { const m = { t: +(now() - T0).toFixed(3), wall: now(), label, ...(extra || {}) }; marks.push(m); return m; };

let cdp = null; const frameLog = [];
const FRAMES = join(OUT, "frames");
if (VIDEO) {
  mkdirSync(FRAMES, { recursive: true });
  cdp = await ctx.newCDPSession(page);
  cdp.on("Page.screencastFrame", (f) => {
    // Ack FIRST so Chromium can produce the next frame while this one is written (async).
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    const name = `f${String(frameLog.length).padStart(5, "0")}.${FMT === "png" ? "png" : "jpg"}`;
    frameLog.push({ name, ts: f.metadata.timestamp, w: f.metadata.deviceWidth, h: f.metadata.deviceHeight, sy: f.metadata.scrollOffsetY });
    pendingWrites.push(writeFile(join(FRAMES, name), Buffer.from(f.data, "base64")));
  });
  await cdp.send("Page.startScreencast", { format: FMT, quality: 100, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
}
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") events.console.push({ t: +(now() - T0).toFixed(2), type: m.type(), text: m.text().slice(0, 300) }); });
page.on("pageerror", (e) => events.pageerrors.push({ t: +(now() - T0).toFixed(2), text: String(e).slice(0, 300) }));
page.on("request", (r) => {
  const u = new URL(r.url());
  events.allRequests.push(`${r.method()} ${u.host}${u.pathname}`.slice(0, 160));
  if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") events.externalRequests.push(`${r.method()} ${u.host}${u.pathname}`.slice(0, 160));
});
page.on("requestfinished", async (r) => {
  const u = new URL(r.url());
  if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return;
  // Anything external that FINISHED was fulfilled by the harness (no socket) - record which.
  events.notes.push(`fulfilled-in-process: ${r.method()} ${u.host}${u.pathname}`.slice(0, 160));
});

async function tap(loc) {
  const n = await loc.count().catch(() => 0);
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (await el.isVisible().catch(() => false)) {
      await el.scrollIntoViewIfNeeded().catch(() => {});
      await el.tap({ timeout: 5000 }).catch(async () => { await el.click({ timeout: 3000 }); });
      return el;
    }
  }
  return null;
}
const role = (r, name, exact = false) => page.getByRole(r, { name, exact });

/*
 * Scrolling is recorded FRAME-STEPPED, not in real time. Measured on this
 * machine: the page itself scrolls at a clean 60 fps (134 rAFs over 2.2 s, no
 * gap > 25 ms), but CDP screencast at 1170x2532 PNG drops 50-133 ms of frames
 * during a scroll (every changed pixel is re-encoded), which reads as judder.
 * So a scroll is rendered as N = ms*60/1000 positions on the same eased curve:
 * set the position, wait two rAFs, Page.captureScreenshot (compositor surface,
 * device px). Those frames go into the clip at exactly 60 fps. Holds, taps and
 * CSS transitions stay real-time screencast segments.
 */
const segs = []; // {type:"rt", w0, w1} | {type:"step", frames:[...], w0, w1}
let rtOpen = now();
const stepDir = join(OUT, "stepped");
let stepN = 0;
const STEPPED = VIDEO && process.env.STEPPED !== "0";
async function smoothTo(y, ms, scroller = null) {
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const setup = await page.evaluate(({ y, scroller }) => {
    const el = scroller ? document.querySelector(scroller) : null;
    const cur = el ? el.scrollTop : scrollY;
    const max = el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - innerHeight;
    return { from: cur, to: Math.max(0, Math.min(max, y)) };
  }, { y, scroller });
  const n = Math.max(2, Math.round((ms / 1000) * 60));
  const frames = []; const tomatoFrames = [];
  const w0 = now();
  if (STEPPED) { segs.push({ type: "rt", w0: rtOpen, w1: w0 }); mkdirSync(stepDir, { recursive: true }); }
  for (let i = 1; i <= n; i++) {
    const pos = setup.from + (setup.to - setup.from) * ease(i / n);
    const vis = await page.evaluate(async ({ pos, scroller }) => {
      const el = scroller ? document.querySelector(scroller) : null;
      if (el) el.scrollTop = pos; else scrollTo(0, pos);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const tom = [...document.querySelectorAll("li")].find((e) => /1½ \(14\.5-oz\) can crushed tomatoes/.test(e.textContent || "") && (e.textContent || "").length < 200);
      if (!tom) return false; const b = tom.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight && b.width > 0;
    }, { pos, scroller });
    if (vis) tomatoFrames.push(i - 1);
    if (STEPPED) {
      const shot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
      const name = `s${String(stepN++).padStart(5, "0")}.png`;
      pendingWrites.push(writeFile(join(stepDir, name), Buffer.from(shot.data, "base64")));
      frames.push(name);
    } else {
      await sleep(1000 / 60);
    }
  }
  const w1 = now();
  if (STEPPED) { segs.push({ type: "step", frames, w0, w1, tomatoFrames }); rtOpen = now(); }
  const endVisible = await tomatoVisible();
  return { spans: [], tomatoFrames, n, stepped: STEPPED, endVisible, w0, w1 };
}
const tomatoVisible = () => page.evaluate(() => {
  const tom = [...document.querySelectorAll("li")].find((e) => /1½ \(14\.5-oz\) can crushed tomatoes/.test(e.textContent || "") && (e.textContent || "").length < 200);
  if (!tom) return null; const b = tom.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight;
});

/** Height of fixed/sticky chrome at top and bottom of the viewport. */
const chrome = () => page.evaluate(() => {
  const els = [];
  for (const e of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(e);
    if (cs.position !== "fixed" && cs.position !== "sticky") continue;
    const b = e.getBoundingClientRect();
    if (b.height < 10 || b.width < 200 || b.height > 300 || cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
    els.push({ top: b.top, bottom: b.bottom });
  }
  let top = 0, bottom = innerHeight;
  // Chain top bars (header, then a sticky sub-bar directly under it).
  for (let changed = true; changed;) { changed = false; for (const b of els) if (b.top <= top + 2 && b.bottom > top && b.bottom < innerHeight / 2) { top = b.bottom; changed = true; } }
  for (let changed = true; changed;) { changed = false; for (const b of els) if (b.bottom >= bottom - 2 && b.top < bottom && b.top > innerHeight / 2) { bottom = b.top; changed = true; } }
  return { top, bottom };
});

/** Step <li> + its note for "Step N" (1-based) in the Method list. */
async function stepBoxes(re) {
  return page.evaluate(({ src }) => {
    const re = new RegExp(src);
    const notes = [...document.querySelectorAll("li")].filter((li) => /RecipeFix changed this step/.test(li.textContent || ""));
    const li = notes.find((n) => re.test(n.textContent || ""));
    if (!li) return null;
    const note = [...li.querySelectorAll("*")].filter((e) => /^RecipeFix changed this step/.test((e.textContent || "").trim())).map((e) => e.closest("div,p,aside") || e).pop();
    // The note box = smallest ancestor of the "RecipeFix changed this step" text that has a background.
    let box = li.querySelector("*");
    const label = [...li.querySelectorAll("span")].find((s) => (s.textContent || "").trim() === "RecipeFix changed this step");
    let n = label; while (n && n !== li) { const bg = getComputedStyle(n).backgroundColor; if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") break; n = n.parentElement; }
    box = n && n !== li ? n : label?.parentElement;
    const r = (b) => ({ x: b.left, y: b.top, w: b.width, h: b.height, docY: b.top + scrollY });
    return { step: r(li.getBoundingClientRect()), note: r(box.getBoundingClientRect()), stepText: (li.textContent || "").slice(0, 160) };
  }, { src: re.source });
}
const STEPS = [
  { key: "step4_reduce_tomato_sauce", re: /Reduce the Tomato Sauce/ },
  { key: "step5_broil_marinated_chicken", re: /Broil the Marinated Chicken/ },
  { key: "step6_finish_creamy_sauce", re: /Finish the Creamy Sauce/ },
];
/** Document Y that frames the step block between the chrome, biased to sit just under the top chrome. */
async function frameStepY(re) {
  const b = await stepBoxes(re); const c = await chrome();
  const avail = c.bottom - c.top;
  const blockH = b.step.h;
  const gap = Math.max(16, Math.min(60, (avail - blockH) / 2));
  return { y: b.step.docY - c.top - gap, fits: blockH <= avail - 16, blockH, avail, chrome: c };
}

const swappedRow = (re) => page.locator("li[data-change='swapped']").filter({ hasText: re }).first();

async function toResult({ video }) {
  await page.goto(BASE + "/?home", { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await sleep(900);
  mark("landing");
  const input = page.getByRole("textbox", { name: "Search recipes or paste a recipe link" }).first();
  await input.fill(be.originalUrl(be.tikka));
  await sleep(300);
  await tap(role("button", "Dairy-Free", true)); await sleep(300);
  await tap(role("button", "More servings")); await sleep(300);
  await tap(role("button", "More servings")); await sleep(300);
  await input.scrollIntoViewIfNeeded();
  await sleep(500);
  mark("composer-filled");
  await tap(role("button", /^Adapt recipe/));
  mark("adapt-tapped");
  // Watch for the first moment the result card's title exists in the DOM (in-page clock).
  const appear = await page.evaluate(async () => {
    const t0 = Date.now();
    return await new Promise((res) => {
      let sawWorking = null;
      const check = () => {
        const working = /Usually about 20 seconds/.test(document.body.innerText || "");
        if (working && !sawWorking) { sawWorking = Date.now() / 1000; window.__sawWorking = sawWorking; }
        const done = !!sawWorking && !working &&  !!document.querySelector("li[data-change='swapped'] [data-ingredient-row]") && [...document.querySelectorAll("li")].some((li) => /RecipeFix changed this step/.test(li.textContent || ""));
        if (done) return res({ wall: Date.now() / 1000, waited: Date.now() - t0, workingWall: sawWorking });
        if (Date.now() - t0 > 40000) return res(null);
        requestAnimationFrame(check);
      };
      check();
    });
  });
  if (!appear) throw new Error("result never rendered");
  marks.push({ t: +(appear.workingWall - T0).toFixed(3), wall: appear.workingWall, label: "working-state-first-seen" });
  marks.push({ t: +(appear.wall - T0).toFixed(3), wall: appear.wall, label: "result-in-dom (first rAF: working card gone, swapped rows + step notes present)" });
}

const out = { mode: MODE, commit: "e68b1404", clipMarks: marks, readable: {}, tomato: [], dom: {}, stills: {} };

await toResult({ video: VIDEO });

if (MODE === "explore") {
  await sleep(1500);
  out.dom.chrome = await chrome();
  out.dom.scrollTop = await page.evaluate(() => scrollY);
  out.dom.swappedRows = await page.evaluate(() => [...document.querySelectorAll("li[data-change]")].map((li) => ({ change: li.dataset.change, text: (li.textContent || "").slice(0, 100), btn: !!li.querySelector("button[data-ingredient-row]") })));
  out.dom.buttons = await page.evaluate(() => [...document.querySelectorAll("button, a")].filter((b) => b.offsetParent).map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim().slice(0, 50)).filter(Boolean));
  for (const s of STEPS) out.dom[s.key] = await stepBoxes(s.re);
  out.dom.summary = await page.evaluate(() => [...document.querySelectorAll("p,div,span")].filter((e) => /^What RecipeFix changed/.test((e.textContent || "").trim())).map((e) => (e.textContent || "").trim().slice(0, 200)).pop());
  await page.screenshot({ path: join(OUT, "explore-top.png") });
  await page.screenshot({ path: join(OUT, "explore-full.png"), fullPage: true });
  const row = swappedRow(/coconut yogurt/i);
  out.dom.yogurtRowCount = await row.count();
  if (await row.count()) {
    await row.scrollIntoViewIfNeeded(); await sleep(300);
    await page.screenshot({ path: join(OUT, "explore-yogurt-before.png") });
    await row.locator("button[data-ingredient-row]").tap();
    await sleep(800);
    await page.screenshot({ path: join(OUT, "explore-yogurt-after.png") });
    out.dom.yogurtExpanded = await row.evaluate((li) => ({ expanded: li.querySelector("button")?.getAttribute("aria-expanded"), text: li.textContent }));
  }
  // Cook buttons
  out.dom.cookButtons = await page.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /cook/i.test(b.textContent || b.getAttribute("aria-label") || "")).map((b) => ({ t: (b.textContent || "").trim(), aria: b.getAttribute("aria-label"), vis: !!b.offsetParent, y: b.getBoundingClientRect().top + scrollY, disabled: b.disabled })));
}

if (MODE === "servings-probe") {
  await sleep(1200);
  await page.evaluate(() => scrollTo(0, 0)); await sleep(500);
  const before = await page.evaluate(() => [...document.querySelectorAll("li[data-change]")].slice(0, 4).map((l) => (l.textContent || "").slice(0, 60)));
  await page.screenshot({ path: join(OUT, "servings-before.png") });
  const more = await tap(role("button", /more servings|increase servings/i));
  mark("servings-plus-tapped", { found: !!more });
  await sleep(500);
  await page.screenshot({ path: join(OUT, "servings-0.5s.png") });
  await sleep(2500);
  await page.screenshot({ path: join(OUT, "servings-3s.png") });
  const after = await page.evaluate(() => [...document.querySelectorAll("li[data-change]")].slice(0, 4).map((l) => (l.textContent || "").slice(0, 60)));
  const toasts = await page.evaluate(() => [...document.querySelectorAll("[role=status],[role=alert],li[data-sonner-toast],[data-radix-toast-viewport] *")].map((e) => (e.textContent || "").trim()).filter(Boolean).slice(0, 6));
  out.dom.servingsProbe = { before, after, toasts, rescaleCalls: be.log.filter((l) => /rescale/.test(JSON.stringify(l))) };
}

if (MODE === "result") {
  // Let the result settle in frame (hero photo: skeleton while preview-recipe answers, then a 300 ms fade), then scroll to the coconut-yogurt row, tap it, hold.
  const photo = await page.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const img = document.querySelector("[data-recipe-hero] img");
      if (img && img.complete && getComputedStyle(img).opacity === "1") return { wall: Date.now() / 1000, src: img.getAttribute("src") };
      await new Promise((r) => setTimeout(r, 16));
    }
    return null;
  });
  if (photo) marks.push({ t: +(photo.wall - T0).toFixed(3), wall: photo.wall, label: "hero-photo-fully-visible", src: photo.src });
  await sleep(1300);
  mark("result-held");
  const row = swappedRow(/coconut yogurt/i);
  const c = await chrome();
  const rb = await row.evaluate((li) => { const b = li.getBoundingClientRect(); return { docY: b.top + scrollY, h: b.height }; });
  // Put the row ~40% down the usable area so the opened card has room under it.
  const target = rb.docY - c.top - (c.bottom - c.top) * 0.35;
  mark("scroll-to-yogurt-start");
  const s = await smoothTo(target, 2200);
  out.tomato.push({ wall0: s.w0, wall1: s.w1, n: s.n, tomatoFrameIdx: s.tomatoFrames });
  mark("scroll-to-yogurt-end", { tomatoOnScreenAtRest: s.endVisible, rafLongGaps: s.rafLongGaps, rafCount: s.rafCount });
  await sleep(900);
  mark("tap-yogurt-row");
  await row.locator("button[data-ingredient-row]").tap();
  await sleep(450);
  mark("was-card-open");
  await sleep(2400);
  out.dom.yogurtExpanded = await row.evaluate((li) => ({ expanded: li.querySelector("button")?.getAttribute("aria-expanded"), text: (li.textContent || "").slice(0, 400) }));
  out.tomato_at_end = await tomatoVisible();
  mark("end");
}

if (MODE === "method") {
  await sleep(1000);
  const c = await chrome();
  // Off-clip: jump so step 4 is framed (title + instruction + note), let it settle, then the clip starts.
  const f4 = await frameStepY(STEPS[0].re);
  await page.evaluate((y) => scrollTo(0, y), f4.y); await sleep(1500);
  out.tomato_at_clip_start = await tomatoVisible();
  for (const [i, s] of STEPS.entries()) {
    if (i > 0) {
      const f = await frameStepY(s.re);
      mark(`scroll-to-${s.key}-start`);
      const sc = await smoothTo(f.y, 1300);
      out.tomato.push({ wall0: sc.w0, wall1: sc.w1, n: sc.n, tomatoFrameIdx: sc.tomatoFrames });
    }
    const b = await stepBoxes(s.re);
    mark(`${s.key}-held`, { stepBox_css: b.step, noteBox_css: b.note, chrome_css: c, tomatoVisible: await tomatoVisible() });
    await sleep(i === STEPS.length - 1 ? 2400 : 2500);
  }
  mark("end");
}

if (MODE === "cook") {
  await sleep(1200);
  mark("result-held");
  const cook = page.getByRole("button", { name: /^cook$/i }).first();
  const c = await chrome();
  const cb = await cook.evaluate((e) => { const b = e.getBoundingClientRect(); return { docY: b.top + scrollY, h: b.height }; });
  // Bring the Cook button clear of the bottom tab bar (it sits under it at scrollY 0).
  const sc = await smoothTo(Math.max(0, cb.docY + cb.h - c.bottom + 220), 1100);
  out.tomato.push({ wall0: sc.w0, wall1: sc.w1, n: sc.n, tomatoFrameIdx: sc.tomatoFrames });
  mark("cook-button-in-view");
  await sleep(600);
  mark("tap-cook");
  await cook.tap();
  await page.getByRole("button", { name: /^Start cooking/ }).first().waitFor({ state: "visible", timeout: 8000 });
  mark("cook-intro-visible (Ready to cook)");
  await sleep(1400);
  mark("tap-start-cooking");
  await page.getByRole("button", { name: /^Start cooking/ }).first().tap();
  await sleep(500);
  mark("step1-visible");
  await sleep(1000);
  mark("tap-next (step 1 'Gather your ingredients' has no timer)");
  await page.getByRole("button", { name: /^Next/ }).last().tap();
  await sleep(700);
  mark("step2-visible");
  out.dom.step2Heading = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3")].map((h) => (h.textContent || "").trim()).filter(Boolean).slice(0, 6));
  const timerBtn = page.getByRole("button", { name: /Start\s+\d+:\d+\s+timer/ }).first();
  out.dom.timerCount = await timerBtn.count();
  if (await timerBtn.count()) {
    const inView = await timerBtn.evaluate((e) => { const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, ih: innerHeight }; });
    out.dom.timerButtonBox = inView;
    await sleep(800);
    // The timer chip sits below the step text: scroll Cook Mode's own scroller smoothly until it clears the footer.
    mark("scroll-to-timer-start");
    const plan = await timerBtn.evaluate((btn) => {
      let sc = btn.parentElement; while (sc && !(sc.scrollHeight > sc.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (!sc) return null;
      sc.setAttribute("data-cap-scroller", "");
      const footer = [...document.querySelectorAll("button")].find((b) => /^Next/.test((b.textContent || "").trim()) && b.offsetParent);
      const limit = footer ? footer.getBoundingClientRect().top - 24 : innerHeight - 120;
      const group = btn.closest("[aria-label='Cook timer controls']") || btn;
      return { to: sc.scrollTop + Math.max(0, group.getBoundingClientRect().bottom - limit), scroller: sc.className.slice(0, 80) };
    });
    out.dom.timerScroll = plan;
    const ts = await smoothTo(plan.to, 1000, "[data-cap-scroller]");
    out.steppedScrolls = [...(out.steppedScrolls || []), { what: "cook-timer", n: ts.n }];
    mark("scroll-to-timer-end");
    await sleep(600);
    mark("tap-start-timer", { timerLabel: await timerBtn.textContent() });
    await timerBtn.tap();
    await sleep(3000);
    mark("timer-running-hold-end", { readout: await page.evaluate(() => [...document.querySelectorAll("[aria-label='Cook timer controls'] button")].map((b) => (b.textContent || "").trim()).join(" | ")) });
  } else {
    await sleep(3000);
  }
  await page.screenshot({ path: join(OUT, "cook-end.png") }).catch(() => {});
  mark("end");
}

if (MODE === "shots") {
  await sleep(1500);
  const shot = async (name, extra) => {
    const p = join(OUT, name);
    await page.screenshot({ path: p });
    out.stills[name] = { scrollY: await page.evaluate(() => scrollY), chrome: await chrome(), tomatoVisible: await tomatoVisible(), ...extra };
  };
  const X3 = (b) => b && ({ x: Math.round(b.x * 3), y: Math.round(b.y * 3), w: Math.round(b.w * 3), h: Math.round(b.h * 3) });
  // 1) header + "What RecipeFix changed" line
  const hdr = await page.evaluate(() => {
    const t = [...document.querySelectorAll("h1,h2")].find((e) => /Chicken Tikka Masala/.test(e.textContent || ""));
    const sum = [...document.querySelectorAll("p,div,span")].filter((e) => /^What RecipeFix changed/.test((e.textContent || "").trim()) && /rewritten|swapped/.test(e.textContent || "")).pop();
    return { titleDocY: t.getBoundingClientRect().top + scrollY, sumDocBottom: sum.getBoundingClientRect().bottom + scrollY, sumText: (sum.textContent || "").trim() };
  });
  const c0 = await chrome();
  let y = hdr.titleDocY - c0.top - 40;
  if (hdr.sumDocBottom - y > c0.bottom - 30) y = hdr.sumDocBottom - c0.bottom + 30;
  await page.evaluate((y) => scrollTo(0, y), y); await sleep(700);
  const hb = await page.evaluate(() => {
    const t = [...document.querySelectorAll("h1,h2")].find((e) => /Chicken Tikka Masala/.test(e.textContent || ""));
    const sum = [...document.querySelectorAll("p,div,span")].filter((e) => /^What RecipeFix changed/.test((e.textContent || "").trim()) && /rewritten|swapped/.test(e.textContent || "")).pop();
    const r = (b) => ({ x: b.left, y: b.top, w: b.width, h: b.height });
    return { title: r(t.getBoundingClientRect()), summary: r(sum.getBoundingClientRect()) };
  });
  await shot("still-1-result-header-what-changed.png", { summaryText: hdr.sumText, titleBox_px: X3(hb.title), summaryBox_px: X3(hb.summary) });
  // 2-4) steps
  for (const [i, s] of STEPS.entries()) {
    const f = await frameStepY(s.re);
    await page.evaluate((y) => scrollTo(0, y), f.y); await sleep(700);
    const b = await stepBoxes(s.re);
    await shot(`still-${i + 2}-${s.key.replace(/_/g, "-")}.png`, { fitsInView: f.fits, stepBox_px: X3(b.step), noteBox_px: X3(b.note), stepText: b.stepText });
  }
  // 5-6) coconut yogurt swapped row, closed then opened
  const row = swappedRow(/coconut yogurt/i);
  const c = await chrome();
  const rb = await row.evaluate((li) => { const b = li.getBoundingClientRect(); return { docY: b.top + scrollY }; });
  await page.evaluate((y) => scrollTo(0, y), rb.docY - c.top - (c.bottom - c.top) * 0.35); await sleep(700);
  const rowBox = async () => row.evaluate((li) => { const b = li.getBoundingClientRect(); const card = li.querySelector("[aria-hidden] > div > div"); const cb = card?.getBoundingClientRect();
    const ul = li.closest("ul,ol"); const ub = ul?.getBoundingClientRect();
    return { row: { x: b.left, y: b.top, w: b.width, h: b.height }, card: cb && cb.height > 2 ? { x: cb.left, y: cb.top, w: cb.width, h: cb.height } : null, list: ub ? { x: ub.left, y: ub.top, w: ub.width, h: ub.height } : null }; });
  let rbx = await rowBox();
  await shot("still-5-swapped-coconut-yogurt-row.png", { rowBox_px: X3(rbx.row), ingredientListBox_px: X3(rbx.list) });
  await row.locator("button[data-ingredient-row]").tap(); await sleep(900);
  rbx = await rowBox();
  await shot("still-6-swapped-coconut-yogurt-row-opened.png", { rowBox_px: X3(rbx.row), wasCardBox_px: X3(rbx.card), text: await row.evaluate((li) => (li.textContent || "").slice(0, 400)) });
}

if (cdp) { await sleep(400); await cdp.send("Page.stopScreencast").catch(() => {}); await sleep(300); await Promise.all(pendingWrites); }
out.endWall = now();
if (STEPPED) segs.push({ type: "rt", w0: rtOpen, w1: out.endWall });
out.segments = segs;
out.T0 = T0;
if (VIDEO) {
  writeFileSync(join(OUT, "frames.json"), JSON.stringify(frameLog));
  out.frames = frameLog.length;
  out.firstFrameT = frameLog.length ? +(frameLog[0].ts - T0).toFixed(3) : null;
}
await ctx.close();
await browser.close();
Object.assign(out, { adaptRequests: be.state.adaptRequests, harnessLog: be.log, ...events });
writeFileSync(join(OUT, `run-${MODE}.json`), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ marks, readable: out.readable, tomato: out.tomato, dom: out.dom, stills: out.stills, console: events.console, pageerrors: events.pageerrors, blocked: events.blockedExternal, external: [...new Set(events.externalRequests)], frames: out.frames }, null, 2));
