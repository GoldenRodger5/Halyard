/**
 * The owner's review page for a batch of runs: each video (a 540p preview), its median
 * viewer-review scores against the posting bar, the three individual reviews, notes,
 * the TikTok caption and the sources. Written to runs/<date>/review/ for publishing.
 *
 * The owner's own yes/no is the real gate; this page is how they give it quickly.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { POST_BAR, type Critique } from './critique.js';
import { REPO_ROOT } from './runContext.js';
import type { StudioRecord } from './studio.js';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const KEYS = ['stop', 'stay', 'engage', 'human'] as const;
const LABEL = { stop: 'Stops the scroll', stay: 'Watches to the end', engage: 'Comments or saves', human: 'Looks made by a person' };

export function buildReviewPage(runDirs: string[], opts: { title: string; outDir: string }): string {
  const out = opts.outDir;
  mkdirSync(path.join(out, 'v'), { recursive: true });
  const cards: string[] = [];
  for (const dir of runDirs) {
    const r = JSON.parse(readFileSync(path.join(dir, 'record.json'), 'utf8')) as StudioRecord & { series?: { name: string } };
    const cf = path.join(dir, 'critique.json');
    const c = existsSync(cf) ? (JSON.parse(readFileSync(cf, 'utf8')) as Critique) : null;
    const id = r.id;
    const video = path.resolve(REPO_ROOT, r.outputs.video!);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vf', 'scale=540:-2', '-c:v', 'libx264', '-crf', '27', '-preset', 'medium', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', path.join(out, 'v', `${id}.mp4`)]);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-ss', '0.4', '-i', video, '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '4', path.join(out, 'v', `${id}.jpg`)]);
    const rows = c
      ? KEYS.map((k) => {
          const v = c.scores[k];
          const ok = v >= POST_BAR[k];
          const dots = (c.samples ?? []).map((s) => `<span class="dot" style="left:${(((s.scores[k] - 1) / 9) * 100).toFixed(1)}%"></span>`).join('');
          return `<div class="score"><div class="score-head"><span>${LABEL[k]}</span><b class="${ok ? 'ok' : 'under'}">${v}</b></div><div class="track" role="img" aria-label="${LABEL[k]}: median ${v} of 10, bar ${POST_BAR[k]}"><span class="fill ${ok ? 'ok' : 'under'}" style="width:${v * 10}%"></span><span class="bar" style="left:${POST_BAR[k] * 10}%"></span>${dots}</div></div>`;
        }).join('')
      : '<p class="leave">Not reviewed yet.</p>';
    const notes = c ? [...(c.cringe ?? []).slice(0, 2), ...c.problems.slice(0, 3)].map((n) => `<li>${esc(n)}</li>`).join('') : '';
    const srcs = (r.sources ?? []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></li>`).join('');
    const verdict = c ? (c.verdict === 'post' ? '<span class="pill ok">Ready to post</span>' : '<span class="pill under">Revise</span>') : '';
    cards.push(`<article class="reel" id="${esc(id)}"><video controls playsinline preload="metadata" poster="v/${esc(id)}.jpg" src="v/${esc(id)}.mp4"></video><div class="body"><p class="series">${esc(r.series?.name ?? r.format)} ${verdict}</p><h2>${esc(r.summary)}</h2><div class="scores">${rows}</div>${c ? `<p class="impression">“${esc(c.first_impression)}”</p><p class="leave">Would stop watching: <span>${esc(c.would_leave_at)}</span></p><details><summary>Reviewer notes</summary><ul>${notes}</ul></details>` : ''}<details><summary>TikTok caption</summary><pre>${esc(r.posts.tiktok?.text ?? Object.values(r.posts)[0]?.text ?? '')}</pre></details><details><summary>Sources (${(r.sources ?? []).length})</summary><ul class="src">${srcs}</ul></details></div></article>`);
  }
  const page = `<title>${esc(opts.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Inter:wght@400;600&display=swap">
<style>
/* A contact sheet of vertical reels, each with its review scorecard. RecipeFix's video system: paper, ink, stamp red. */
:root{--bg:#F1ECE4;--panel:#FBF8F3;--ink:#1B1410;--muted:#6A5D50;--line:#DED4C6;--red:#B8322A;--green:#17804A;--track:#E6DDD0;--display:'Instrument Serif',Georgia,serif;--body:Inter,system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#16110E;--panel:#211A16;--ink:#F3ECE3;--muted:#B5A795;--line:#3A302A;--red:#E0645A;--green:#3DBA78;--track:#2F2621;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#16110E;--panel:#211A16;--ink:#F3ECE3;--muted:#B5A795;--line:#3A302A;--red:#E0645A;--green:#3DBA78;--track:#2F2621;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5}
.wrap{max-width:1180px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:32px 56px}
h1{font-family:var(--display);font-weight:400;font-size:clamp(34px,5vw,52px);line-height:1;margin:0 0 10px;text-wrap:balance}
header p{max-width:68ch;margin:0 0 8px;color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,540px),1fr));gap:22px;margin-top:24px}
.reel{display:grid;grid-template-columns:minmax(0,200px) minmax(0,1fr);gap:18px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px}
.reel video{width:100%;aspect-ratio:9/16;border-radius:10px;background:#000;max-width:100%}
.body{min-width:0;display:flex;flex-direction:column;gap:10px}
.series{margin:0;font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pill{letter-spacing:.06em;padding:2px 8px;border-radius:99px;color:var(--panel)} .pill.ok{background:var(--green)} .pill.under{background:var(--red)}
h2{font-family:var(--display);font-weight:400;font-size:27px;line-height:1.05;margin:0;text-wrap:balance}
.scores{display:grid;gap:8px}.score-head{display:flex;justify-content:space-between;font-size:12.5px;color:var(--muted)}
.score-head b{font-variant-numeric:tabular-nums;font-size:14px} b.ok{color:var(--green)} b.under{color:var(--red)}
.track{position:relative;height:8px;border-radius:4px;background:var(--track)}
.fill{position:absolute;inset:0 auto 0 0;border-radius:4px;opacity:.85}.fill.ok{background:var(--green)}.fill.under{background:var(--red)}
.bar{position:absolute;top:-3px;width:2px;height:14px;background:var(--ink)}
.dot{position:absolute;top:1px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--ink);opacity:.55}
.impression{margin:2px 0 0;font-size:14px}.leave{margin:0;font-size:13px;color:var(--muted)}.leave span{color:var(--ink)}
details{border-top:1px solid var(--line);padding-top:6px} summary{cursor:pointer;font-size:13px;font-weight:600}
summary:focus-visible,a:focus-visible,video:focus-visible{outline:2px solid var(--red);outline-offset:2px}
details ul{margin:6px 0 0;padding-left:18px;font-size:13px;color:var(--muted)} pre{white-space:pre-wrap;font:13px/1.45 var(--body);margin:6px 0 0;color:var(--muted)} .src a{color:var(--ink)}
@media (max-width:560px){.reel{grid-template-columns:1fr}.reel video{max-width:260px;justify-self:center}}
</style>
<div class="wrap"><header><h1>${esc(opts.title)}</h1>
<p>Each video is scored by three independent viewer reviews. The bar shows the median, the dark tick is the posting bar (${KEYS.map((k) => POST_BAR[k]).join(' / ')}), and the dots are the individual reviews.</p>
<p>Every on-screen claim traces to the sources under each video. Nothing here has been posted.</p></header>
<div class="grid">${cards.join('')}</div></div>`;
  writeFileSync(path.join(out, 'index.html'), page);
  return path.join(out, 'index.html');
}
