import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEMA_EXPECTATIONS, missingSchema } from './schema.js';

const MIGRATIONS = path.resolve(__dirname, '../../../../supabase/migrations');

describe('§492 schema expectations', () => {
  it('each names a migration that exists and adds that column', () => {
    expect(existsSync(MIGRATIONS)).toBe(true);
    const files = readdirSync(MIGRATIONS);
    for (const e of SCHEMA_EXPECTATIONS) {
      const file = files.find((f) => f.startsWith(`${e.migration}_`));
      expect(file, `${e.migration} for ${e.table}.${e.column}`).toBeDefined();
      const sql = readFileSync(path.join(MIGRATIONS, file!), 'utf8').toLowerCase();
      expect(sql, `${file} should add ${e.column}`).toMatch(new RegExp(`${e.table}[\\s\\S]*add column[\\s\\S]*${e.column}`));
    }
  });

  it('reports what a database lacks, and nothing when it has everything', () => {
    const all = SCHEMA_EXPECTATIONS.map(({ table, column }) => ({ table, column }));
    expect(missingSchema(all)).toEqual([]);
    const without = all.filter((c) => c.column !== 'treatment');
    expect(missingSchema(without).map((m) => `${m.table}.${m.column}@${m.migration}`)).toEqual([
      'renders.treatment@0071',
    ]);
  });
});
