/**
 * The spend ledger: one JSON line per paid call, and a hard cap checked BEFORE
 * the call. A file, not a table — the lean lane has no database (ARCHITECTURE §5).
 *
 * The cap is total-to-date across every run that shares the ledger file, so a
 * POC's budget cannot be spent twice by running it twice.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface LedgerEntry {
  at: string;
  run: string;
  provider: string;
  model: string;
  purpose: string;
  /** e.g. `{ inputTokens, outputTokens }` or `{ characters }`. */
  units: Record<string, number>;
  usd: number;
  /** How `usd` was arrived at: the provider's own figure, or a price table (estimate). */
  basis: string;
}

export class SpendCapError extends Error {
  constructor(spent: number, estimate: number, cap: number) {
    super(`Spend cap: $${spent.toFixed(4)} spent + $${estimate.toFixed(4)} estimated would exceed $${cap.toFixed(2)}. Nothing was called.`);
    this.name = 'SpendCapError';
  }
}

export class Ledger {
  constructor(
    public readonly file: string,
    public readonly capUsd: number,
  ) {}

  entries(): LedgerEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as LedgerEntry);
  }

  spent(): number {
    return this.entries().reduce((sum, e) => sum + e.usd, 0);
  }

  /** Throws before a call that could break the cap. Estimate high: under-reporting is the dangerous error. */
  assertCanSpend(estimateUsd: number): void {
    const spent = this.spent();
    if (spent + estimateUsd > this.capUsd) throw new SpendCapError(spent, estimateUsd, this.capUsd);
  }

  record(entry: Omit<LedgerEntry, 'at'>): LedgerEntry {
    const full: LedgerEntry = { at: new Date().toISOString(), ...entry };
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(full)}\n`);
    return full;
  }
}
