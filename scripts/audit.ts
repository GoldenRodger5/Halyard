/**
 * Run the Halyard Auditor.
 *
 *   pnpm audit-halyard              static analysis only
 *   pnpm audit-halyard --runtime    include execution records from the database
 *   pnpm audit-halyard --persist    write the verdict to capability_audit_state
 *
 * Without `--runtime` no agent can reach `implemented_exercised`, because
 * nothing can prove invocation. That is the honest answer when the evidence is
 * unavailable rather than a limitation to apologise for.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { STATE_COLOUR, type CapabilityAuditState } from '@halyard/core';
import {
  collectFeatureFacts,
  collectGateFacts,
  collectJobFacts,
  collectRuntimeEvidence,
  primeFileCache,
  runAudit,
  scan,
  summarise,
  DEFAULT_ROOTS,
  EMPTY_RUNTIME,
} from '@halyard/audit';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const COLOUR: Record<string, string> = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  orange: '\x1b[38;5;208m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  grey: '\x1b[90m',
};
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function paint(state: CapabilityAuditState, text: string): string {
  return `${COLOUR[STATE_COLOUR[state]] ?? ''}${text}${RESET}`;
}

async function main(): Promise<void> {
  const withRuntime = process.argv.includes('--runtime');
  const persist = process.argv.includes('--persist');

  primeFileCache(REPO_ROOT);
  const facts = scan(REPO_ROOT, DEFAULT_ROOTS);

  let pool: pg.Pool | null = null;
  let runtime = EMPTY_RUNTIME;
  let features: Awaited<ReturnType<typeof collectFeatureFacts>> = [];

  if (withRuntime || persist) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.error('--runtime needs DATABASE_URL. Running static-only would silently change the verdict.');
      process.exit(1);
    }
    pool = new pg.Pool({ connectionString, max: 4 });
    const query = async <T>(sql: string, params?: unknown[]): Promise<T[]> =>
      (await pool!.query(sql, params)).rows as T[];

    runtime = await collectRuntimeEvidence(query);
    features = await collectFeatureFacts(query, facts);
  }

  /**
   * Which tools this deployment can actually provide.
   *
   * Read from the environment rather than assumed, so an agent declaring a tool
   * whose credential is absent is reported as blocked rather than as working.
   */
  const availableTools = new Set<string>(['llm', 'browser', 'github-api']);
  if (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY) availableTools.add('vision-api');
  if (process.env.ELEVENLABS_API_KEY) availableTools.add('tts');
  // No web-search tool is configured on this deployment; the fact-checker
  // degrades to model knowledge, which the contract already states.

  const report = runAudit({
    repoRoot: REPO_ROOT,
    jobs: collectJobFacts(REPO_ROOT),
    gates: collectGateFacts(facts),
    features,
    availableTools,
    runtime,
  });

  // ── Output ───────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}Halyard Auditor${RESET}`);
  console.log(`${DIM}${summarise(report)}${RESET}`);
  console.log(
    `${DIM}runtime evidence: ${withRuntime ? 'included' : 'NOT included — nothing can be proved exercised'}${RESET}\n`,
  );

  console.log(`${BOLD}Agents${RESET}`);
  const byState = new Map<CapabilityAuditState, typeof report.agents>();
  for (const audit of report.agents) {
    byState.set(audit.state, [...(byState.get(audit.state) ?? []), audit]);
  }
  const order: CapabilityAuditState[] = [
    'regression',
    'implemented_no_caller',
    'blocked',
    'implemented_partial',
    'planned',
    'implemented_exercised',
  ];
  for (const state of order) {
    for (const audit of byState.get(state) ?? []) {
      const divergent = audit.declaredState !== audit.state ? ` ${DIM}(declared ${audit.declaredState})${RESET}` : '';
      console.log(`  ${paint(state, state.padEnd(22))} ${audit.agentId.padEnd(28)}${divergent}`);
      console.log(`    ${DIM}${audit.reason}${RESET}`);
    }
  }

  if (report.findings.length > 0) {
    console.log(`\n${BOLD}Findings${RESET}`);
    const bySeverity = ['error', 'warning', 'info'] as const;
    for (const severity of bySeverity) {
      for (const finding of report.findings.filter((f) => f.severity === severity)) {
        const mark = severity === 'error' ? `${COLOUR.red}✗${RESET}` : severity === 'warning' ? `${COLOUR.orange}!${RESET}` : `${DIM}·${RESET}`;
        console.log(`  ${mark} ${BOLD}${finding.rule}${RESET} ${DIM}${finding.subject}${RESET}`);
        console.log(`    ${finding.detail}`);
      }
    }
  } else {
    console.log(`\n${COLOUR.green}No findings.${RESET}`);
  }

  // ── Persist ──────────────────────────────────────────────────────────────
  if (persist && pool) {
    let gitSha: string;
    try {
      gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
    } catch {
      // Not a git checkout, or git is unavailable. The finding is still valid;
      // it just cannot be traced to a commit.
      gitSha = '';
    }

    const runRows = await pool.query<{ id: string }>(
      `insert into auditor_runs
         (completed_at, duration_ms, findings_total, findings_error, findings_warning,
          capabilities_audited, git_sha, triggered_by)
       values (now(), $1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        report.durationMs,
        report.counts.total,
        report.counts.error,
        report.counts.warning,
        report.agents.length,
        gitSha || null,
        'cli',
      ],
    );
    const auditorRunId = runRows.rows[0]!.id;

    for (const finding of report.findings) {
      await pool.query(
        `insert into auditor_findings
           (auditor_run_id, rule, severity, subject, subject_kind, detail, evidence)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [
          auditorRunId,
          finding.rule,
          finding.severity,
          finding.subject,
          finding.subjectKind,
          finding.detail,
          JSON.stringify(finding.evidence),
        ],
      );
    }

    /**
     * Capability state, keeping the previous value so a transition is
     * detectable. A state that overwrites its own history cannot tell you that
     * something broke, only that it is broken — and the first is the alert.
     */
    for (const audit of report.agents) {
      await pool.query(
        `insert into capability_audit_state
           (capability_id, kind, state, reason, evidence, declared_state, determined_at, determined_by)
         values ($1,'agent',$2,$3,$4,$5, now(), 'auditor')
         on conflict (capability_id) do update
           set previous_state = case
                 when capability_audit_state.state is distinct from excluded.state
                 then capability_audit_state.state else capability_audit_state.previous_state end,
               changed_at = case
                 when capability_audit_state.state is distinct from excluded.state
                 then now() else capability_audit_state.changed_at end,
               state = excluded.state,
               reason = excluded.reason,
               evidence = excluded.evidence,
               declared_state = excluded.declared_state,
               determined_at = excluded.determined_at,
               determined_by = excluded.determined_by`,
        [
          `agent:${audit.agentId}`,
          audit.state,
          audit.reason,
          JSON.stringify(audit.evidence),
          audit.declaredState,
        ],
      );
    }

    console.log(`\n${DIM}Persisted as auditor run ${auditorRunId}${RESET}`);
  }

  await pool?.end();

  console.log('');
  // A non-zero exit on errors, so CI can gate on it later. Warnings do not
  // fail: three known orphans are tracked defects, not a broken build.
  if (report.counts.error > 0) process.exitCode = 1;
}

void main();
