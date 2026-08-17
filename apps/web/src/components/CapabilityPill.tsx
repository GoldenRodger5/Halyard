/**
 * One capability state, rendered the same way everywhere.
 *
 * The states carry real meaning and the mapping to a tone is deliberate:
 * `implemented_no_caller` is `bad`, not `warn`, because dead code that reads as
 * a working feature is the most expensive defect this project has produced.
 * `blocked` is `warn` — it is a legitimate resting state for something waiting
 * on a credential.
 *
 * `planned` gets `info` and never green, so an unbuilt thing can never look
 * finished at a glance.
 */
import { Badge, type Tone } from '@halyard/ui';
import type { CapabilityAuditState } from '@halyard/core';

const TONE: Record<CapabilityAuditState, Tone> = {
  implemented_exercised: 'good',
  implemented_partial: 'warn',
  implemented_no_caller: 'bad',
  planned: 'info',
  blocked: 'warn',
  regression: 'bad',
};

const LABEL: Record<CapabilityAuditState, string> = {
  implemented_exercised: 'exercised',
  implemented_partial: 'partial',
  implemented_no_caller: 'no caller',
  planned: 'planned',
  blocked: 'blocked',
  regression: 'regression',
};

export function CapabilityPill({
  state,
  declared,
}: {
  state: CapabilityAuditState;
  /** Shown only when the contract claimed something better than was observed. */
  declared?: CapabilityAuditState | null;
}) {
  const diverged = declared && declared !== state;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={TONE[state]}>{LABEL[state]}</Badge>
      {diverged ? (
        <span
          className="text-[11px] text-muted"
          title={`The contract declares '${declared}'. The evidence supports '${state}'.`}
        >
          declared {LABEL[declared]}
        </span>
      ) : null}
    </span>
  );
}

/** The health vocabulary, which is separate from capability on purpose. */
export function HealthPill({ state, children }: { state: string; children: React.ReactNode }) {
  const tone: Tone =
    state === 'ok' ? 'good' : state === 'warn' ? 'warn' : state === 'down' ? 'bad' : 'neutral';
  return <Badge tone={tone}>{children}</Badge>;
}
