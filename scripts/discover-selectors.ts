/**
 * Selector discovery. Milestone 41 Part A.
 *
 * Milestone 26 was deferred because guessing selectors produces code that works
 * on nothing. This is the unblock: point Playwright at a live page, dump every
 * interactive element with everything that could identify it, and screenshot the
 * page with the candidates numbered so a human can match a selector to the thing
 * they can see.
 *
 *   pnpm exec tsx scripts/discover-selectors.ts
 *   pnpm exec tsx scripts/discover-selectors.ts --base http://localhost:3000
 *   pnpm exec tsx scripts/discover-selectors.ts --page /adapt --headed
 *   pnpm exec tsx scripts/discover-selectors.ts --after-flow adapt_and_reveal
 *
 * Writes `.discovery/<page>.json` and `.discovery/<page>.png`.
 *
 * A candidate selector is preferred in this order, which is the order of how
 * long it survives a redesign:
 *
 *   data-testid  →  a stable aria-label  →  role + accessible name  →  text
 *
 * A generated class hash is never emitted. Tailwind and CSS modules both produce
 * class names that change when anything about the build changes, and a flow
 * pinned to one is a flow that breaks silently on the next deploy.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Locator, type Page } from 'playwright';
import { FLOWS, type FlowId } from '@halyard/core';
import { runFlow } from '../apps/worker/src/capture/runFlow.js';

const DEFAULT_BASE = 'https://recipefix.app';
const DEFAULT_PAGES = ['/', '/adapt', '/recipes', '/discover', '/shopping-list'];
const OUT_DIR = path.resolve(process.cwd(), '.discovery');

export interface ElementCandidate {
  index: number;
  tag: string;
  role: string | null;
  text: string;
  testId: string | null;
  ariaLabel: string | null;
  name: string | null;
  id: string | null;
  placeholder: string | null;
  type: string | null;
  href: string | null;
  /** Class fragments that look hand-written rather than generated. */
  stableClasses: string[];
  /** The selector to actually use, chosen by the preference order. */
  selector: string;
  selectorKind: 'testid' | 'aria-label' | 'role+name' | 'id' | 'placeholder' | 'text' | 'none';
  visible: boolean;
  box: { x: number; y: number; width: number; height: number } | null;
}

export interface DiscoveryReport {
  url: string;
  path: string;
  title: string;
  capturedAt: string;
  viewport: { width: number; height: number };
  candidates: ElementCandidate[];
  /** Counts by selector kind, so the quality of the page's markup is visible. */
  summary: Record<string, number>;
  notes: string[];
}

/**
 * A class name is worth recording only if a human plausibly typed it.
 *
 * Rejects Tailwind utilities (they describe presentation, not identity), CSS
 * module hashes, styled-components classes, and anything with a run of
 * hex-looking characters.
 */
export function isStableClass(cls: string): boolean {
  if (cls.length < 3 || cls.length > 40) return false;
  if (/^(sc|css|jsx)-[a-z0-9]{5,}$/i.test(cls)) return false;
  if (/_[a-z0-9]{5,}$/i.test(cls)) return false;
  if (/[a-f0-9]{6,}/i.test(cls) && !/^[a-z-]+$/i.test(cls)) return false;
  // Tailwind utilities: a known prefix, or anything containing : / [ ] .
  if (/[:[\]/.]/.test(cls)) return false;
  if (
    /^(sm|md|lg|xl|2xl|hover|focus|active|group|dark|flex|grid|block|inline|hidden|absolute|relative|fixed|sticky|static|w|h|min|max|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|text|font|bg|border|rounded|shadow|opacity|z|overflow|cursor|select|transition|duration|ease|transform|scale|rotate|translate|items|justify|self|content|order|col|row|space|divide|ring|outline|leading|tracking|whitespace|truncate|antialiased|uppercase|lowercase|capitalize|underline|list|object|aspect|container|mx|inset|top|bottom|left|right)$/.test(
      cls,
    )
  ) {
    return false;
  }
  if (/^(sm|md|lg|xl|2xl)-/.test(cls)) return false;
  return /^[a-z][a-z0-9-]*$/i.test(cls) || /^[a-z][a-zA-Z0-9]*$/.test(cls);
}

/** CSS-escape a value for use inside an attribute selector. */
function cssQuote(value: string): string {
  return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

export function chooseSelector(
  el: Pick<
    ElementCandidate,
    'testId' | 'ariaLabel' | 'role' | 'name' | 'id' | 'placeholder' | 'text' | 'tag'
  >,
): { selector: string; selectorKind: ElementCandidate['selectorKind'] } {
  if (el.testId) {
    return { selector: `[data-testid=${cssQuote(el.testId)}]`, selectorKind: 'testid' };
  }
  // An aria-label that is really a sentence is a caption, not an identifier.
  if (el.ariaLabel && el.ariaLabel.length <= 60) {
    return { selector: `[aria-label=${cssQuote(el.ariaLabel)}]`, selectorKind: 'aria-label' };
  }
  if (el.role && el.name && el.name.length <= 60) {
    return {
      selector: `role=${el.role}[name=${cssQuote(el.name)}]`,
      selectorKind: 'role+name',
    };
  }
  // An id is stable only when it is not obviously generated, which is the same
  // test the class filter applies.
  if (el.id && isStableClass(el.id)) {
    return { selector: `#${el.id}`, selectorKind: 'id' };
  }
  if (el.placeholder) {
    return { selector: `[placeholder=${cssQuote(el.placeholder)}]`, selectorKind: 'placeholder' };
  }
  const text = el.text.trim().slice(0, 40);
  if (text) {
    return { selector: `text=${text}`, selectorKind: 'text' };
  }
  return { selector: '', selectorKind: 'none' };
}

const INTERACTIVE =
  'a, button, input, select, textarea, [role=button], [role=link], [role=tab], ' +
  '[role=checkbox], [role=switch], [role=combobox], [role=menuitem], [contenteditable=true], ' +
  '[data-testid]';

async function collect(page: Page): Promise<ElementCandidate[]> {
  const raw = await page.$$eval(INTERACTIVE, (nodes) =>
    nodes.map((node) => {
      const el = node as HTMLElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        testId:
          el.getAttribute('data-testid') ??
          el.getAttribute('data-test-id') ??
          el.getAttribute('data-test'),
        ariaLabel: el.getAttribute('aria-label'),
        id: el.getAttribute('id'),
        placeholder: el.getAttribute('placeholder'),
        type: el.getAttribute('type'),
        href: el.getAttribute('href'),
        classes: Array.from(el.classList),
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          Number(style.opacity) > 0.05,
        box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      };
    }),
  );

  return raw.map((el, i) => {
    // The accessible name, as Playwright's role engine would compute it: the
    // aria-label if present, otherwise the trimmed text.
    const name = el.ariaLabel ?? (el.text || null);
    const role =
      el.role ??
      (el.tag === 'a' ? 'link' : el.tag === 'button' ? 'button' : el.tag === 'input' ? 'textbox' : null);

    const chosen = chooseSelector({
      testId: el.testId,
      ariaLabel: el.ariaLabel,
      role,
      name,
      id: el.id,
      placeholder: el.placeholder,
      text: el.text,
      tag: el.tag,
    });

    return {
      index: i + 1,
      tag: el.tag,
      role,
      text: el.text,
      testId: el.testId,
      ariaLabel: el.ariaLabel,
      name,
      id: el.id,
      placeholder: el.placeholder,
      type: el.type,
      href: el.href,
      stableClasses: el.classes.filter(isStableClass),
      visible: el.visible,
      box: el.box,
      ...chosen,
    };
  });
}

/**
 * Number every visible candidate on the page itself.
 *
 * The JSON alone is unusable — thirty selectors with no way to tell which one is
 * the submit button. The overlay is what makes discovery a five-minute job.
 */
async function annotate(page: Page, candidates: ElementCandidate[]): Promise<void> {
  await page.evaluate((items) => {
    const layer = document.createElement('div');
    layer.id = '__halyard_discovery__';
    layer.style.cssText = 'position:absolute;inset:0;z-index:2147483647;pointer-events:none;';
    document.body.appendChild(layer);

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    for (const item of items) {
      if (!item.visible || !item.box) continue;
      const outline = document.createElement('div');
      outline.style.cssText = [
        'position:absolute',
        `left:${item.box.x + scrollX}px`,
        `top:${item.box.y + scrollY}px`,
        `width:${item.box.width}px`,
        `height:${item.box.height}px`,
        'outline:2px solid rgba(196,113,74,0.9)',
        'background:rgba(196,113,74,0.06)',
      ].join(';');

      const tag = document.createElement('div');
      tag.textContent = String(item.index);
      tag.style.cssText = [
        'position:absolute',
        `left:${item.box.x + scrollX}px`,
        `top:${Math.max(0, item.box.y + scrollY - 16)}px`,
        'background:#C4714A',
        'color:#fff',
        'font:700 11px/16px ui-monospace,monospace',
        'padding:0 4px',
        'border-radius:3px',
      ].join(';');

      layer.append(outline, tag);
    }
  }, candidates);
}

export async function discoverPage(
  page: Page,
  base: string,
  pagePath: string,
): Promise<DiscoveryReport> {
  const url = new URL(pagePath, base).toString();
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  if (!response || response.status() >= 400) {
    throw new Error(`${url} returned HTTP ${response?.status() ?? 'no response'}`);
  }
  // Client-rendered pages need a beat after DOMContentLoaded before the
  // interactive elements exist at all.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(1500);

  const candidates = await collect(page);
  const summary: Record<string, number> = {};
  for (const c of candidates) summary[c.selectorKind] = (summary[c.selectorKind] ?? 0) + 1;

  const notes: string[] = [];
  if ((summary.testid ?? 0) === 0) {
    notes.push(
      'No data-testid anywhere on this page. Flows here will depend on role and text, which break when copy changes. ' +
        'Adding data-testid to the elements the flows touch is the single highest-value change on the RecipeFix side.',
    );
  }
  if ((summary.text ?? 0) > candidates.length / 2) {
    notes.push(
      'More than half of these can only be identified by their visible text, so a copy edit is a broken flow. verify-flows will catch it, but after the fact.',
    );
  }

  await annotate(page, candidates);

  const viewport = page.viewportSize() ?? { width: 1280, height: 900 };
  return {
    url,
    path: pagePath,
    title: await page.title(),
    capturedAt: new Date().toISOString(),
    viewport,
    candidates,
    summary,
    notes,
  };
}

function slug(pagePath: string): string {
  return pagePath === '/' ? 'home' : pagePath.replace(/^\//, '').replace(/\//g, '-');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const base = valueOf(args, '--base') ?? process.env.RECIPEFIX_WEB_URL ?? DEFAULT_BASE;
  const only = valueOf(args, '--page');
  const headed = args.includes('--headed');
  // A result state cannot be reached by navigating to a URL — it exists only
  // after an adaptation has run — so it is discovered by running the flow that
  // produces it and then dumping whatever is on screen.
  const afterFlow = valueOf(args, '--after-flow') as FlowId | undefined;
  const pages = afterFlow ? [] : only ? [only] : DEFAULT_PAGES;

  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  let failures = 0;
  for (const pagePath of pages) {
    const name = slug(pagePath);
    try {
      const report = await discoverPage(page, base, pagePath);
      writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(report, null, 2));
      await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage: true });

      const withTestId = report.summary.testid ?? 0;
      console.log(
        `✓ ${pagePath.padEnd(16)} ${String(report.candidates.length).padStart(3)} elements` +
          `  ${withTestId} with data-testid` +
          `  → .discovery/${name}.json`,
      );
      for (const note of report.notes) console.log(`    · ${note}`);
    } catch (err) {
      failures++;
      console.error(`✗ ${pagePath} — ${(err as Error).message}`);
    }
  }

  if (afterFlow) {
    const flow = FLOWS[afterFlow];
    if (!flow) {
      console.error(`Unknown flow '${afterFlow}'.`);
      process.exitCode = 1;
    } else {
      console.log(`Running ${afterFlow} to reach the result state …`);
      const run = await runFlow(flow, {
        baseUrl: base,
        outDir: path.join(OUT_DIR, 'flow'),
        mode: 'verify',
        browser,
        continueIn: { context, page },
      });
      if (!run.ok) {
        console.error(`✗ ${afterFlow} — ${run.summary}`);
        failures++;
      } else {
        const candidates = await collect(page);
        const summary: Record<string, number> = {};
        for (const c of candidates) summary[c.selectorKind] = (summary[c.selectorKind] ?? 0) + 1;
        const report: DiscoveryReport = {
          url: page.url(),
          path: `${flow.path} (after ${afterFlow})`,
          title: await page.title(),
          capturedAt: new Date().toISOString(),
          viewport: page.viewportSize() ?? { width: 1280, height: 900 },
          candidates,
          summary,
          notes: [`Reached by running the ${afterFlow} flow, not by navigating to a URL.`],
        };
        await annotate(page, candidates);
        writeFileSync(path.join(OUT_DIR, 'result-state.json'), JSON.stringify(report, null, 2));
        await page.screenshot({ path: path.join(OUT_DIR, 'result-state.png'), fullPage: true });
        console.log(
          `✓ result state    ${String(candidates.length).padStart(3)} elements  → .discovery/result-state.json`,
        );
      }
    }
  }

  await browser.close();

  console.log(`\nOutput in ${OUT_DIR}`);
  console.log(
    'Open the PNG next to the JSON: the numbers on the screenshot are the `index` field.',
  );
  if (failures > 0) process.exitCode = 1;
}

function valueOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

/** Exported for the flow definitions, which resolve selectors the same way. */
export async function resolve(page: Page, selector: string): Promise<Locator> {
  if (selector.startsWith('role=')) {
    const match = /^role=([a-z]+)\[name="(.*)"\]$/s.exec(selector);
    if (match) return page.getByRole(match[1] as 'button', { name: match[2]! });
  }
  if (selector.startsWith('text=')) return page.getByText(selector.slice(5), { exact: false });
  return page.locator(selector);
}

// Run only when invoked directly; the helpers above are imported by the flow
// verifier and by tests.
if (process.argv[1]?.endsWith('discover-selectors.ts')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
