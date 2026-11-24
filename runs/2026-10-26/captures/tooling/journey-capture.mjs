/**
 * User-journey walkthrough harness (docs/design/JOURNEY_BRIEF.md).
 *
 * Walks RecipeFix the way a first-time reader does — landing, first adaptation,
 * sign-up, Cookbook, Cook Mode, Grocery, Plan, Pricing, Plus, Search, limits —
 * at three surfaces, and captures every step (viewport + full page), the console
 * errors and the failed requests, into a folder with an index.html gallery.
 *
 *   node scripts/journey.mjs --base http://127.0.0.1:8111 --out /tmp/journey
 *   node scripts/journey.mjs ... --surfaces=phone,ios,laptop --journeys=1,2 --dark
 *
 * Needs a running app (`npx vite --mode production --port <p> --strictPort --host 127.0.0.1`).
 *
 * THE BACKEND IS SIMULATED. Supabase and every edge function are unreachable from
 * the sandbox this was written in, so every request to `*.supabase.co` is answered
 * here, shaped exactly as the client parses it:
 *   - auth: a guest first; sign-up through the real AuthModal, answered by
 *     /auth/v1/signup, then a signed-in session (token, user, logout).
 *   - REST: an in-memory PostgREST per journey (eq/neq/in/is/gt/gte/lt/lte/cs,
 *     order, limit, single, upsert on_conflict, PATCH, DELETE, count), so a save,
 *     a grocery tick or a planned dinner persists and re-renders.
 *   - adapt-recipe: an SSE stream (phase, delta, result) carrying the REAL captured
 *     result in src/data/landingRealResult.ts (Chicken Tikka Masala, Dairy-Free,
 *     4 -> 6). Paced in the page so the working state is seen. The harness never
 *     invents a result the product could not produce: it only answers the request
 *     that result was captured for (the Original, Dairy-Free, 6 servings), and
 *     says so in the run log when a journey asks for anything else.
 *   - preview-recipe / search-recipes: answered from the RecipeFix Originals'
 *     own data (real recipes with rights-cleared photos), never a publisher page.
 *   - check-subscription: free, then Plus after the simulated purchase (journey 5).
 *   - refine-recipe / rescale-recipe: refused as unavailable (503), which the UI
 *     must handle gracefully.
 *   - everything else is aborted, and listed in the step's failed requests as
 *     `harness-abort` so it is never mistaken for a product bug.
 * Publisher images are blocked in the sandbox; a stand-in tile is expected.
 * Nothing is written anywhere and no credit or model call is spent.
 */
import { chromium } from "/Users/isaacmineo/PROJECT_2025/recipe-fix-capture-8c44a5b4/node_modules/playwright-core/index.mjs";
import { build } from "/Users/isaacmineo/PROJECT_2025/recipe-fix-capture-8c44a5b4/node_modules/esbuild/lib/main.js";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const ROOT = "/Users/isaacmineo/PROJECT_2025/recipe-fix-capture-8c44a5b4";
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const hit = args.find((a) => a.startsWith(`${n}=`));
  if (hit) return hit.slice(n.length + 1);
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};

const BASE = opt("--base", "http://127.0.0.1:8080");
const OUT = resolve(opt("--out", "journey"));
const SURFACES = opt("--surfaces", "phone,ios,laptop").split(",");
const JOURNEYS = opt("--journeys", "1,2,3,4,5,6,7").split(",").map(Number);
const DARK = flag("--dark");
const FULL = !flag("--no-full");
const CHROME = process.env.CHROME_PATH
  || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 RecipeFix-iOS/2.5";
const SAFARI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const SURFACE = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: SAFARI_UA },
  ios: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IOS_UA },
  laptop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};

const env = Object.fromEntries(readFileSync(join(ROOT, ".env.production"), "utf8").split("\n")
  .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, "")]));
const SUPABASE_URL = env.VITE_SUPABASE_URL;
const REF = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

/* ------------------------------------------------------------------ fixtures */

/** The app's own data modules, compiled from source so the fixtures can never drift from them. */
async function loadFixtures() {
  const entry = [
    `export { LANDING_REAL_RESULT, LANDING_SOURCE } from "./src/data/landingRealResult.ts";`,
    `export { RECIPEFIX_ORIGINALS, originalAsText } from "./src/data/recipefixOriginals.ts";`,
  ].join("\n");
  const out = await build({
    stdin: { contents: entry, resolveDir: ROOT, loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", logLevel: "silent",
    alias: { "@": join(ROOT, "src") },
    define: { "import.meta.env": "{}" },
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const nowIso = () => new Date().toISOString();
const iso = (d) => d.toISOString().slice(0, 10);

/* --------------------------------------------------------------- the backend */

function makeBackend(fx, opts = {}) {
  const log = [];
  const state = {
    user: null, // the signed-in user, once there is one
    session: null,
    plus: !!opts.plus,
    anonCount: opts.anonCount ?? 0,
    tables: {
      profiles: [], saved_recipes: [], shopping_list_items: [], meal_plan_items: [], pantry_items: [],
      adaptation_history: [], cook_sessions: [], user_credits: [], recipe_ratings: [], referrals: [],
      user_trials: [], push_tokens: [], user_feedback: [],
    },
    adaptRequests: [],
  };

  function newUser(email, { createdAgoDays = 0 } = {}) {
    const id = randomUUID();
    const created = new Date(Date.now() - createdAgoDays * 864e5).toISOString();
    const user = {
      id, aud: "authenticated", role: "authenticated", email, email_confirmed_at: created, phone: "",
      confirmed_at: created, last_sign_in_at: nowIso(), app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {}, identities: [{ id, user_id: id, identity_id: randomUUID(), provider: "email", identity_data: { email, sub: id }, created_at: created }],
      created_at: created, updated_at: nowIso(), is_anonymous: false,
    };
    return user;
  }
  function sessionFor(user) {
    const exp = Math.floor(Date.now() / 1000) + 36000;
    const access = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp, is_anonymous: false, session_id: randomUUID() })}.sig`;
    return { access_token: access, token_type: "bearer", expires_in: 36000, expires_at: exp, refresh_token: randomUUID(), user };
  }
  function signIn(user, { onboarded = false, diets = [] } = {}) {
    state.user = user;
    state.session = sessionFor(user);
    if (!state.tables.profiles.some((p) => p.user_id === user.id)) {
      state.tables.profiles.push({
        id: user.id, user_id: user.id, email: user.email, display_name: null, created_at: user.created_at, updated_at: nowIso(),
        dietary_preferences: diets, food_objectives: [], nutrition_targets: null, is_pro: false, is_beta: false,
        is_anonymous: false, plan_type: null, subscription_status: null, marketing_emails_opt_in: false,
        onboarding_complete: onboarded, onboarding_completed_at: onboarded ? nowIso() : null,
      });
    }
    return state.session;
  }

  /* --- PostgREST ------------------------------------------------------------ */
  const parseList = (s) => {
    const inner = s.replace(/^\(|\)$/g, "");
    const out = []; let cur = ""; let q = false;
    for (const c of inner) {
      if (c === '"') { q = !q; continue; }
      if (c === "," && !q) { out.push(cur); cur = ""; continue; }
      cur += c;
    }
    if (cur.length) out.push(cur);
    return out;
  };
  const cmp = (a, b) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : a < b ? -1 : 1);
  const coerce = (v, sample) => (typeof sample === "number" ? Number(v) : typeof sample === "boolean" ? v === "true" : v);
  function test(val, op, arg) {
    switch (op) {
      case "eq": return String(val) === arg;
      case "neq": return String(val) !== arg;
      case "gt": return val !== null && val !== undefined && coerce(arg, val) < val;
      case "gte": return val !== null && val !== undefined && coerce(arg, val) <= val;
      case "lt": return val !== null && val !== undefined && val < coerce(arg, val);
      case "lte": return val !== null && val !== undefined && val <= coerce(arg, val);
      case "in": return parseList(arg).includes(String(val));
      case "is": return arg === "null" ? val === null || val === undefined : arg === "true" ? val === true : arg === "false" ? val === false : true;
      case "like": case "ilike": {
        const re = new RegExp("^" + arg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[*%]/g, ".*") + "$", op === "ilike" ? "i" : "");
        return re.test(String(val ?? ""));
      }
      case "cs": { const want = parseList(arg.replace(/^\{|\}$/g, "")); return Array.isArray(val) && want.every((w) => val.includes(w)); }
      case "ov": { const want = parseList(arg.replace(/^\{|\}$/g, "")); return Array.isArray(val) && want.some((w) => val.includes(w)); }
      default: return true;
    }
  }
  const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);
  function filterRows(rows, params) {
    let out = rows;
    for (const [k, v] of params) {
      if (RESERVED.has(k)) continue;
      if (k === "or" || k === "and") { log.push(`rest: ignored ${k}=${v}`); continue; }
      const m = v.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|is|like|ilike|cs|ov|cd|fts|plfts)\.([\s\S]*)$/);
      if (!m) continue;
      out = out.filter((r) => { const res = test(r[k], m[2], m[3]); return m[1] ? !res : res; });
    }
    return out;
  }
  function orderRows(rows, order) {
    if (!order) return rows;
    const keys = order.split(",").map((p) => { const [col, dir] = p.split("."); return { col, desc: dir === "desc" }; });
    return [...rows].sort((a, b) => { for (const k of keys) { const c = cmp(a[k.col], b[k.col]); if (c) return k.desc ? -c : c; } return 0; });
  }
  const DEFAULTS = {
    saved_recipes: () => ({ is_favorite: false, last_cooked_at: null, cook_count: 0, rating: null, updated_at: nowIso() }),
    shopping_list_items: () => ({ checked: false }),
    meal_plan_items: () => ({ batch_of: null, note: null, servings: null }),
    pantry_items: () => ({ added_at: nowIso(), use_by: null, quantity_text: null }),
  };
  function insertRow(table, row) {
    const full = { id: randomUUID(), created_at: nowIso(), ...(DEFAULTS[table]?.() ?? {}), ...row };
    state.tables[table] ??= [];
    state.tables[table].push(full);
    return full;
  }
  /** What the server's triggers keep: profiles.saved_recipes_count follows saved_recipes. */
  function triggers() {
    for (const p of state.tables.profiles) p.saved_recipes_count = state.tables.saved_recipes.filter((r) => r.user_id === p.user_id).length;
  }
  function rest(method, url, headers, bodyText) {
    const out = restInner(method, url, headers, bodyText);
    if (method !== "GET" && method !== "HEAD") triggers();
    return out;
  }
  function restInner(method, url, headers, bodyText) {
    const table = url.pathname.replace(/^\/rest\/v1\//, "");
    const params = [...url.searchParams.entries()];
    const prefer = headers["prefer"] ?? "";
    const single = /vnd\.pgrst\.object/.test(headers["accept"] ?? "");
    const wantRows = /return=representation/.test(prefer);
    const rows = (state.tables[table] ??= []);
    const reply = (status, data, extra = {}) => ({ status, body: data, headers: extra });
    if (method === "GET" || method === "HEAD") {
      let out = orderRows(filterRows(rows, params), url.searchParams.get("order"));
      const total = out.length;
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const range = headers["range"]?.match(/(\d+)-(\d+)/);
      if (range) out = out.slice(Number(range[1]), Number(range[2]) + 1);
      else {
        if (offset) out = out.slice(offset);
        if (url.searchParams.get("limit")) out = out.slice(0, Number(url.searchParams.get("limit")));
      }
      const cr = { "content-range": `${out.length ? `${offset}-${offset + out.length - 1}` : "*"}/${total}` };
      if (method === "HEAD") return reply(200, null, cr);
      if (single) return out.length === 1 ? reply(200, out[0], cr)
        : reply(406, { code: "PGRST116", details: `The result contains ${out.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" });
      return reply(200, out, cr);
    }
    const body = bodyText ? JSON.parse(bodyText) : null;
    if (method === "POST") {
      const list = Array.isArray(body) ? body : [body];
      const conflict = url.searchParams.get("on_conflict");
      const upsert = /resolution=(merge|ignore)-duplicates/.test(prefer);
      const written = [];
      for (const r of list) {
        if (upsert) {
          const cols = (conflict ?? "id").split(",");
          const hit = rows.find((x) => cols.every((c) => r[c] !== undefined && String(x[c]) === String(r[c])));
          if (hit) { if (/merge/.test(prefer)) Object.assign(hit, r, { updated_at: nowIso() }); written.push(hit); continue; }
        }
        written.push(insertRow(table, r));
      }
      if (!wantRows) return reply(201, null);
      return reply(201, single ? written[0] : written);
    }
    if (method === "PATCH") {
      const hits = filterRows(rows, params);
      for (const h of hits) Object.assign(h, body);
      if (!wantRows) return reply(204, null);
      return single ? (hits.length === 1 ? reply(200, hits[0]) : reply(406, { code: "PGRST116", message: "no rows" })) : reply(200, hits);
    }
    if (method === "DELETE") {
      const hits = new Set(filterRows(rows, params));
      state.tables[table] = rows.filter((r) => !hits.has(r));
      if (!wantRows) return reply(204, null);
      return reply(200, [...hits]);
    }
    return reply(405, { message: "method" });
  }

  function rpc(name, body) {
    switch (name) {
      case "get_anon_usage_count": return state.anonCount;
      case "set_shopping_item_checked": {
        const id = body?.p_id ?? body?.item_id ?? body?.p_item_id;
        const row = state.tables.shopping_list_items.find((r) => r.id === id);
        if (row) row.checked = body?.p_checked ?? body?.checked ?? !row.checked;
        return row ? [row] : null;
      }
      case "get_popular_searches": return [];
      default: return null; // log_* and friends: fire-and-forget
    }
  }

  /* --- edge functions ------------------------------------------------------ */
  const tikka = fx.RECIPEFIX_ORIGINALS.find((r) => r.id === "chicken-tikka-masala");
  const originalUrl = (r) => `https://recipefix.app/original-recipes/${r.id}`;
  const photo = (r) => `${opts.base ?? BASE}/images/originals/${r.id}-4x3.webp`;

  function previewOf(r) {
    const steps = r.steps.map((s, i) => ({ sourceIndex: i, sourceText: s }));
    return {
      url: originalUrl(r), sourceDomain: "recipefix.app", title: r.title, image: photo(r), ogImage: photo(r),
      servings: r.servings, totalTimeMinutes: r.totalMinutes ?? null, yieldText: null,
      ingredients: r.ingredientGroups.flatMap((g) => g.items), instructions: r.steps,
      ingredientGroups: r.ingredientGroups.map((g) => ({ title: g.title ?? null, items: g.items })),
      steps, sections: [], notes: [], contentVersion: 10,
    };
  }

  function sseBody(result) {
    const model = JSON.stringify({ recipeName: result.recipeName, servings: result.servings, ingredients: result.ingredients, steps: result.steps });
    const parts = [];
    const size = Math.ceil(model.length / 36);
    for (let i = 0; i < model.length; i += size) parts.push(`event: delta\ndata: ${JSON.stringify({ t: model.slice(i, i + size) })}\n\n`);
    return [
      ...parts,
      `event: phase\ndata: ${JSON.stringify({ phase: "finalizing" })}\n\n`,
      `event: result\ndata: ${JSON.stringify(result)}\n\n`,
    ].join("");
  }

  function adapt(body, authed) {
    state.adaptRequests.push(body);
    const diets = (body?.dietary ?? []).slice().sort();
    const matches = diets.length === 1 && diets[0] === "Dairy-Free";
    if (!matches) log.push(`adapt-recipe: asked for ${JSON.stringify(diets)} x ${body?.servings ?? "as written"}; the only captured result is Dairy-Free x 6 (served anyway, flagged)`);
    if (!authed) {
      if (state.anonCount >= 2) return { status: 403, json: { error: "monthly_limit_reached", code: "monthly_limit_reached", status: 403, retryable: false, message: "You've used your free guest adaptations." } };
      state.anonCount += 1;
    } else if (!state.plus) {
      const credits = state.tables.user_credits.find((c) => c.user_id === state.user.id);
      if (credits && credits.credits_used >= 5) return { status: 403, json: { error: "monthly_limit_reached", code: "monthly_limit_reached", status: 403, retryable: false } };
      if (credits) credits.credits_used += 1;
      else state.tables.user_credits.push({ user_id: state.user.id, credits_used: 1, period_end: new Date(Date.now() + 25 * 864e5).toISOString() });
    }
    const result = structuredClone(fx.LANDING_REAL_RESULT);
    // adapt-recipe stores the adapted recipe as a string in adapted_output (index.ts), which /adapt reads back as "Recent".
    if (authed) insertRow("adaptation_history", { user_id: state.user.id, recipe_name: result.recipeName, dietary_restrictions: ["Dairy-Free"], servings: 6, source_url: body?.url ?? null, adapted_output: JSON.stringify(result) });
    if (body?.stream) return { status: 200, sse: sseBody(result) };
    return { status: 200, json: result };
  }

  function functions(name, body, authed) {
    switch (name) {
      case "check-subscription":
        return { status: 200, json: state.plus
          ? { subscribed: true, subscription_status: "active", plan_type: "annual", payment_platform: "stripe", cancel_at_period_end: false,
            renewal_date: new Date(Date.now() + 365 * 864e5).toISOString(), subscription_end: new Date(Date.now() + 365 * 864e5).toISOString() }
          : { subscribed: false, subscription_status: "none", plan_type: null } };
      case "adapt-recipe": return adapt(body, authed);
      case "preview-recipe": {
        const slug = String(body?.url ?? "").match(/original-recipes\/([a-z0-9-]+)/)?.[1];
        const r = fx.RECIPEFIX_ORIGINALS.find((o) => o.id === slug);
        return r ? { status: 200, json: previewOf(r) } : { status: 200, json: { error: "fetch_failed" } };
      }
      case "search-recipes": {
        const q = String(body?.query ?? "").toLowerCase();
        const words = q.split(/\s+/).filter((w) => w.length > 2);
        const hits = fx.RECIPEFIX_ORIGINALS
          .map((r) => ({ r, score: words.filter((w) => r.title.toLowerCase().includes(w)).length }))
          .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
        const results = hits.map(({ r }, i) => ({
          title: r.title, url: originalUrl(r), displayUrl: `recipefix.app › original-recipes › ${r.id}`, thumbnail: photo(r),
          snippet: r.description ?? `${r.title}, serves ${r.servings}.`, totalTimeMinutes: r.totalMinutes ?? null, position: i + 1, fit: null,
        }));
        return { status: 200, json: { results, searchesRemaining: authed ? null : 1 } };
      }
      case "refine-recipe":
      case "rescale-recipe":
        return { status: 503, json: { error: "ai_unavailable", code: "ai_unavailable", status: 503, retryable: true, message: "Not available offline (journey harness)." } };
      default:
        return null; // aborted
    }
  }

  return { state, log, newUser, signIn, sessionFor, rest, rpc, functions, tikka, originalUrl, previewOf, triggers };
}

/* --------------------------------------------------------------- the browser */

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "*",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS",
  "access-control-expose-headers": "content-range, x-supabase-api-version",
};

async function wire(ctx, be, rec) {
  await ctx.route(/posthog|googletagmanager|google-analytics|clarity\.ms|facebook|doubleclick/, (r) => r.abort());
  await ctx.route((u) => u.hostname.endsWith(".supabase.co"), async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const headers = req.headers();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const bearer = (headers["authorization"] ?? "").replace(/^Bearer\s+/i, "");
    const authed = !!be.state.session && bearer === be.state.session.access_token;
    const json = (status, data, extra = {}) => route.fulfill({ status, headers: { ...CORS, "content-type": "application/json", ...extra }, body: data === null ? "" : JSON.stringify(data) });
    const p = url.pathname;
    let bodyText = req.postData() ?? "";
    let body = null;
    try { body = bodyText ? JSON.parse(bodyText) : null; } catch { body = null; }

    if (p.startsWith("/auth/v1/")) {
      if (p === "/auth/v1/signup") {
        const user = be.newUser(body?.email ?? "reader@example-qa.test");
        rec.note(`auth: signed up ${user.email}`);
        return json(200, be.signIn(user));
      }
      if (p === "/auth/v1/token") {
        const grant = url.searchParams.get("grant_type");
        if (grant === "refresh_token" && be.state.session) return json(200, be.state.session = be.sessionFor(be.state.user));
        if (grant === "password" && be.state.user) return json(200, be.signIn(be.state.user));
        return json(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      }
      if (p === "/auth/v1/user") {
        if (method === "PUT") { Object.assign(be.state.user ?? {}, body ?? {}); return json(200, be.state.user); }
        return authed ? json(200, be.state.user) : json(401, { code: 401, error_code: "no_authorization", msg: "This endpoint requires a valid Bearer token" });
      }
      if (p === "/auth/v1/logout") { be.state.session = null; return route.fulfill({ status: 204, headers: CORS }); }
      if (p === "/auth/v1/otp") return json(200, {});
      rec.abort(req.url());
      return route.abort();
    }
    if (p.startsWith("/rest/v1/rpc/")) {
      const out = be.rpc(p.slice("/rest/v1/rpc/".length), body);
      return json(200, out);
    }
    if (p.startsWith("/rest/v1/")) {
      const r = be.rest(method, url, headers, bodyText);
      if (r.status === 204 || r.body === null) return route.fulfill({ status: r.status, headers: { ...CORS, ...r.headers } });
      return json(r.status, r.body, r.headers);
    }
    if (p.startsWith("/functions/v1/")) {
      const name = p.slice("/functions/v1/".length).split("/")[0];
      const out = be.functions(name, body, authed);
      if (!out) { rec.abort(req.url()); return route.abort(); }
      if (out.sse) {
        await new Promise((r) => setTimeout(r, 900));
        return route.fulfill({ status: 200, headers: { ...CORS, "content-type": "text/event-stream" }, body: out.sse });
      }
      if (name === "preview-recipe" || name === "search-recipes") await new Promise((r) => setTimeout(r, 700));
      return json(out.status, out.json);
    }
    rec.abort(req.url());
    return route.abort();
  });
}

/**
 * Playwright fulfils a response in one piece, so the SSE stream would arrive at
 * once and the working state would never be seen. This re-emits the fulfilled
 * stream event by event over a few seconds, so the client's own reader
 * (src/lib/adaptStream.ts) parses it exactly as it parses the real one.
 */
function pacingShim() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    const res = await realFetch(input, init);
    if (!/\/functions\/v1\/adapt-recipe/.test(url) || !(res.headers.get("content-type") || "").includes("text/event-stream")) return res;
    const text = await res.text();
    const events = text.split("\n\n").filter(Boolean).map((e) => e + "\n\n");
    const enc = new TextEncoder();
    const per = Math.max(30, Math.floor(3600 / events.length));
    const stream = new ReadableStream({
      async start(controller) {
        for (const e of events) {
          controller.enqueue(enc.encode(e));
          await new Promise((r) => setTimeout(r, /event: result/.test(e) ? 600 : per));
        }
        controller.close();
      },
    });
    return new Response(stream, { status: res.status, headers: { "content-type": "text/event-stream" } });
  };
}

/* ---------------------------------------------------------------- recording */

function recorder(dir, surface, journey) {
  const steps = [];
  let current = { console: [], failed: [], notes: [] };
  return {
    steps,
    note(s) { current.notes.push(s); },
    abort(u) { current.failed.push(`harness-abort ${u.replace(SUPABASE_URL, "")}`); },
    attach(page) {
      page.on("console", (m) => { if (m.type() === "error") current.console.push(m.text().slice(0, 300)); });
      page.on("pageerror", (e) => current.console.push(`pageerror: ${String(e).slice(0, 300)}`));
      page.on("requestfailed", (r) => {
        const u = r.url();
        if (/supabase\.co/.test(u)) return; // our own aborts are already listed
        if (/posthog|google|clarity|facebook|doubleclick/.test(u)) return;
        current.failed.push(`${r.failure()?.errorText ?? "failed"} ${u.slice(0, 160)}`);
      });
      page.on("response", (r) => { if (r.status() >= 400 && !/supabase\.co/.test(r.url())) current.failed.push(`${r.status()} ${r.url().slice(0, 160)}`); });
    },
    async shot(page, name, extra = {}) {
      const n = String(steps.length + 1).padStart(2, "0");
      const base = `j${journey}-${surface}-${n}-${name}`;
      await page.waitForTimeout(extra.settle ?? 350);
      const vp = page.viewportSize();
      await page.screenshot({ path: join(dir, `${base}.png`) });
      let fullFile = null;
      let height = vp.height;
      if (FULL && !extra.viewportOnly) {
        height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
        if (height > vp.height + 40) {
          const y = await page.evaluate(() => window.scrollY);
          await page.setViewportSize({ width: vp.width, height: Math.min(height, 12000) });
          await page.waitForTimeout(300);
          fullFile = `${base}--full.png`;
          await page.screenshot({ path: join(dir, fullFile) });
          await page.setViewportSize(vp);
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(150);
        }
      }
      steps.push({ n, name, url: page.url().replace(BASE, ""), file: `${base}.png`, full: fullFile, height, ...current, ok: extra.ok ?? true, why: extra.ok === false ? extra.why ?? null : null });
      current = { console: [], failed: [], notes: [] };
      process.stdout.write(".");
    },
    fail(name, why) {
      steps.push({ n: String(steps.length + 1).padStart(2, "0"), name, file: null, ...current, ok: false, why });
      current = { console: [], failed: [], notes: [] };
      process.stdout.write("x");
    },
  };
}

/* ------------------------------------------------------------------ helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function go(page, path) {
  try { await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 }); } catch { /* long-poll pages */ }
  await page.waitForTimeout(900);
}
/** Click the first VISIBLE element matching any of the locators; returns the one clicked, or null. */
async function tap(page, ...locs) {
  for (const l of locs) {
    const loc = typeof l === "string" ? page.locator(l) : l;
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
const role = (page, r, name, exact = false) => page.getByRole(r, { name, exact });
async function waitFor(page, loc, ms = 12000) {
  try { await (typeof loc === "string" ? page.locator(loc) : loc).first().waitFor({ state: "visible", timeout: ms }); return true; } catch { return false; }
}
/** The result card is on screen (the working card also names the dish, so wait for the method's change note). */
const waitResult = (page, ms = 25000) => waitFor(page, page.getByText(/RecipeFix changed this step/).first(), ms);
async function step(rec, page, name, fn, opts) {
  try {
    const r = await fn();
    if (r === false) { await rec.shot(page, name, { ok: false, why: opts?.why ?? "expected control not found" }); return false; }
    await rec.shot(page, name, opts);
    return true;
  } catch (e) {
    try { await rec.shot(page, name, { ok: false, why: String(e).slice(0, 300) }); } catch { rec.fail(name, String(e).slice(0, 300)); }
    return false;
  }
}

/* --------------------------------------------------------------- journeys */

/** A signed-in reader seeded straight into storage (journeys that start after sign-up). */
async function seedMember(ctx, be, { plus = false, onboarded = true, diets = ["Dairy-Free"], saved = true, credits = null } = {}) {
  const user = be.newUser("maya@example-qa.test", { createdAgoDays: 3 });
  const session = be.signIn(user, { onboarded, diets });
  be.state.plus = plus;
  if (saved) {
    const r = structuredClone(be.fx.LANDING_REAL_RESULT);
    be.state.tables.saved_recipes.push({
      id: randomUUID(), user_id: user.id, created_at: new Date(Date.now() - 864e5).toISOString(), updated_at: nowIso(),
      recipe_name: r.recipeName, servings: r.servings, modifications: r.activeModifications, modification_tags: [],
      ingredients: r.ingredients, steps: r.steps, explanations: r.explanations ?? [], original_url: be.originalUrl(be.tikka),
      original_text: null, original_servings: 4, dietary_needs: ["Dairy-Free"], ingredient_swaps: null, ingredient_scale: null,
      image_url: "/images/originals/chicken-tikka-masala-4x3.webp", yield_text: null, description: null, nutrition: null,
      is_favorite: false, last_cooked_at: null, total_time_minutes: 45,
    });
  }
  /*
   * More saved recipes, from the RecipeFix Originals (rights-cleared photos), so
   * a cookbook can be shown at a real size and a save limit can be reached.
   */
  const extra = typeof saved === "number" ? Math.max(0, saved - 1) : 0;
  const others = be.fx.RECIPEFIX_ORIGINALS.filter((o) => o.id !== "chicken-tikka-masala").slice(0, extra);
  others.forEach((o, i) => {
    const base = be.state.tables.saved_recipes[0];
    be.state.tables.saved_recipes.push({
      ...structuredClone(base), id: randomUUID(), recipe_name: o.title, servings: o.servings,
      created_at: new Date(Date.now() - (i + 2) * 864e5).toISOString(), original_url: be.originalUrl(o),
      image_url: `/images/originals/${o.id}-4x3.webp`, total_time_minutes: o.totalMinutes ?? null,
    });
  });
  be.triggers();
  if (credits !== null) be.state.tables.user_credits.push({ user_id: user.id, credits_used: credits, period_end: new Date(Date.now() + 20 * 864e5).toISOString() });
  await ctx.addInitScript(([key, s]) => { try { if (!sessionStorage.getItem("rf-journey-seeded")) { localStorage.setItem(key, s); sessionStorage.setItem("rf-journey-seeded", "1"); } } catch {} }, [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  return user;
}

const J = {};

/**
 * Inside the iPhone app there is no landing page: the app opens on /adapt, and a
 * pasted link opens the recipe preview, then "Make it fit". The same request
 * (the Original, Dairy-Free, 6 servings) through the app's own door.
 */
async function appAdapt(page, rec, be, shots) {
  const s = shots ? (name, fn, o) => step(rec, page, name, fn, o) : async (_n, fn) => fn();
  await s("app-start", async () => { await go(page, "/?home"); });
  await s("link-preview", async () => {
    await tap(page, page.getByRole("button", { name: /^Link$/ }));
    await page.getByLabel("Recipe link").fill(be.originalUrl(be.tikka));
    await sleep(1800);
  }, { viewportOnly: true });
  await s("make-it-fit-sheet", async () => {
    const m = await tap(page, page.getByRole("button", { name: /^make it fit/i }));
    await sleep(900);
    const dlg = page.locator("[role=dialog]").last();
    await tap(page, dlg.getByRole("button", { name: /^Dairy-Free$/ }));
    const more = dlg.getByRole("button", { name: /more servings|increase servings/i });
    for (let i = 0; i < 2 && (await more.count()); i++) await tap(page, more);
    return !!m;
  }, { viewportOnly: true });
  await s("adapt-working", async () => {
    const dlg = page.locator("[role=dialog]").last();
    const a = await tap(page, dlg.getByRole("button", { name: /^adapt recipe/i }));
    await sleep(2600);
    return !!a;
  }, { viewportOnly: true, settle: 0 });
}

J[1] = { name: "First visit to first adaptation (guest)", async run(page, rec, be, surface) {
  if (surface === "ios") {
    await appAdapt(page, rec, be, true);
    await step(rec, page, "result", async () => { const ok = await waitResult(page); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(1200); return ok; });
    return J[1].tail(page, rec);
  }
  await step(rec, page, "landing", async () => { await go(page, "/?home"); });
  await step(rec, page, "story-scroll", async () => {
    const h = await page.evaluate(() => document.body.scrollHeight);
    for (let y = 0; y < h * 0.45; y += 500) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(60); }
    await page.locator("#real-result").scrollIntoViewIfNeeded().catch(() => {});
  }, { viewportOnly: true });
  await step(rec, page, "composer-filled", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const input = page.getByRole("textbox", { name: "Search recipes or paste a recipe link" }).first();
    await input.fill(be.originalUrl(be.tikka));
    await tap(page, role(page, "button", "Dairy-Free", true));
    await tap(page, role(page, "button", "More servings"));
    await tap(page, role(page, "button", "More servings"));
    await input.scrollIntoViewIfNeeded();
  }, { viewportOnly: true });
  await step(rec, page, "adapt-working", async () => {
    await tap(page, role(page, "button", /^Adapt recipe/));
    await sleep(2600);
  }, { viewportOnly: true, settle: 0 });
  await step(rec, page, "result", async () => {
    const ok = await waitResult(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);
    return ok;
  });
  return J[1].tail(page, rec);
}, async tail(page, rec) {
  await step(rec, page, "swapped-tag-expanded", async () => {
    const tag = await tap(page, page.getByRole("button", { name: /swapped|both|changed/i }), page.locator("[data-change-type='both'] button, [data-change-type='swapped'] button"), page.getByText(/^Swapped$/));
    return !!tag;
  }, { viewportOnly: true });
  await step(rec, page, "step-note", async () => {
    const note = page.getByText(/RecipeFix changed this step/i).first();
    if (!(await note.count())) return false;
    await note.scrollIntoViewIfNeeded();
  }, { viewportOnly: true });
  await step(rec, page, "servings-changed", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    const more = await tap(page, page.getByRole("button", { name: /more servings|increase servings|^\+$/i }));
    await sleep(1500);
    return !!more;
  }, { viewportOnly: true });
  await step(rec, page, "more-menu", async () => {
    const m = await tap(page, page.getByRole("button", { name: /^more( options| actions)?$/i }), page.getByRole("button", { name: /more/i }));
    return !!m;
  }, { viewportOnly: true });
  await page.keyboard.press("Escape").catch(() => {});
} };

J[2] = { name: "Keep it (guest to account)", async run(page, rec, be, surface) {
  if (surface === "ios") await appAdapt(page, rec, be, false);
  else {
    await go(page, "/?home");
    const input = page.getByRole("textbox", { name: "Search recipes or paste a recipe link" }).first();
    await input.fill(be.originalUrl(be.tikka));
    await tap(page, role(page, "button", "Dairy-Free", true));
    await tap(page, role(page, "button", "More servings"));
    await tap(page, role(page, "button", "More servings"));
    await tap(page, role(page, "button", /^Adapt recipe/));
  }
  await waitResult(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(1200);
  await step(rec, page, "result-before-save", async () => {}, { viewportOnly: true });
  await step(rec, page, "save-auth-prompt", async () => {
    const s = await tap(page, page.getByRole("button", { name: /^save( recipe| to cookbook)?$/i }), page.getByRole("button", { name: /save/i }));
    await sleep(600);
    return !!s;
  }, { viewportOnly: true });
  await step(rec, page, "signup-email-form", async () => {
    await tap(page, page.getByRole("button", { name: /^use a password$/i }), page.getByRole("button", { name: /continue with email|sign up with email|use email/i }));
    const email = page.getByPlaceholder("Email").first();
    if (!(await waitFor(page, email, 4000))) return false;
    await email.fill("maya@example-qa.test");
    await page.getByPlaceholder("Password").first().fill("correct-horse-battery");
    const confirm = page.getByPlaceholder("Confirm password");
    if (await confirm.count()) await confirm.first().fill("correct-horse-battery");
  }, { viewportOnly: true });
  await step(rec, page, "signed-up", async () => {
    await tap(page, page.locator("form button[type=submit]").filter({ hasText: /create|sign up|continue/i }), page.locator("[role=dialog] button[type=submit]"));
    await sleep(3500);
  }, { viewportOnly: true });
  await step(rec, page, "onboarding-sheet", async () => {
    const ok = await waitFor(page, page.locator("[role=dialog]"), 8000);
    return ok;
  }, { viewportOnly: true });
  await step(rec, page, "onboarding-diets-picked", async () => {
    const dlg = page.locator("[role=dialog]").last();
    const a = await tap(page, dlg.getByRole("button", { name: /^Dairy-Free$/ }), dlg.getByText(/^Dairy-Free$/));
    await tap(page, dlg.getByRole("button", { name: /^High-Protein$/ }), dlg.getByText(/^High-Protein$/));
    return !!a;
  }, { viewportOnly: true });
  await step(rec, page, "onboarding-finished", async () => {
    let guard = 0;
    while (guard++ < 5) {
      const dlg = page.locator("[role=dialog]");
      if (!(await dlg.count()) || !(await dlg.last().isVisible().catch(() => false))) break;
      const b = await tap(page, dlg.last().getByRole("button", { name: /^(continue|next|done|finish|save|start cooking|let'?s go|show me|back to my recipe|see my|go to)/i }));
      if (!b) break;
      await sleep(700);
    }
    await sleep(800);
  }, { viewportOnly: true });
  await step(rec, page, "result-now-saved", async () => {
    await page.evaluate(() => window.scrollTo(0, 0));
    rec.note(`saved_recipes rows: ${be.state.tables.saved_recipes.length}`);
    return be.state.tables.saved_recipes.length > 0;
  }, { viewportOnly: true, why: "no saved_recipes row was written after sign-up" });
  await step(rec, page, "cookbook", async () => {
    await go(page, "/recipes");
    return await waitFor(page, page.getByText(/Chicken Tikka Masala/).first(), 8000);
  });
} };

J[3] = { name: "Cook it", member: { saved: true }, async run(page, rec, be, surface) {
  await step(rec, page, "cookbook", async () => { await go(page, "/recipes"); return await waitFor(page, page.getByText(/Chicken Tikka Masala/).first(), 8000); });
  await step(rec, page, "recipe-open", async () => {
    await tap(page, page.getByText(/Chicken Tikka Masala/).first());
    await sleep(1200);
  });
  await step(rec, page, "cook-ready", async () => {
    const c = await tap(page, page.getByRole("button", { name: /^cook( it| now| mode| this)?/i }), page.getByRole("link", { name: /^cook/i }));
    await sleep(1500);
    return !!c;
  }, { viewportOnly: true });
  await step(rec, page, "cook-started", async () => {
    const s = await tap(page, page.getByRole("button", { name: /^(start|start cooking|let'?s cook|begin)/i }));
    await sleep(900);
    return !!s;
  }, { viewportOnly: true });
  let timerShot = false;
  for (let i = 2; i <= 20; i++) {
    if (await page.getByRole("button", { name: "Finish recipe" }).count()) break;
    const ok = await step(rec, page, `cook-step-${i}`, async () => {
      const n = await tap(page, page.getByRole("button", { name: "Next step" }));
      await sleep(600);
      return !!n;
    }, { viewportOnly: true });
    if (!ok) break;
    if (!timerShot && await page.getByRole("button", { name: /^start .*timer/i }).count()) {
      timerShot = true;
      await step(rec, page, "cook-timer-running", async () => {
        await tap(page, page.getByRole("button", { name: /^start .*timer/i }));
        await sleep(2200);
      }, { viewportOnly: true });
    }
  }
  await step(rec, page, "cook-finished", async () => {
    const f = await tap(page, page.getByRole("button", { name: "Finish recipe" }));
    await sleep(1500);
    rec.note(`cook_sessions rows: ${be.state.tables.cook_sessions.length}`);
    return !!f;
  }, { viewportOnly: true });
  await step(rec, page, "cook-rated", async () => {
    const r = await tap(page, page.getByRole("button", { name: "Rate 5 of 5" }));
    await sleep(1000);
    return !!r;
  }, { viewportOnly: true });
} };

J[4] = { name: "Shop and plan as a free member", member: { saved: true }, async run(page, rec, be, surface) {
  await go(page, "/recipes");
  await tap(page, page.getByText(/Chicken Tikka Masala/).first());
  await sleep(1200);
  await step(rec, page, "recipe-open", async () => {}, { viewportOnly: true });
  await step(rec, page, "send-to-grocery", async () => {
    let b = await tap(page, page.getByRole("button", { name: /^shop ingredients$/i }));
    if (!b) {
      await tap(page, page.getByRole("button", { name: "More actions" }));
      b = await tap(page, page.getByRole("menuitem", { name: /shop ingredients/i }), page.getByText(/^Shop ingredients$/));
    }
    await sleep(1200);
    const sheet = page.locator("[role=dialog] button").filter({ hasText: /add .*(item|ingredient)|add to (list|grocery)/i });
    if (await sheet.count()) { await tap(page, sheet); await sleep(1000); }
    rec.note(`shopping_list_items rows: ${be.state.tables.shopping_list_items.length}`);
    return !!b;
  }, { viewportOnly: true });
  await step(rec, page, "grocery", async () => { await go(page, "/shopping-list"); return be.state.tables.shopping_list_items.length > 0; }, { why: "nothing reached shopping_list_items" });
  await step(rec, page, "grocery-ticked", async () => {
    let n = 0;
    for (let i = 0; i < 3; i++) {
      const box = page.getByRole("button", { name: "Check", exact: true }).first();
      if (!(await box.count())) break;
      await box.scrollIntoViewIfNeeded();
      await box.click().catch(() => {}); n++; await sleep(500);
    }
    rec.note(`ticked ${n}; checked rows: ${be.state.tables.shopping_list_items.filter((r) => r.checked).length}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    return n > 0;
  }, { viewportOnly: true });
  await step(rec, page, "plan", async () => { await go(page, "/plan"); });
  await step(rec, page, "plan-add-dinner-paywall", async () => {
    const a = await tap(page, page.getByRole("button", { name: /add dinner|add a dinner|^add$/i }), page.getByRole("button", { name: /add/i }));
    await sleep(900);
    return !!a;
  }, { viewportOnly: true });
  await step(rec, page, "paywall-see-yearly", async () => {
    const s = await tap(page, page.getByRole("button", { name: /see plus|see recipefix plus|see yearly plan|go yearly|compare plans|learn more/i }), page.getByRole("link", { name: /see plus|see yearly|compare|plans/i }));
    await sleep(1200);
    rec.note(`after "See yearly plan": ${page.url().replace(BASE, "")}`);
    return !!s;
  }, { viewportOnly: true });
  await step(rec, page, "pricing-free", async () => {
    await page.keyboard.press("Escape").catch(() => {});
    if (!/pricing/.test(page.url())) {
      const pill = await tap(page, page.getByRole("link", { name: /^plus$/i }), page.getByRole("button", { name: /^plus$/i }));
      rec.note(pill ? "reached Pricing through the header Plus pill" : "no route found: opened /pricing directly");
      await sleep(1200);
      if (!/pricing/.test(page.url())) await go(page, "/pricing");
    }
  });
  await step(rec, page, "pricing-yearly-target", async () => {
    await tap(page, page.getByRole("radio", { name: /year|annual/i }), page.getByRole("button", { name: /^(yearly|annual)/i }), page.getByRole("tab", { name: /year|annual/i }));
    const cta = page.getByRole("button", { name: /start|subscribe|get plus|upgrade|continue/i }).first();
    if (!(await cta.count())) return false;
    await cta.scrollIntoViewIfNeeded();
    const box = await cta.boundingBox();
    const label = (await cta.innerText()).trim();
    rec.note(`yearly CTA: "${label}" at ${JSON.stringify(box)} (not clicked: stops before Stripe)`);
    await cta.evaluate((el) => { el.style.outline = "3px solid #e11d48"; el.style.outlineOffset = "3px"; });
  }, { viewportOnly: true });
} };

J[5] = { name: "Plus member", member: { saved: true, plus: true }, async run(page, rec, be, surface) {
  await step(rec, page, "home", async () => { await go(page, "/home"); await sleep(800); });
  await step(rec, page, "plan", async () => { await go(page, "/plan"); });
  await step(rec, page, "plan-add-tonight", async () => {
    const a = await tap(page, page.getByRole("button", { name: /add dinner|add a dinner|plan tonight|add tonight/i }), page.getByRole("button", { name: /^add/i }));
    await sleep(1000);
    return !!a;
  }, { viewportOnly: true });
  await step(rec, page, "plan-picked", async () => {
    const pick = await tap(page, page.locator("[role=dialog]").getByText(/Chicken Tikka Masala/).first());
    await sleep(900);
    const confirm = page.locator("[role=dialog]").getByRole("button", { name: /add|plan|save|done/i });
    if (await confirm.count()) await tap(page, confirm);
    await sleep(1000);
    rec.note(`meal_plan_items rows: ${be.state.tables.meal_plan_items.length}`);
    return !!pick && be.state.tables.meal_plan_items.length > 0;
  }, { why: "nothing reached meal_plan_items" });
  await step(rec, page, "plan-build-grocery", async () => {
    const b = await tap(page, page.getByRole("button", { name: /grocery list|shopping list|build.*list/i }), page.getByRole("link", { name: /grocery list|shopping list/i }));
    await sleep(1500);
    return !!b;
  });
  await step(rec, page, "kitchen", async () => { await go(page, "/what-can-i-make"); });
  await step(rec, page, "kitchen-foods-added", async () => {
    const box = page.getByRole("textbox").first();
    if (!(await box.count())) return false;
    for (const f of ["chicken thighs", "onion", "garlic", "canned tomatoes"]) { await box.fill(f); await box.press("Enter"); await sleep(350); }
    rec.note(`pantry_items rows: ${be.state.tables.pantry_items.length}`);
  }, { viewportOnly: true });
  await step(rec, page, "kitchen-find", async () => {
    const f = await tap(page, page.getByRole("button", { name: /find recipes|what can i make|show recipes|find/i }));
    await sleep(2000);
    return !!f;
  });
  await step(rec, page, "account-plan", async () => { await go(page, "/account"); await sleep(600); });
} };

J[6] = { name: "Search start", async run(page, rec, be, surface) {
  await step(rec, page, "adapt-start", async () => { await go(page, "/adapt"); });
  await step(rec, page, "search-tab", async () => {
    await tap(page, page.getByRole("tab", { name: /search/i }), page.getByRole("button", { name: /^search$/i }));
  }, { viewportOnly: true });
  await step(rec, page, "search-typed", async () => {
    const box = page.getByPlaceholder(/search any recipe/i).first();
    await box.fill("chicken tikka masala");
    await box.press("Enter");
    await sleep(2200);
    return await waitFor(page, page.getByText(/Chicken Tikka Masala/).first(), 6000);
  });
  await step(rec, page, "preview-open", async () => {
    await tap(page, page.getByRole("button", { name: /Chicken Tikka Masala/ }), page.getByText(/^Chicken Tikka Masala$/));
    await sleep(2000);
  });
  await step(rec, page, "make-it-fit-sheet", async () => {
    const m = await tap(page, page.getByRole("button", { name: /^make it fit/i }));
    await sleep(900);
    return !!m;
  }, { viewportOnly: true });
  await step(rec, page, "fit-diet-set", async () => {
    const dlg = page.locator("[role=dialog]").last();
    const d = await tap(page, dlg.getByRole("button", { name: /^Dairy-Free$/ }), dlg.getByRole("checkbox", { name: /Dairy-Free/ }), dlg.getByText(/^Dairy-Free$/));
    const more = dlg.getByRole("button", { name: /more servings|increase servings/i });
    for (let i = 0; i < 2 && (await more.count()); i++) await tap(page, more);
    return !!d;
  }, { viewportOnly: true });
  await step(rec, page, "fit-adapt", async () => {
    const dlg = page.locator("[role=dialog]").last();
    const a = await tap(page, dlg.getByRole("button", { name: /^(adapt|make it|fix it|rewrite)/i }), page.getByRole("button", { name: /^adapt( this| recipe| it)?/i }));
    await sleep(2400);
    return !!a;
  }, { viewportOnly: true, settle: 0 });
  await step(rec, page, "result", async () => { const ok = await waitResult(page); await page.evaluate(() => window.scrollTo(0, 0)); await sleep(800); return ok; });
} };

J[7] = { name: "Limits", async run(page, rec, be, surface, ctx) {
  be.state.anonCount = 2;
  await step(rec, page, "guest-at-allowance-adapt", async () => { await go(page, "/adapt"); });
  await step(rec, page, "guest-limit-state", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    await sleep(2500);
    return await waitFor(page, page.locator("[role=dialog]"), 5000);
  }, { viewportOnly: true });
} };

/* The free member at 5/5 (second half of journey 7) runs in its own signed-in context. */
J[7.5] = { name: "Limits (free member at 5/5)", member: { saved: true, credits: 5 }, async run(page, rec, be) {
  await step(rec, page, "member-at-limit-adapt", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    await sleep(2500);
    return await waitFor(page, page.locator("[role=dialog]"), 5000);
  }, { viewportOnly: true });
} };

/*
 * Growth plan P4 (2026-10-24): the moment Plus is offered with the reader's own
 * recipe. A free member with three saved recipes and one adaptation this month
 * opens Home (their cookbook previewed on the week), adapts a second recipe, and
 * meets the one quiet card under the result; its button opens the trial offer.
 */
J[8] = { name: "Plus moment (free member adapts twice)", member: { saved: 3, credits: 1 }, async run(page, rec, be) {
  await step(rec, page, "home-week-preview", async () => {
    await go(page, "/home");
    await sleep(800);
    const week = page.getByRole("heading", { name: "Your week" });
    if (await week.count()) await week.first().scrollIntoViewIfNeeded();
  });
  await step(rec, page, "second-adaptation-result", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    const ok = await waitResult(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);
    return ok;
  });
  await step(rec, page, "moment-card", async () => {
    const card = page.locator("[data-plus-moment]");
    if (!(await waitFor(page, card, 6000))) return false;
    await card.first().scrollIntoViewIfNeeded();
    await sleep(500);
  }, { viewportOnly: true, why: "the Plus moment card did not appear after the second adaptation" });
  await step(rec, page, "moment-opens-offer", async () => {
    const b = await tap(page, page.locator("[data-plus-moment]").getByRole("button", { name: /plan|week|plus/i }));
    await sleep(900);
    return !!b && (await waitFor(page, page.locator("[role=dialog]"), 4000));
  }, { viewportOnly: true });
  await step(rec, page, "moment-not-now", async () => {
    await tap(page, page.locator("[role=dialog]").getByRole("button", { name: "Not now" }));
    await sleep(600);
    const n = await tap(page, page.locator("[data-plus-moment]").getByRole("button", { name: "Not now" }));
    await sleep(600);
    return !!n && (await page.locator("[data-plus-moment]").count()) === 0;
  }, { viewportOnly: true, why: "Not now did not dismiss the card" });
  await step(rec, page, "moment-not-again", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    await waitResult(page);
    await sleep(1500);
    return (await page.locator("[data-plus-moment]").count()) === 0;
  }, { viewportOnly: true, why: "the card came back inside its 7 days" });
} };

/* The save limit: a free member with a full cookbook presses Save on a new result. */
J[9] = { name: "Save limit (free member, full cookbook)", member: { saved: 5, credits: 1 }, async run(page, rec, be) {
  await step(rec, page, "result", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    const ok = await waitResult(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1500);
    return ok;
  }, { viewportOnly: true });
  await step(rec, page, "save-limit-sheet", async () => {
    const s = await tap(page, page.getByRole("button", { name: /^save( recipe| to cookbook)?$/i }), page.getByRole("button", { name: /save/i }));
    await sleep(900);
    return !!s && (await waitFor(page, page.locator("[role=dialog]"), 4000));
  }, { viewportOnly: true });
} };

/*
 * The monthly limit right after a recipe (P4c): the fifth adaptation lands, the
 * sixth is refused, and the sheet leads with the recipe just made. Then Pricing
 * on the monthly plan, where the card-trial reassurance lives (P5).
 */
J[10] = { name: "Limit after a recipe, Pricing monthly", member: { saved: true, credits: 4 }, async run(page, rec, be) {
  await step(rec, page, "fifth-adaptation", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    const ok = await waitResult(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(1200);
    return ok;
  }, { viewportOnly: true });
  await step(rec, page, "limit-sheet-names-recipe", async () => {
    await go(page, `/adapt?auto=true&url=${encodeURIComponent(be.originalUrl(be.tikka))}&dietary=Dairy-Free&servings=6`);
    await sleep(2500);
    if (!(await waitFor(page, page.locator("[role=dialog]"), 6000))) return false;
    return (await page.getByText(/Keep adapting recipes like/).count()) > 0;
  }, { viewportOnly: true, why: "the limit sheet did not lead with the recipe" });
  await step(rec, page, "limit-sheet-monthly", async () => {
    const m = await tap(page, page.locator("[role=dialog]").getByRole("radio", { name: /^Monthly/ }));
    await sleep(500);
    return !!m;
  }, { viewportOnly: true });
  await step(rec, page, "pricing-monthly", async () => {
    await page.keyboard.press("Escape").catch(() => {});
    await go(page, "/pricing?plan=monthly");
    await sleep(800);
  }, { viewportOnly: true });
} };

export { loadFixtures, makeBackend, wire, seedMember, pacingShim };

/* ------------------------------------------------------------------- runner */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {

const fx = await loadFixtures();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });
const runs = [];
const list = JOURNEYS.flatMap((j) => (j === 7 ? [7, 7.5] : [j]));

for (const surface of SURFACES) {
  for (const j of list) {
    const journey = J[j];
    if (!journey) continue;
    const ctx = await browser.newContext({ ...SURFACE[surface], reducedMotion: "no-preference", colorScheme: DARK ? "dark" : "light", serviceWorkers: "block" });
    const be = makeBackend(fx);
    be.fx = fx;
    const id = String(j).replace(".5", "b");
    const rec = recorder(OUT, surface + (DARK ? "-dark" : ""), id);
    await ctx.addInitScript((dark) => {
      try {
        localStorage.setItem("recipefix-theme", dark ? "dark" : "light");
        localStorage.setItem("rf_has_opened_before", "true");
        localStorage.setItem("rf-cookie-consent", "accepted");
      } catch { /* private mode */ }
    }, DARK);
    await ctx.addInitScript(pacingShim);
    if (journey.member) await seedMember(ctx, be, journey.member);
    await wire(ctx, be, rec);
    const page = await ctx.newPage();
    rec.attach(page);
    const t0 = Date.now();
    try { await journey.run(page, rec, be, surface, ctx); } catch (e) { rec.fail("journey-crashed", String(e).slice(0, 400)); }
    runs.push({ surface, dark: DARK, journey: id, name: journey.name, ms: Date.now() - t0, steps: rec.steps, harnessLog: be.log, adaptRequests: be.state.adaptRequests });
    await ctx.close();
  }
}
await browser.close();

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const html = `<!doctype html><meta charset="utf-8"><title>RecipeFix journeys</title>
<style>body{font:14px system-ui;margin:24px;background:#f4f1ec}h2{margin:36px 0 6px}.row{display:flex;gap:14px;overflow-x:auto;align-items:flex-start}
figure{margin:0;width:240px;flex:none}figcaption{font-size:12px;color:#444;margin-bottom:4px}img{width:240px;border:1px solid #ccc;background:#fff}
.bad{color:#b91c1c}.meta{font-size:11px;color:#666;white-space:pre-wrap}</style>
<h1>RecipeFix user journeys</h1><p>${new Date().toISOString()} · ${esc(BASE)} · backend simulated (scripts/journey.mjs)</p>
${runs.map((r) => `<h2>J${r.journey} ${esc(r.name)} · ${r.surface}${r.dark ? " dark" : ""}</h2>
${r.harnessLog.length ? `<p class="meta">harness: ${esc(r.harnessLog.join("\n"))}</p>` : ""}
<div class="row">${r.steps.map((s) => `<figure><figcaption class="${s.ok ? "" : "bad"}">${s.n} ${esc(s.name)}${s.ok ? "" : " ✗ " + esc(s.why)}</figcaption>
${s.file ? `<a href="${s.full ?? s.file}"><img src="${s.file}" loading="lazy"></a>` : ""}
<div class="meta">${esc([...s.notes, ...s.console.map((c) => "console: " + c), ...s.failed.map((f) => "req: " + f)].join("\n"))}</div></figure>`).join("")}</div>`).join("")}`;
const suffix = DARK ? "-dark" : "";
writeFileSync(join(OUT, `index${suffix}.html`), html);
writeFileSync(join(OUT, `runs${suffix}.json`), JSON.stringify(runs, null, 2));
const bad = runs.flatMap((r) => r.steps.filter((s) => !s.ok).map((s) => `J${r.journey} ${r.surface} ${s.n} ${s.name}: ${s.why}`));
console.log(`\n${runs.reduce((n, r) => n + r.steps.length, 0)} steps → ${join(OUT, `index${suffix}.html`)}`);
if (bad.length) console.log("Not completed:\n  " + bad.join("\n  "));

}
