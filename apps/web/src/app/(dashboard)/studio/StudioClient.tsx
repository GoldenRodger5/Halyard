'use client';

import { useState } from 'react';
import { Badge, Button, Card, SectionTitle } from '@halyard/ui';
import { pinDirection, rejectBatch, requestConcepts, selectConcept } from './actions';

interface Concept {
  id: string;
  title: string;
  premise: string;
  hook: string | null;
  objective: string;
  emotional_angle: string | null;
  differentiation: string | null;
  retention_strategy: string | null;
  score: string | null;
  score_breakdown: Record<string, unknown>;
  status: string;
  platform_intent: string[];
  evidence_requirements: Record<string, unknown>;
}

interface Batch {
  batch_id: string;
  created_at: string;
  concepts: Concept[];
}

/**
 * The Studio's interactive half. §235.
 *
 * ## Why the concept cards carry so much
 *
 * A concept card that shows only a title is a title picker. The decision an
 * operator is actually making is "which of these is a different *idea*", and
 * that is answerable only from the premise, the angle, what makes it different
 * from the others, and what evidence it would need. A concept that needs
 * evidence the product cannot supply is unbuildable, and saying so on the card
 * is more useful than discovering it after generation.
 */
export function StudioClient(props: {
  productId: string;
  batches: Batch[];
  platforms: Array<{ platform: string; handle: string; connected: boolean }>;
  /**
   * The creative vocabulary, passed in rather than imported. Gotcha 10.
   *
   * Importing `@halyard/core` here typechecks, lints and passes every test,
   * and then fails the production build: the barrel reaches `node:crypto`, and
   * this is a client component. The server page can import core safely, so the
   * lists come down as props.
   */
  vocabulary: {
    visualLanguages: readonly string[];
    typographySystems: readonly string[];
    openings: readonly string[];
  };
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <SectionTitle>Ask for concepts</SectionTitle>
        <form action={requestConcepts} className="space-y-3">
          <input type="hidden" name="productId" value={props.productId} />
          <textarea
            name="brief"
            rows={3}
            placeholder="Describe what you want — or leave this empty and Halyard will read current signals, what this account has already posted, and where the gaps are."
            className="w-full rounded border border-line bg-surface p-2 text-sm"
          />
          <div>
            <div className="mb-1 text-xs text-muted">Platforms (all connected, if none chosen)</div>
            <div className="flex flex-wrap gap-2">
              {props.platforms.map((p) => (
                <label
                  key={p.platform}
                  className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs"
                >
                  <input type="checkbox" name="platforms" value={p.platform} />
                  <span>{p.platform}</span>
                  {!p.connected ? <span className="text-muted">(not connected)</span> : null}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit">Generate concepts</Button>
        </form>
      </Card>

      {props.batches.map((batch) => {
        const open = batch.concepts.filter((c) => c.status === 'proposed');
        if (open.length === 0) return null;
        return (
          <Card key={batch.batch_id} className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>{open.length} ways in</SectionTitle>
              <span className="text-xs text-muted">
                {new Date(batch.created_at).toLocaleString()}
              </span>
            </div>

            <div className="space-y-3">
              {open.map((concept) => {
                const buildable = Number(concept.score ?? 0) > 0;
                return (
                  <div
                    key={concept.id}
                    className="rounded border border-line p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium">{concept.title}</div>
                        <p className="mt-1 text-sm text-muted">{concept.premise}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {/*
                          §218 keeps an unbuildable concept at score 0 rather
                          than deleting it: "we thought of this and could not
                          build it" is information about the product's evidence
                          gaps, and hiding it destroys the only record.
                        */}
                        {buildable ? (
                          <Badge tone="neutral">{Number(concept.score).toFixed(2)}</Badge>
                        ) : (
                          <Badge tone="warn">unbuildable</Badge>
                        )}
                      </div>
                    </div>

                    {concept.hook ? (
                      <p className="mt-2 text-sm">
                        <span className="text-xs uppercase tracking-wide text-muted">Hook</span>
                        <br />
                        {concept.hook}
                      </p>
                    ) : null}

                    <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted">
                      <span>{concept.objective}</span>
                      {concept.emotional_angle ? <span>· {concept.emotional_angle}</span> : null}
                      {concept.platform_intent?.length ? (
                        <span>· {concept.platform_intent.join(', ')}</span>
                      ) : null}
                    </div>

                    {concept.differentiation ? (
                      <p className="mt-2 text-xs text-muted">
                        <span className="font-medium">Different because:</span>{' '}
                        {concept.differentiation}
                      </p>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={selectConcept}>
                        <input type="hidden" name="conceptId" value={concept.id} />
                        <input type="hidden" name="productId" value={props.productId} />
                        <Button type="submit" disabled={!buildable}>
                          Build this
                        </Button>
                      </form>
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === concept.id ? null : concept.id)}
                        className="text-xs text-primary underline"
                      >
                        {expanded === concept.id ? 'Hide direction' : 'Adjust direction'}
                      </button>
                    </div>

                    {expanded === concept.id ? (
                      <form action={pinDirection} className="mt-3 space-y-2 border-t border-line pt-3">
                        <input type="hidden" name="conceptId" value={concept.id} />
                        {/*
                          Everything here is a *pin*. The directors honour it
                          absolutely — including over their own objection, which
                          they record rather than silently overriding.
                        */}
                        <p className="text-[11px] text-muted">
                          Anything you set here overrides the director, including where it
                          disagrees. The reason it disagreed is recorded either way.
                        </p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Select
                            name="visualLanguage"
                            label="Visual language"
                            options={props.vocabulary.visualLanguages}
                          />
                          <Select
                            name="typography"
                            label="Typography"
                            options={props.vocabulary.typographySystems}
                          />
                          <Select
                            name="opening"
                            label="Opening"
                            options={props.vocabulary.openings}
                          />
                          <Select
                            name="voiceEnergy"
                            label="Voice energy"
                            options={['calm', 'warm', 'bright', 'urgent']}
                          />
                        </div>
                        <label className="block text-xs">
                          <span className="text-muted">Call to action</span>
                          <input
                            name="cta"
                            className="mt-1 w-full rounded border border-line bg-surface p-1.5 text-sm"
                            placeholder="Leave empty to let the platform variant decide"
                          />
                        </label>
                        <Button type="submit">Save direction</Button>
                      </form>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <form action={rejectBatch} className="mt-4 flex items-end gap-2 border-t border-line pt-3">
              <input type="hidden" name="batchId" value={batch.batch_id} />
              <label className="flex-1 text-xs">
                <span className="text-muted">Reject all — why?</span>
                <input
                  name="reason"
                  required
                  className="mt-1 w-full rounded border border-line bg-surface p-1.5 text-sm"
                  placeholder="A reason with no detail teaches nothing"
                />
              </label>
              <Button type="submit" variant="ghost">
                Reject batch
              </Button>
            </form>
          </Card>
        );
      })}
    </div>
  );
}

function Select(props: { name: string; label: string; options: readonly string[] }) {
  return (
    <label className="block text-xs">
      <span className="text-muted">{props.label}</span>
      <select
        name={props.name}
        defaultValue=""
        className="mt-1 w-full rounded border border-line bg-surface p-1.5 text-sm"
      >
        <option value="">Let Halyard choose</option>
        {props.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
