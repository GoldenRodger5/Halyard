/**
 * §367. The map is only useful if it is complete and if every name in it is a
 * real agent. Both are exactly the kind of thing that rots quietly.
 */
import { describe, expect, it } from 'vitest';
import { AGENT_REGISTRY } from '../agents/registry.js';
import { STAGES } from './productionPlan.js';
import { STAGE_AGENTS, agentsForStage, UNATTRIBUTED } from './stageAgents.js';

const known = new Set(AGENT_REGISTRY.map((a) => a.agentId));

describe('stage attribution', () => {
  it('names an owner for every stage a production can run', () => {
    /*
     * A stage added to STAGES without an entry here would log unattributed
     * events, which is the state this file exists to replace — and it would do
     * it silently, because an unattributed lane is a legitimate thing.
     */
    const missing = STAGES.filter((stage) => !(stage in STAGE_AGENTS));
    expect(missing).toEqual([]);
  });

  it('does not name a stage that does not exist', () => {
    const extra = Object.keys(STAGE_AGENTS).filter(
      (stage) => !(STAGES as readonly string[]).includes(stage),
    );
    expect(extra).toEqual([]);
  });

  it('only names agents the registry actually has', () => {
    /*
     * The failure this prevents is a lane labelled with an agent nobody can
     * click through to — a made-up author, which is worse than no author.
     */
    const unknown: string[] = [];
    for (const [stage, agents] of Object.entries(STAGE_AGENTS)) {
      for (const id of [agents.owner, ...agents.alongside]) {
        if (!known.has(id)) unknown.push(`${stage}: ${id}`);
      }
    }
    expect(unknown).toEqual([]);
  });

  it('never lists the owner again under alongside', () => {
    const doubled = Object.entries(STAGE_AGENTS)
      .filter(([, a]) => a.alongside.includes(a.owner))
      .map(([stage]) => stage);
    expect(doubled).toEqual([]);
  });

  it('gives every stage a line saying what it is doing', () => {
    const silent = Object.entries(STAGE_AGENTS).filter(([, a]) => a.doing.trim().length < 15);
    expect(silent.map(([s]) => s)).toEqual([]);
  });

  it('falls back to a named system lane rather than dropping an event', () => {
    /*
     * An unattributed line is the poller's own bookkeeping, or a handler not
     * yet wrapped. Those are the messages that explain a run which produced
     * nothing, so they must land somewhere visible.
     */
    expect(agentsForStage('not-a-stage')).toBe(UNATTRIBUTED);
    expect(agentsForStage('research').owner).toBe('researcher');
  });
});
