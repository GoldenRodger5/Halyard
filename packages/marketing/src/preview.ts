/**
 * One static HTML page per post (QUALITY_AND_OPERATIONS §5): the media at
 * phone size with a safe-zone overlay toggle, the copy and caption, claim ids
 * with their phrasing, fact sources, asset provenance, the QA table, the
 * critique (critique.md beside the record, when it exists), cost, and the
 * knowledge commit. Self-contained; opens from disk.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface Check {
  id: string;
  passed: boolean;
  detail: string;
  problems: string[];
}

export function writePreview(dir: string, record: Record<string, unknown>): void {
  const r = record as {
    post_id: string;
    status: string;
    platform: string;
    idea: { question: string; pillar: string; canvas: { width: number; height: number } };
    publish_eligibility: { eligible: boolean; reasons: string[] };
    knowledge: { commit: string; ref: string };
    claims: Array<{ id: string; status: string; phrasing: string | null }>;
    fact_sources: Array<{ id: string; statement: string; source: string }>;
    assets: Array<{ id: string; kind: string; location: string; provenance: string; licence: string; disclosure?: string; sha256: string }>;
    files: string[];
    caption: string;
    copy_source: string;
    reviewer_edits: Array<{ path: string; model: unknown; reviewed: unknown }>;
    qa: { passed: boolean; checks: Check[]; stills?: Array<{ slide: number; role: string; passed: boolean; checks: Check[] }>; media?: { checks: Check[] } };
    cost: { run_usd: number; ledger_total_usd: number; cap_usd: number };
    safe_box?: { x0: number; y0: number; x1: number; y1: number };
    made_at: string;
  };
  const canvas = r.idea.canvas;
  const safe = r.safe_box;
  const rel = (f: string) => path.relative(dir, path.resolve(dir, '../../..', f));
  const media = r.files
    .filter((f) => /\.(png|mp4)$/.test(f))
    .map((f) => {
      const src = esc(rel(f));
      const el = f.endsWith('.mp4')
        ? `<video src="${src}" controls playsinline muted loop></video>`
        : `<img src="${src}" alt="${esc(path.basename(f))}">`;
      const overlay = safe
        ? `<div class="safe" style="left:${(safe.x0 / canvas.width) * 100}%;top:${(safe.y0 / canvas.height) * 100}%;width:${((safe.x1 - safe.x0) / canvas.width) * 100}%;height:${((safe.y1 - safe.y0) / canvas.height) * 100}%"></div>`
        : '';
      return `<figure><div class="frame" style="aspect-ratio:${canvas.width}/${canvas.height}">${el}${overlay}</div><figcaption>${esc(path.basename(f))} · <a href="${src}">full size</a></figcaption></figure>`;
    })
    .join('\n');

  const row = (c: Check, scope = '') =>
    `<tr class="${c.passed ? 'ok' : 'bad'}"><td>${c.passed ? 'PASS' : 'FAIL'}</td><td>${esc(scope)}${esc(c.id)}</td><td>${esc(c.detail)}${c.problems.length ? `<ul>${c.problems.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</td></tr>`;
  const qaRows = [
    ...r.qa.checks.map((c) => row(c)),
    ...(r.qa.stills ?? []).flatMap((s) => s.checks.map((c) => row(c, `slide ${s.slide} · `))),
    ...(r.qa.media?.checks ?? []).map((c) => row(c, 'media · ')),
  ].join('\n');

  const critiqueFile = path.join(dir, 'critique.md');
  const critique = existsSync(critiqueFile) ? readFileSync(critiqueFile, 'utf8') : 'No independent critique recorded yet.';

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(r.post_id)} preview</title>
<style>
:root{--bg:#F5EDE4;--ink:#27221E;--muted:#60554D;--accent:#A65336;--ok:#2f6b3a;--bad:#a3261b;--card:#fffaf4}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#1b1715;--ink:#f3ece6;--muted:#bcae9f;--card:#262019}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 -apple-system,Inter,system-ui,sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px}
h1{font-family:Georgia,serif;font-weight:400;margin:0 0 4px}
.status{display:inline-block;padding:2px 10px;border-radius:99px;background:${r.qa.passed ? 'var(--ok)' : 'var(--bad)'};color:#fff;font-weight:600}
.media{display:flex;gap:14px;overflow-x:auto;padding:12px 0}
figure{margin:0;flex:0 0 auto;width:min(400px,86vw)}
.frame{position:relative;width:100%;background:#000;border-radius:12px;overflow:hidden}
.frame img,.frame video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.safe{position:absolute;outline:2px dashed #00e5ff;display:none;pointer-events:none}
body.showsafe .safe{display:block}
figcaption{font-size:13px;color:var(--muted)}
section{background:var(--card);border-radius:12px;padding:16px;margin:16px 0}
table{border-collapse:collapse;width:100%;font-size:14px}td{border-top:1px solid #0002;padding:6px;vertical-align:top}
tr.bad td:first-child{color:var(--bad);font-weight:700}tr.ok td:first-child{color:var(--ok);font-weight:700}
pre{white-space:pre-wrap;font:14px/1.5 ui-monospace,monospace}
abbr{text-decoration:underline dotted;cursor:help}
</style></head><body><main>
<p class="status">${esc(r.qa.passed ? 'QA passed · unpublished' : 'QA failed')}</p>
<h1>${esc(r.post_id)}: ${esc(r.idea.question)}</h1>
<p>${esc(r.platform)} · pillar ${esc(r.idea.pillar)} · copy: ${esc(r.copy_source)} · knowledge <code>${esc(r.knowledge.commit)}</code> · made ${esc(r.made_at)}</p>
<p><label><input type="checkbox" onchange="document.body.classList.toggle('showsafe',this.checked)"> show safe zone</label></p>
<div class="media">${media}</div>
<section><h2>Caption</h2><pre>${esc(r.caption)}</pre></section>
<section><h2>Independent critique</h2><pre>${esc(critique)}</pre></section>
<section><h2>Claims cited</h2><ul>${r.claims.map((c) => `<li><abbr title="${esc(c.phrasing)}">${esc(c.id)}</abbr> · ${esc(c.status)}</li>`).join('')}</ul></section>
<section><h2>Fact sources</h2><ul>${r.fact_sources.map((f) => `<li><b>${esc(f.id)}</b>: ${esc(f.statement)} <i>(${esc(f.source)})</i></li>`).join('')}</ul></section>
<section><h2>Assets and rights</h2><ul>${r.assets.map((a) => `<li><b>${esc(a.kind)}</b> ${esc(a.id)}<br><small>${esc(a.location)} · sha256 ${esc(a.sha256.slice(0, 16))}…<br>provenance: ${esc(a.provenance)}<br>licence: ${esc(a.licence)}${a.disclosure ? `<br>disclosure: ${esc(a.disclosure)}` : ''}</small></li>`).join('')}</ul></section>
<section><h2>Automated QA</h2><table>${qaRows}</table></section>
<section><h2>Reviewer edits to model copy</h2>${r.reviewer_edits.length ? `<ul>${r.reviewer_edits.map((e) => `<li><code>${esc(e.path)}</code>: ${esc(JSON.stringify(e.model))} → ${esc(JSON.stringify(e.reviewed))}</li>`).join('')}</ul>` : '<p>None.</p>'}</section>
<section><h2>Publishing</h2><p>Eligible: <b>${r.publish_eligibility.eligible ? 'yes' : 'no'}</b></p><ul>${r.publish_eligibility.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>
<section><h2>Cost</h2><p>This run $${r.cost.run_usd.toFixed(4)} · ledger total $${r.cost.ledger_total_usd.toFixed(4)} of $${r.cost.cap_usd.toFixed(2)} cap</p></section>
</main></body></html>`;
  writeFileSync(path.join(dir, 'preview.html'), html);
}
