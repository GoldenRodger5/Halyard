/**
 * §389. Master ▸ System — jobs, health, and the kill switch.
 *
 * `unknown` is a first-class state here, because a check that cannot run must
 * not report `ok`. Every check shows its **measured value** beside its verdict,
 * so the verdict is arguable rather than asserted — the same discipline the
 * Auditor applies to agents and the Numbers room applies to metrics.
 *
 * The kill switch stops things mid-flight **without losing them**: a job that
 * was about to publish is held, not failed, so turning publishing back on
 * resumes rather than restarts.
 */
import { Action, Label, Sheet, cx } from '@halyard/ui/studio';
import { getSystemHealth } from '@/lib/agentQueries';
import { getNavCounts, getSettings } from '@/lib/queries';
import { query } from '@/lib/db';
import { setGeneration, setKillSwitch } from '@/app/(dashboard)/settings/actions';

export const dynamic = 'force-dynamic';

const STATE: Record<string, { label: string; tone: string }> = {
  ok: { label: 'ok', tone: 'text-passed' },
  warn: { label: 'warn', tone: 'text-lit' },
  fail: { label: 'fail', tone: 'text-onair' },
  unknown: { label: 'unknown', tone: 'text-quiet' },
};

export default async function System() {
  const [checks, settings, counts, jobs] = await Promise.all([
    getSystemHealth(),
    getSettings(),
    getNavCounts(),
    query<{ status: string; n: string }>(
      `select status, count(*)::text as n from jobs group by status order by status`,
    ),
  ]);

  const unknown = checks.filter((c) => c.state === 'unknown').length;

  return (
    <div className="flex flex-col gap-3.5">
      {/* ── The kill switch ────────────────────────────────── */}
      <Sheet tone={settings.publishing_enabled ? 'plain' : 'onair'}>
        <Label>Publishing</Label>
        <p className="max-w-[74ch] text-[13px] leading-relaxed">
          {settings.publishing_enabled
            ? 'On. Approved pieces publish at their slot.'
            : 'Off. Nothing publishes, whatever any account says.'}
        </p>
        <p className="mt-1 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
          {settings.publishing_disabled_reason ??
            'The switch stops things mid-flight without losing them — a job about to publish is held, not failed, so turning it back on resumes rather than restarts.'}
        </p>
        <form action={setKillSwitch} className="mt-2.5 flex flex-wrap items-center gap-2">
          <input type="hidden" name="enabled" value={settings.publishing_enabled ? '0' : '1'} />
          {settings.publishing_enabled ? (
            <input
              name="reason"
              required
              placeholder="Why are you stopping it? This is recorded."
              className="min-w-[240px] flex-1 rounded-[7px] border border-rule2 bg-sheet px-2.5 py-2 text-xs outline-none focus:border-lit"
            />
          ) : null}
          <Action tone={settings.publishing_enabled ? 'ghost' : 'brass'} small>
            {settings.publishing_enabled ? 'Stop publishing' : 'Start publishing'}
          </Action>
        </form>
      </Sheet>

      <Sheet tone={settings.generation_enabled ? 'plain' : 'lit'}>
        <Label>Generation</Label>
        <p className="max-w-[74ch] text-[13px] leading-relaxed">
          {settings.generation_enabled
            ? 'On. The daily job fills the Gallery.'
            : 'Off. Nothing new is being made.'}
        </p>
        <form action={setGeneration} className="mt-2.5">
          <input type="hidden" name="enabled" value={settings.generation_enabled ? '0' : '1'} />
          <Action tone="ghost" small>
            {settings.generation_enabled ? 'Stop generating' : 'Start generating'}
          </Action>
        </form>
      </Sheet>

      {/* ── Health ─────────────────────────────────────────── */}
      <Sheet>
        <Label>
          Health · measured, not asserted
          {unknown > 0 ? ` · ${unknown} could not be checked` : ''}
        </Label>
        <ul className="flex flex-col">
          {checks.map((check) => {
            const view = STATE[check.state] ?? STATE.unknown!;
            return (
              <li
                key={check.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-rule2 py-2 first:border-t-0 first:pt-0"
              >
                <span
                  className={cx(
                    'w-[62px] shrink-0 font-data text-[10px] uppercase tracking-[0.07em]',
                    view.tone,
                  )}
                >
                  {view.label}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">{check.label}</span>
                {/*
                  The measured value, always. A verdict with no number behind it
                  is an opinion, and this screen exists so an operator can
                  disagree with one.
                */}
                <span className="shrink-0 font-data text-[11px] text-quiet">{check.detail}</span>
              </li>
            );
          })}
        </ul>
      </Sheet>

      {/* ── The queue ──────────────────────────────────────── */}
      <Sheet>
        <Label>Jobs</Label>
        <div className="flex flex-wrap gap-x-5 gap-y-1 font-data text-[11px] text-quiet">
          {jobs.length === 0 ? (
            <span>No jobs at all — the queue has never been used.</span>
          ) : (
            jobs.map((j) => (
              <span key={j.status}>
                {j.status}{' '}
                <b
                  className={cx(
                    'font-medium',
                    j.status === 'dead' ? 'text-onair' : j.status === 'running' ? 'text-lit' : 'text-sink',
                  )}
                >
                  {j.n}
                </b>
              </span>
            ))
          )}
        </div>
        <p className="mt-2 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
          {counts.failed > 0
            ? `${counts.failed} pieces are in a failed state. A dead job is one that exhausted its retries — the reason each gave up is on the job.`
            : 'Nothing has exhausted its retries.'}
        </p>
      </Sheet>
    </div>
  );
}
