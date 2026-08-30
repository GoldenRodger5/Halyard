'use client';

/**
 * §356. The run, as it happens.
 *
 * Two lanes, because they answer different questions. **What happened** is the
 * event feed — the decisions, in the words the worker wrote them. **Who did
 * it** is the agent list, with what each cost.
 *
 * Polls while the run is live and stops when it is not. A page that keeps
 * polling a finished job is a page that costs the database something forever,
 * and the run is over: there is nothing left to see.
 */
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { RunView } from './route-data';

/**
 * The decision a message carries, pulled out of its detail.
 *
 * Every director returns a `reason` or a `because` — that is the standing rule
 * in this codebase — and the log already carries it. This surfaces it instead
 * of making an operator read JSON.
 */
function decisionOf(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  for (const key of ['because', 'reason', 'why', 'finding']) {
    const value = detail[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Detail worth showing beside a message, without the noise. */
function summarise(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (['because', 'reason', 'why', 'finding', 'contentItemId', 'jobId'].includes(key)) continue;
    if (Array.isArray(value)) {
      if (value.length > 0) parts.push(`${key}: ${value.slice(0, 3).join(', ')}${value.length > 3 ? '…' : ''}`);
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      parts.push(`${key}: ${value}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function RunClient({ initial }: { initial: RunView }) {
  const [run, setRun] = useState(initial);
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!run.live) return;
    /*
     * Two seconds: fast enough that a run feels watched, slow enough that a
     * long generation is not thousands of requests. The poller itself ticks at
     * two seconds, so anything faster is asking more often than the work moves.
     */
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/run/${run.jobId}`, { cache: 'no-store' });
        if (response.ok) setRun((await response.json()) as RunView);
      } catch {
        /* A dropped poll is not worth surfacing; the next one will land. */
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [run.live, run.jobId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [run.events.length]);

  const spent = run.agents.reduce((total, agent) => total + (agent.costUsd ?? 0), 0);

  return (
    <div className="space-y-8">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl">
            {run.live ? 'Making it' : run.status === 'done' ? 'Made' : 'Stopped'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {run.kind} · {run.status}
            {run.attempts > 1 ? ` · attempt ${run.attempts}` : ''}
            {spent > 0 ? ` · $${spent.toFixed(3)}` : ''}
          </p>
        </div>
        {run.live ? (
          <span className="flex items-center gap-2 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            live
          </span>
        ) : null}
      </header>

      {run.lastError ? (
        <section className="rounded-lg border border-warn bg-surface p-4">
          <h2 className="mb-1 text-xs uppercase tracking-[0.1em] text-warn-ink">What stopped it</h2>
          <p className="text-sm text-warn-ink">{run.lastError}</p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-[0.1em] text-muted">What happened</h2>
        {run.events.length === 0 ? (
          <p className="text-sm text-muted">
            {run.live ? 'Waiting for the worker to pick it up…' : 'This run recorded nothing.'}
          </p>
        ) : (
          <ol className="space-y-3">
            {run.events.map((event) => {
              const decision = decisionOf(event.detail);
              const extra = summarise(event.detail);
              return (
                <li key={event.id} className="border-l-2 border-line pl-3">
                  <p className="text-sm">{event.message}</p>
                  {decision ? <p className="mt-0.5 text-xs text-muted">{decision}</p> : null}
                  {extra ? <p className="mt-0.5 text-xs text-muted/70">{extra}</p> : null}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={bottom} />
      </section>

      {run.agents.length > 0 ? (
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-[0.1em] text-muted">Who did it</h2>
          <ul className="space-y-1.5">
            {run.agents.map((agent, i) => (
              <li key={`${agent.agentId}-${i}`} className="flex items-baseline justify-between gap-4 text-sm">
                <span>{agent.agentId}</span>
                <span className="text-xs text-muted">
                  {agent.status}
                  {agent.durationMs !== null ? ` · ${(agent.durationMs / 1000).toFixed(1)}s` : ''}
                  {agent.costUsd ? ` · $${agent.costUsd.toFixed(4)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {run.contentItemId ? (
        <section className="border-t border-line pt-6">
          <Link
            href={`/queue`}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm text-paper transition"
          >
            Look at it
          </Link>
        </section>
      ) : null}
    </div>
  );
}
