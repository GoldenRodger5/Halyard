/**
 * Shared run plumbing: the ideas file, the pinned knowledge pack, the proof,
 * the ledger, and the run directory. Files only — `runs/<date>/<post>/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { assembleBrief, loadKnowledgePack, productPostsPaused, type KnowledgePack } from './knowledge.js';
import { Ledger } from './ledger.js';
import { loadStoredOutput, type AssetRecord, type GitRef } from './assets.js';
import type { FactSource } from './copyGate.js';

export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
export const RUNS_DIR = path.join(REPO_ROOT, 'runs');
export const LEDGER_FILE = path.join(RUNS_DIR, 'ledger.jsonl');
export const SPEND_CAP_USD = Number(process.env.MK_SPEND_CAP_USD || 15);

export interface Idea {
  id: string;
  pillar: string;
  series?: string;
  format: 'ig_carousel' | 'short_video';
  platform: string;
  variants?: string[];
  canvas: { width: number; height: number };
  target_seconds?: [number, number];
  question: string;
  audience: string;
  proof: { file: string; export: string };
  claim_ids: string[];
  link?: string;
  never_show: string[];
  fact_sources: FactSource[];
  slides?: Array<{
    role: string;
    must: string;
    sources?: string[];
    /** A real product screen crop for this slide (device px in the capture). */
    shot?: { file: string; crop: { left: number; top: number; width: number; height: number } };
    shot2?: { file: string; crop: { left: number; top: number; width: number; height: number } };
    shot3?: { file: string; crop: { left: number; top: number; width: number; height: number } };
  }>;
  /** Video template: `screen-hero` (real app screens) or `explainer` (no-app, typographic diagrams). */
  composition?: 'screen-hero' | 'explainer';
  captures?: string;
  beats?: Array<{ role: string; must: string; shots?: ShotSpec[]; visual?: Record<string, unknown> }>;
}

export interface ShotSpec {
  kind?: 'photo-hook' | 'photo-close' | 'clip' | 'still';
  src?: string;
  from?: number;
  y?: number;
  yEnd?: number;
  weight?: number;
}

export interface IdeasFile {
  product: string;
  product_terms: string[];
  product_repo: string;
  knowledge: { ref: string; path: string };
  proof_commit: string;
  ideas: Idea[];
}

export function loadIdeas(file = path.join(REPO_ROOT, 'packages/marketing/ideas/recipefix.yaml')): IdeasFile {
  return yaml.load(readFileSync(file, 'utf8')) as IdeasFile;
}

export interface RunContext {
  ideas: IdeasFile;
  idea: Idea;
  pack: KnowledgePack;
  brief: string;
  paused: string | null;
  proofRef: GitRef;
  proof: Record<string, unknown>;
  proofRecord: AssetRecord;
  proofCapturedOn: string | null;
  ledger: Ledger;
  runId: string;
  dir: string;
}

export function openRun(ideaId: string, date = new Date().toISOString().slice(0, 10)): RunContext {
  const ideas = loadIdeas();
  const idea = ideas.ideas.find((i) => i.id === ideaId);
  if (!idea) throw new Error(`No idea '${ideaId}'. Known: ${ideas.ideas.map((i) => i.id).join(', ')}`);
  const pack = loadKnowledgePack({ kind: 'git', repo: ideas.product_repo, ref: ideas.knowledge.ref, path: ideas.knowledge.path });
  const proofRef = { repo: ideas.product_repo, commit: ideas.proof_commit };
  const stored = loadStoredOutput(proofRef, idea.proof.file, idea.proof.export);
  const runId = `${idea.id}-${idea.format === 'ig_carousel' ? 'ig-carousel' : 'short'}`;
  const dir = path.join(RUNS_DIR, date, runId);
  mkdirSync(dir, { recursive: true });
  return {
    ideas,
    idea,
    pack,
    brief: assembleBrief(pack),
    paused: productPostsPaused(pack),
    proofRef,
    proof: stored.data,
    proofRecord: stored.record,
    proofCapturedOn: stored.capturedOn,
    ledger: new Ledger(LEDGER_FILE, SPEND_CAP_USD),
    runId,
    dir,
  };
}

export function writeJson(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJsonIfExists<T>(file: string): T | null {
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : null;
}

/** The proof excerpts a writer is allowed to draw from, by path, so a claim can cite them. */
export function proofExcerpts(proof: Record<string, unknown>, paths: string[]): string {
  const resolve = (p: string): unknown =>
    p.split(/\.|\[|\]/).filter(Boolean).reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], proof);
  return paths.map((p) => `${p}: ${JSON.stringify(resolve(p))}`).join('\n');
}
