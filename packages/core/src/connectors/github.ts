/**
 * GitHub connector. Milestone 24.
 *
 * Halyard has no awareness of what the products actually shipped, and
 * `getChangelog()` has been an interface method with no implementation since
 * milestone 3.
 *
 * The important design point: **raw commit messages are not content.** A batch
 * of merged PRs goes through a model call that converts them into user-facing
 * capability statements and discards refactors, dependency bumps, CI changes and
 * formatting. Nothing downstream ever sees a SHA, a branch name, or a file path
 * — the slop filter rejects those outright (see `INTERNALS_PATTERNS`).
 */
import type { ChangelogEntry } from './types.js';
import { extractJson, type LlmClient } from '../generation/llm.js';

export interface RepoConfig {
  owner: string;
  repo: string;
  /** Branches whose merges count as shipped. Defaults to the repo default. */
  branches?: string[];
  /** Paths considered user-facing. Empty means everything counts. */
  userFacingPaths?: string[];
  lastPolledAt?: string | null;
}

export interface GitHubConnectorOptions {
  token: string;
  config: RepoConfig;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}

export interface MergedPullRequest {
  number: number;
  title: string;
  body: string | null;
  mergedAt: Date;
  url: string;
  labels: string[];
  files: string[];
}

export interface Release {
  tag: string;
  name: string | null;
  body: string | null;
  publishedAt: Date;
  url: string;
}

export class GitHubError extends Error {}

export class GitHubConnector {
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;

  constructor(private readonly options: GitHubConnectorOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBase = options.apiBase ?? 'https://api.github.com';
  }

  /** Merged pull requests since a timestamp, newest first. */
  async listMergedPullRequests(since: Date, limit = 50): Promise<MergedPullRequest[]> {
    const { owner, repo } = this.options.config;
    const pulls = (await this.get(
      `/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${limit}`,
    )) as Array<{
      number: number;
      title: string;
      body: string | null;
      merged_at: string | null;
      html_url: string;
      base: { ref: string };
      labels: Array<{ name: string }>;
    }>;

    const branches = this.options.config.branches;
    const merged = pulls.filter(
      (pull) =>
        pull.merged_at !== null &&
        new Date(pull.merged_at) > since &&
        (!branches?.length || branches.includes(pull.base.ref)),
    );

    const out: MergedPullRequest[] = [];
    for (const pull of merged) {
      const files = (await this.get(
        `/repos/${owner}/${repo}/pulls/${pull.number}/files?per_page=100`,
      ).catch(() => [])) as Array<{ filename: string }>;

      out.push({
        number: pull.number,
        title: pull.title,
        body: pull.body,
        mergedAt: new Date(pull.merged_at!),
        url: pull.html_url,
        labels: pull.labels.map((l) => l.name),
        files: files.map((f) => f.filename),
      });
    }
    return out;
  }

  async listReleases(since: Date): Promise<Release[]> {
    const { owner, repo } = this.options.config;
    const releases = (await this.get(`/repos/${owner}/${repo}/releases?per_page=20`)) as Array<{
      tag_name: string;
      name: string | null;
      body: string | null;
      published_at: string | null;
      draft: boolean;
      html_url: string;
    }>;

    return releases
      .filter((r) => !r.draft && r.published_at && new Date(r.published_at) > since)
      .map((r) => ({
        tag: r.tag_name,
        name: r.name,
        body: r.body,
        publishedAt: new Date(r.published_at!),
        url: r.html_url,
      }));
  }

  async getChangelog(): Promise<ChangelogEntry[]> {
    const since = new Date(Date.now() - 90 * 86_400_000);
    return (await this.listReleases(since)).map((release) => ({
      version: release.tag,
      releasedAt: release.publishedAt,
      title: release.name ?? release.tag,
      body: release.body ?? '',
    }));
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    const { owner, repo } = this.options.config;
    try {
      const info = (await this.get(`/repos/${owner}/${repo}`)) as { full_name: string; private: boolean };
      return { ok: true, detail: `Connected to ${info.full_name}${info.private ? ' (private)' : ''}.` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  private async get(path: string): Promise<unknown> {
    const response = await this.fetchImpl(`${this.apiBase}${path}`, {
      headers: {
        authorization: `Bearer ${this.options.token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'halyard',
      },
    });

    if (response.status === 404) {
      throw new GitHubError(
        `${path} returned 404. Check the repo name and that the fine-grained token has Contents and Pull requests read access.`,
      );
    }
    if (response.status === 401 || response.status === 403) {
      const remaining = response.headers.get('x-ratelimit-remaining');
      throw new GitHubError(
        remaining === '0'
          ? 'GitHub rate limit exhausted. It resets hourly.'
          : `GitHub rejected the token (HTTP ${response.status}).`,
      );
    }
    if (!response.ok) throw new GitHubError(`GitHub ${path} failed: HTTP ${response.status}`);

    return response.json();
  }
}

// ── Filtering ──────────────────────────────────────────────────────────────

/**
 * Work that shipped but is not a *feature*. Cheap to reject before spending a
 * model call, and it keeps the summariser's input honest.
 */
const NON_FEATURE_PATTERNS = [
  /^(chore|ci|build|style|refactor|test|docs|perf)(\(.+\))?:/i,
  /\b(bump|upgrade|downgrade)\b.*\b(dependency|dependencies|version|package)\b/i,
  /^(merge|revert) /i,
  /\bdependabot\b/i,
  /\btypo\b/i,
  /\blint(ing)?\b/i,
  /\bformat(ting)?\b/i,
  /\brename\b.*\bvariable\b/i,
];

const NON_USER_FACING_PATHS = [
  /^\.github\//,
  /^\.vscode\//,
  /(^|\/)(tsconfig|eslint|prettier|vitest|jest)\./,
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /^docs?\//,
  /^scripts?\//,
  /(^|\/)README/i,
  /(^|\/)(pnpm-lock|package-lock|yarn\.lock)/,
];

export function looksLikeFeature(pull: MergedPullRequest, userFacingPaths?: string[]): boolean {
  if (NON_FEATURE_PATTERNS.some((pattern) => pattern.test(pull.title))) return false;
  if (pull.labels.some((l) => /^(chore|dependencies|ci|internal)$/i.test(l))) return false;

  const touched = pull.files.filter((file) => !NON_USER_FACING_PATHS.some((p) => p.test(file)));
  if (touched.length === 0) return false;

  if (userFacingPaths?.length) {
    return touched.some((file) => userFacingPaths.some((prefix) => file.startsWith(prefix)));
  }
  return true;
}

/**
 * Internal vocabulary that must never reach generated copy. Registered as slop
 * filter rules too — the summariser is instructed not to emit these, and the
 * filter enforces it, because "instructed not to" is not a guarantee.
 */
export const INTERNALS_PATTERNS: Array<{ rule: string; pattern: RegExp; message: string }> = [
  {
    rule: 'internals.commit_sha',
    // At least one a-f, so a seven-digit number is not mistaken for a hash.
    pattern: /\b(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/,
    message: 'Looks like a commit SHA. Internal references never go in copy.',
  },
  {
    rule: 'internals.branch_name',
    pattern: /\b(feat|fix|chore|refactor|release)\/[a-z0-9._-]+/i,
    message: 'Looks like a branch name.',
  },
  {
    rule: 'internals.file_path',
    pattern: /\b[\w-]+\/[\w-]+\.(ts|tsx|js|jsx|sql|py|go|rs|json|yml|yaml)\b/,
    message: 'Looks like a source file path.',
  },
  {
    rule: 'internals.pr_reference',
    pattern: /\b(PR|pull request)\s*#\d+|\(#\d{1,6}\)/i,
    message: 'Looks like a pull request reference.',
  },
  {
    rule: 'internals.conventional_commit',
    pattern: /^(feat|fix|chore|docs|refactor|perf|test|build|ci)(\([\w-]+\))?:/i,
    message: 'Looks like a conventional commit prefix.',
  },
];

// ── Summarisation ──────────────────────────────────────────────────────────

export interface ShippedFeature {
  title: string;
  description: string;
  sourceRefs: Array<{ type: 'pull_request' | 'release'; id: string; url: string; title: string }>;
  shippedAt: Date;
  userFacing: boolean;
}

export const SHIPPED_FEATURE_PROMPT_VERSION = 'shipped_features.v1';

/**
 * Convert a batch of merged PRs into user-facing capability statements.
 *
 * Batched deliberately: three PRs are often one feature, and summarising them
 * individually produces three posts about the same thing.
 */
export async function summariseShippedFeatures(
  pulls: MergedPullRequest[],
  input: { productName: string; productSummary: string },
  llm: LlmClient,
): Promise<ShippedFeature[]> {
  if (pulls.length === 0) return [];

  const response = await llm.complete({
    system: `You turn merged pull requests into user-facing capability statements for ${input.productName}.

A capability statement says what a person can now do that they could not before.
It is written for someone who has never seen the codebase.

RULES
- Never mention commit hashes, branch names, file paths, pull request numbers,
  function names, table names, or any internal naming. Not once.
- Merge related pull requests into one feature. Three PRs are often one thing.
- Discard anything that is not user-facing: refactors, dependency bumps, CI,
  formatting, test-only changes, internal tooling.
- If a pull request is ambiguous, discard it. A wrong feature statement is worse
  than a missing one, because it becomes a post claiming something untrue.
- The title is under 8 words. The description is one or two sentences.

PRODUCT
${input.productSummary}

Reply with JSON only:
{"features":[{"title":"","description":"","pull_numbers":[1,2],"user_facing":true}]}
An empty array is a valid and often correct answer.`,
    messages: [
      {
        role: 'user',
        content: pulls
          .map(
            (pull) =>
              `#${pull.number} ${pull.title}\n${(pull.body ?? '').slice(0, 400)}\nfiles: ${pull.files
                .slice(0, 12)
                .join(', ')}`,
          )
          .join('\n\n---\n\n'),
      },
    ],
    maxTokens: 1500,
    promptVersion: SHIPPED_FEATURE_PROMPT_VERSION,
  });

  const parsed = extractJson<{
    features?: Array<{
      title?: string;
      description?: string;
      pull_numbers?: number[];
      user_facing?: boolean;
    }>;
  }>(response.text);

  return (parsed.features ?? [])
    .filter((feature) => feature.title && feature.description)
    .map((feature) => {
      const refs = (feature.pull_numbers ?? [])
        .map((number) => pulls.find((p) => p.number === number))
        .filter((p): p is MergedPullRequest => Boolean(p));

      return {
        title: feature.title!.trim(),
        description: feature.description!.trim(),
        userFacing: feature.user_facing !== false,
        sourceRefs: refs.map((pull) => ({
          type: 'pull_request' as const,
          id: String(pull.number),
          url: pull.url,
          title: pull.title,
        })),
        shippedAt: refs.length
          ? new Date(Math.max(...refs.map((r) => r.mergedAt.getTime())))
          : new Date(),
      };
    });
}

/**
 * Brief staleness. Every generation prompt carries `brief_summary`; once enough
 * has shipped since it was written, that summary is describing a product that
 * no longer exists, and every draft drifts with it.
 */
export function briefStaleness(input: {
  featuresSinceBriefUpdate: number;
  threshold: number;
  briefUpdatedAt: Date | null;
}): { stale: boolean; message: string } {
  if (!input.briefUpdatedAt) {
    return { stale: true, message: 'No brief has been ingested. Every generation prompt is running without product context.' };
  }

  const days = Math.round((Date.now() - input.briefUpdatedAt.getTime()) / 86_400_000);

  if (input.featuresSinceBriefUpdate >= input.threshold) {
    return {
      stale: true,
      message: `${input.featuresSinceBriefUpdate} features have shipped since the brief was updated ${days} days ago. The brief no longer describes the product, and every generation prompt is drifting with it.`,
    };
  }
  return {
    stale: false,
    message: `${input.featuresSinceBriefUpdate} features shipped since the brief was updated ${days} days ago.`,
  };
}
