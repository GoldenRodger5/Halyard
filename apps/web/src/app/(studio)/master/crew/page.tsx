/**
 * §389. Master ▸ The crew — every agent, and the state the Auditor derived.
 *
 * The governing rule of this system is *agents perceive, code decides*, and
 * this screen is where that becomes visible: an agent's **contract** declares
 * intent, and the **Auditor** decides what is actually true about it. Where the
 * two disagree the Auditor wins, and the disagreement is the interesting row.
 *
 * A declared state with no observation is not a working agent. It is a claim
 * nobody has checked, and it reads as `unknown` here rather than as `working` —
 * the same discipline as gotcha 9, applied to the crew instead of to metrics.
 */
import { Label, Sheet, cx } from '@halyard/ui/studio';
import { Deeper } from '@/components/studio/Deeper';
import { getAgentOverview } from '@/lib/agentQueries';
import { formatInOperatorTz } from '@/lib/format';
import { getProducts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * The Auditor's own vocabulary, in the operator's words.
 *
 * Not renamed — *translated*. `implemented_no_caller` is the single most
 * valuable state this system computes: built, typed, tested, and called by
 * nothing. It is the shape of §303, §362, §374 and §387, and it earns a red
 * lamp rather than a grey one, because an agent nobody calls is indistinguishable
 * from an agent that does not exist.
 */
const STATE: Record<string, { label: string; tone: string }> = {
  implemented_exercised: { label: 'working', tone: 'text-passed' },
  implemented_partial: { label: 'partly wired', tone: 'text-lit' },
  implemented_no_caller: { label: 'nothing calls it', tone: 'text-onair' },
  planned: { label: 'not built', tone: 'text-quiet' },
  blocked: { label: 'blocked', tone: 'text-parked' },
  regression: { label: 'regressed', tone: 'text-onair' },
};

const UNOBSERVED = { label: 'never observed', tone: 'text-quiet' };

export default async function Crew() {
  const [agents, products] = await Promise.all([getAgentOverview(), getProducts()]);
  const tz = products[0]?.operator_timezone ?? 'UTC';

  /* Grouped by team, because that is how the floor is arranged. */
  const teams = new Map<string, typeof agents>();
  for (const agent of agents) {
    const team = agent.contract.team;
    if (!teams.has(team)) teams.set(team, []);
    teams.get(team)!.push(agent);
  }

  const unobserved = agents.filter((a) => !a.observed).length;
  const uncalled = agents.filter((a) => a.observed?.state === 'implemented_no_caller').length;

  return (
    <div className="flex flex-col gap-3.5">
      <p className="max-w-[74ch] text-sm leading-relaxed text-quiet">
        {agents.length} agents. A contract declares what an agent is <em>for</em>; the Auditor
        decides what is <em>true</em> about it from what actually ran. Where they disagree, the
        Auditor wins — a model can never mark its own output verified.
        {unobserved > 0
          ? ` ${unobserved} have never been observed, which reads as never observed rather than as working.`
          : ''}
        {uncalled > 0
          ? ` ${uncalled} ${uncalled === 1 ? 'is' : 'are'} built and called by nothing — the defect shape this codebase keeps finding.`
          : ''}
      </p>

      {[...teams.entries()].map(([team, members]) => (
        <Sheet key={team}>
          <Label>
            {team} · {members.length}
          </Label>
          <ul className="flex flex-col">
            {members.map(({ contract, observed, runs, failures, lastRunAt }) => (
              <li
                key={contract.agentId}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 border-t border-rule2 py-2.5 first:border-t-0 first:pt-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug">
                    {contract.name}
                    <span className="ml-2 font-data text-[10px] text-quiet">
                      {contract.model ?? 'deterministic'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-quiet">
                    {contract.purpose}
                  </span>
                  {/*
                    The Auditor's reason, printed. "Broken" with no reason is a
                    verdict without evidence, which is the thing the Auditor
                    exists to avoid producing.
                  */}
                  {observed?.reason ? (
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-quiet">
                      {observed.reason}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right font-data text-[10px] uppercase tracking-[0.06em]">
                  {(() => {
                    const view = observed ? (STATE[observed.state] ?? UNOBSERVED) : UNOBSERVED;
                    return (
                      <span className={cx('block', view.tone)} title={observed?.state}>
                        {view.label}
                      </span>
                    );
                  })()}
                  <span className="mt-0.5 block text-quiet">
                    {runs === 0
                      ? 'never run'
                      : `${runs} run${runs === 1 ? '' : 's'}${failures > 0 ? `, ${failures} refused` : ''}`}
                  </span>
                  {lastRunAt ? (
                    <span className="mt-0.5 block text-quiet">
                      {formatInOperatorTz(lastRunAt, tz, 'd MMM')}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Sheet>
      ))}
      <Deeper
        links={[
          { href: '/master/crew/runs', label: 'Recent runs' },
          { href: '/master/crew/versions', label: 'Prompt versions' },
        ]}
      />
    </div>
  );
}
