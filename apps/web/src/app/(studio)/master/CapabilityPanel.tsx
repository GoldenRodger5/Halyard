import { Badge, Card, SectionTitle } from '@halyard/ui';
import {
  VERDICT_LABEL,
  VERDICT_TONE,
  type CapabilityResolution,
  type PlatformId,
} from '@halyard/core';
import type { ProbeRow, StrategyView } from '@/lib/capabilityQueries';
import { probeProviderCapability } from './actions';

/**
 * What each connected platform can actually do, and how Halyard knows.
 *
 * The design rule this panel exists to hold: **a verdict is never shown without
 * its reason.** A green tick that means "an adapter exists" and one that means
 * "a probe watched it work" must not render identically, which is why
 * `declared` has its own label and its own tone rather than being folded into
 * verified.
 */
export function CapabilityPanel({
  views,
  probes,
  strategies,
}: {
  views: Array<{ platform: PlatformId; resolutions: CapabilityResolution[] }>;
  probes: ProbeRow[];
  strategies: StrategyView[];
}) {
  const lastProbe = probes[0];
  const everProbed = probes.length > 0;

  return (
    <>
      <Card className="mt-8 p-5">
        <div className="flex items-baseline justify-between gap-4">
          <SectionTitle hint="what each platform can actually do, and how we know">
            Platform capability
          </SectionTitle>
          <form action={probeProviderCapability}>
            <input type="hidden" name="provider" value="blotato" />
            <button
              type="submit"
              className="rounded-lg border border-line px-3 py-1.5 text-sm text-muted hover:bg-sunk hover:text-ink"
            >
              Probe the provider
            </button>
          </form>
        </div>

        {/*
          * The state that matters most, said plainly.
          *
          * "Never probed" and "probed and found limited" look identical on a
          * grid of greys, and only one of them is a reason to press the button.
          */}
        {!everProbed ? (
          <p className="mt-2 text-sm text-muted">
            No probe has ever run, so every capability below is <strong>unknown</strong> rather
            than unsupported. Unknown is not a failure — it is the honest state before anything
            has been checked, and nothing will publish on the strength of it.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Last probe: <strong>{lastProbe!.outcome}</strong> — {lastProbe!.detail}
            {lastProbe!.outcome === 'unavailable' ? (
              <>
                {' '}
                A probe that could not run proves nothing, so no capability was downgraded.
              </>
            ) : null}
          </p>
        )}

        <div className="mt-4 space-y-4">
          {views.map((view) => (
            <div key={view.platform}>
              <p className="text-sm font-medium text-ink">{view.platform}</p>
              <ul className="mt-1 space-y-1">
                {view.resolutions.map((resolution) => (
                  <li key={resolution.action} className="flex items-baseline gap-2 text-sm">
                    <span className="w-32 shrink-0 text-muted">{resolution.action}</span>
                    <Badge tone={VERDICT_TONE[resolution.verdict]}>
                      {VERDICT_LABEL[resolution.verdict]}
                      {resolution.stale ? ' · ageing' : ''}
                    </Badge>
                    <span className="text-muted">{resolution.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <SectionTitle hint="how much of this is measured">Platform strategy</SectionTitle>
        {/*
          * Every strategic claim carries its basis, and the count is shown.
          *
          * The implementation plan forbids inventing best practices as measured
          * facts. Halyard has published nothing, so no claim here can be a
          * Halyard finding — and saying so is more useful than a confident
          * screen that implies otherwise.
          */}
        <p className="mt-1 text-sm text-muted">
          None of this is measured from Halyard&rsquo;s own results — nothing has been published
          yet, so every claim is either a platform fact or an industry heuristic. The basis is
          shown per platform so a starting position is never mistaken for a finding.
        </p>
        <div className="mt-4 space-y-4">
          {strategies.map((strategy) => (
            <div key={strategy.platform}>
              <p className="text-sm font-medium text-ink">
                {strategy.platform}{' '}
                <span className="font-normal text-muted">· {strategy.discovery}</span>
              </p>
              <p className="text-xs text-muted">
                {strategy.breakdown.platform_fact} platform fact
                {strategy.breakdown.platform_fact === 1 ? '' : 's'} ·{' '}
                {strategy.breakdown.industry_heuristic} industry heuristic
                {strategy.breakdown.industry_heuristic === 1 ? '' : 's'} ·{' '}
                {strategy.breakdown.halyard_empirical} measured here
              </p>
              <ul className="mt-1 space-y-0.5">
                {strategy.claims.slice(0, 3).map((claim, i) => (
                  <li key={i} className="text-sm text-muted">
                    <span className="text-ink">{claim.claim}</span>{' '}
                    <span className="text-xs">({claim.basis.replace(/_/g, ' ')})</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
