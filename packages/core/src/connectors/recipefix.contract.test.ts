/**
 * The RecipeFix connector against the server's REAL input schemas.
 *
 * Every other test in recipefix.test.ts asserts what the connector sends by
 * comparing it to what the connector was written to send — which is how
 * `notes: <intent>` survived: the test expected `notes`, the connector sent
 * `notes`, and the server's zod schema (which declares `swaps`, not `notes`)
 * silently stripped it. RecipeFix calls this shape gotcha 18/38.
 *
 * This test validates every argument object the connector actually emits
 * against the JSON Schema the production server advertised in `tools/list`
 * (fixture captured 2026-10-26, MCP build 9d0df50d5725). An undeclared key
 * fails, because to the server it does not exist. A missing required key
 * fails. A value outside the declared type/range/enum fails.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RecipeFixConnector, RECIPEFIX_TOOLS } from './recipefix.js';

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  format?: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.join(here, '__fixtures__/recipefix-mcp-tools.2026-10-26.json'), 'utf8'),
) as { tools: Record<string, JsonSchema>; not_served: Record<string, string> };

/** Problems with `value` against `schema`; empty means the server accepts it as sent. */
export function schemaProblems(value: unknown, schema: JsonSchema, at = '$'): string[] {
  const problems: string[] = [];
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${at}: not an object`];
    const record = value as Record<string, unknown>;
    const declared = schema.properties ?? {};
    for (const key of Object.keys(record)) {
      if (record[key] === undefined) continue; // JSON.stringify drops it; the server never sees it
      if (!(key in declared)) problems.push(`${at}.${key}: not declared by the server schema (zod strips it)`);
      else problems.push(...schemaProblems(record[key], declared[key]!, `${at}.${key}`));
    }
    for (const key of schema.required ?? []) {
      if (record[key] === undefined) problems.push(`${at}.${key}: required by the server schema, not sent`);
    }
    return problems;
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${at}: not an array`];
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${at}: more than ${schema.maxItems} items`);
    value.forEach((v, i) => problems.push(...(schema.items ? schemaProblems(v, schema.items, `${at}[${i}]`) : [])));
    return problems;
  }
  if (schema.type === 'string') {
    if (typeof value !== 'string') return [`${at}: not a string`];
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${at}: longer than ${schema.maxLength}`);
    if (schema.format === 'uri' && !/^https?:\/\//.test(value)) problems.push(`${at}: not a uri`);
  }
  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof value !== 'number' || (schema.type === 'integer' && !Number.isInteger(value))) return [`${at}: not an ${schema.type}`];
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${at}: above ${schema.maximum}`);
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') return [`${at}: not a boolean`];
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${at}: not one of ${schema.enum.join(', ')}`);
  return problems;
}

/** A recording client that answers like the server and keeps every call. */
function recordingClient() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const answers: Record<string, unknown> = {
    adapt_recipe: {
      persisted: false,
      adaptation: {
        recipeName: 'Chicken Tikka Masala with Coconut Cream',
        servings: { original: 4, adapted: 6 },
        ingredients: [{ original: '1/2 cup heavy cream', adapted: '3/4 cup full-fat coconut cream', changed: true, changeType: 'both', changeReason: 'Coconut cream restores richness without dairy.' }],
        steps: [{ title: 'Finish', updated_note: 'Keep the sauce at a gentle simmer.' }],
      },
    },
    get_discover_recipes: { recipes: [{ title: 'Baked Ziti', source_url: 'https://example.test/ziti', suggested_diet: 'Gluten-Free' }] },
    search_recipes: { results: { results: [] } },
    estimate_nutrition: { calories: 612 },
    get_popular_transformations: { window_days: 30, transformations: [{ transformation: 'dairy_free', count: 13, trend: 'up' }] },
    get_changelog: { entries: [], count: 0, note: 'No changelog exists yet' },
    list_before_after_examples: { count: 0, examples: [] },
  };
  return {
    calls,
    client: {
      callToolJson: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
        return answers[name];
      },
      listTools: async () => Object.keys(FIXTURE.tools).map((name) => ({ name })),
    },
  };
}

describe('RecipeFix connector ↔ live server schema', () => {
  it('the validator itself rejects the defect it exists to catch', () => {
    // Guard the guard: without this, a validator that accepted everything would pass every case below.
    expect(schemaProblems({ url: 'https://x.test/r', dietary: ['Vegan'], notes: 'x' }, FIXTURE.tools.adapt_recipe!)).toEqual([
      '$.notes: not declared by the server schema (zod strips it)',
    ]);
    expect(schemaProblems({ ingredients: ['a'], recipe: 'x' }, FIXTURE.tools.estimate_nutrition!)).toEqual([
      '$.recipe: not declared by the server schema (zod strips it)',
      '$.servings: required by the server schema, not sent',
    ]);
  });

  it('every argument object the connector emits is accepted as sent', async () => {
    const { calls, client } = recordingClient();
    const connector = new RecipeFixConnector({ url: 'https://example.test/mcp', client: client as never, sleep: async () => undefined });

    await connector.generateSample({
      intent: 'show why a dairy-free curry needs a gentle simmer',
      params: { url: 'https://example.test/tikka', dietary: ['Dairy-Free'], servings: 6, swaps: 'use coconut cream instead of heavy cream', withNutrition: true },
    });
    await connector.generateSample({ intent: 'something for the weekend', params: {} }); // discover path
    await connector.listRecentActivity(new Date(Date.now() - 30 * 86_400_000));
    await connector.getChangelog();
    await connector.listBeforeAfterExamples('dairy-free');
    await connector.listBeforeAfterExamples();

    // The sweep must have matched something, or it proves nothing (RecipeFix gotcha 14b).
    const names = new Set(calls.map((c) => c.name));
    expect([...names].sort()).toEqual([
      'adapt_recipe',
      'estimate_nutrition',
      'get_changelog',
      'get_discover_recipes',
      'get_popular_transformations',
      'list_before_after_examples',
      'search_recipes',
    ]);

    const problems = calls.flatMap((c) => {
      const schema = FIXTURE.tools[c.name];
      if (!schema) return [`${c.name}: not a tool the server serves`];
      return schemaProblems(c.args, schema).map((p) => `${c.name} ${p}`);
    });
    expect(problems).toEqual([]);
  });

  it('never forwards the marketing intent as a cooking instruction', async () => {
    const { calls, client } = recordingClient();
    const connector = new RecipeFixConnector({ url: 'https://example.test/mcp', client: client as never });
    await connector.generateSample({ intent: 'gluten-free bread, show the vinegar change', params: { url: 'https://example.test/b', dietary: ['Gluten-Free'] } });
    const adapt = calls.find((c) => c.name === 'adapt_recipe')!;
    expect(JSON.stringify(adapt.args)).not.toContain('vinegar change');
    expect(adapt.args.persist).toBe(false);
  });

  it('probes only tools the server serves, and never the per-account history as product activity', () => {
    const probed = RECIPEFIX_TOOLS.map((t) => t.name);
    expect(probed.filter((n) => !(n in FIXTURE.tools))).toEqual([]);
    expect(probed).not.toContain('list_adaptation_history');
    expect(Object.keys(FIXTURE.not_served)).toEqual(['list_adaptation_history']);
  });
});
