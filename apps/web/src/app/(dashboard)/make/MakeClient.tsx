'use client';

/**
 * §288. Two rows of buttons and one action.
 *
 * Platform, then shape, then make. The subject box is optional and last,
 * because most of the time the system has better ideas about what to write
 * about than an operator typing at 11pm — and when it does not, one line is
 * enough to say so.
 *
 * Formats grey out rather than disappear when the chosen platform cannot carry
 * them. Hiding them would leave an operator wondering where the quiz went; a
 * disabled button with a reason on hover answers the question without them
 * having to ask it.
 */
import { useState, useTransition } from 'react';
import { makePiece, type MakeResult } from './actions';

export interface MakeFormat {
  id: string;
  name: string;
  intent: string;
  platforms: string[];
  needsArtifact: boolean;
  needsCitation: boolean;
}

const PLATFORMS: Array<{ id: string; label: string }> = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'x', label: 'X' },
  { id: 'threads', label: 'Threads' },
  { id: 'pinterest', label: 'Pinterest' },
];

export function MakeClient({
  productId,
  formats,
  connected,
}: {
  productId: string;
  formats: MakeFormat[];
  /** Platforms with a usable account, so a dead one is visibly dead. */
  connected: Record<string, string>;
}) {
  const [platform, setPlatform] = useState<string | null>(null);
  const [format, setFormat] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [result, setResult] = useState<MakeResult | null>(null);
  const [pending, startTransition] = useTransition();

  const carries = (f: MakeFormat) => !platform || f.platforms.includes(platform);

  const submit = () => {
    const data = new FormData();
    data.set('productId', productId);
    data.set('platform', platform ?? '');
    data.set('postFormat', format ?? '');
    data.set('subject', subject);
    startTransition(async () => setResult(await makePiece(data)));
  };

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">1 · Where</h2>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => {
            const state = connected[p.id];
            const usable = state === 'live' || state === 'draft_only';
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPlatform(p.id);
                  /* A shape the new platform cannot carry is cleared, not left
                     selected and silently ignored at submit. */
                  if (format) {
                    const f = formats.find((x) => x.id === format);
                    if (f && !f.platforms.includes(p.id)) setFormat(null);
                  }
                }}
                aria-pressed={platform === p.id}
                title={state ? `Account state: ${state}` : 'No account connected'}
                className={`rounded-lg border px-3.5 py-2 text-sm transition ${
                  platform === p.id
                    ? 'border-primary bg-primary text-paper'
                    : usable
                      ? 'border-line hover:border-primary'
                      : 'border-line text-muted'
                }`}
              >
                {p.label}
                {!usable ? (
                  <span className="ml-1.5 text-xs text-warn-ink">
                    {state === 'error' ? 'reconnect' : state ? state.replace('_', ' ') : 'not set up'}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">2 · What shape</h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFormat(null)}
            aria-pressed={format === null}
            className={`rounded-lg border px-3.5 py-2 text-sm transition ${
              format === null ? 'border-primary bg-primary text-paper' : 'border-line hover:border-primary'
            }`}
          >
            Let Halyard choose
          </button>
          {formats.map((f) => (
            <button
              key={f.id}
              type="button"
              disabled={!carries(f)}
              onClick={() => setFormat(f.id === format ? null : f.id)}
              aria-pressed={format === f.id}
              title={
                carries(f)
                  ? f.intent
                  : `${f.name} runs on ${f.platforms.join(', ')} — not ${platform}.`
              }
              className={`rounded-lg border px-3.5 py-2 text-sm transition ${
                format === f.id
                  ? 'border-primary bg-primary text-paper'
                  : carries(f)
                    ? 'border-line hover:border-primary'
                    : 'cursor-not-allowed border-line text-muted opacity-40'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>

        {format ? (
          <p className="mt-2 text-xs text-muted">
            {formats.find((f) => f.id === format)?.intent}
            {formats.find((f) => f.id === format)?.needsCitation
              ? ' Every claim is fetched and checked against its source, so it may take a few attempts.'
              : ''}
            {formats.find((f) => f.id === format)?.needsArtifact
              ? ' Needs an adapted recipe to exist.'
              : ''}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Chosen by what the source supports, which pillar is thin, and what this account has
            not done recently.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs uppercase tracking-[0.1em] text-muted">
          3 · About what <span className="normal-case tracking-normal">(optional)</span>
        </h2>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Leave empty and it picks from this week's signals"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </section>

      <div className="flex items-center gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={!platform || pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? 'Making…' : 'Make it'}
        </button>
        {!platform ? <span className="text-xs text-muted">Pick a platform first.</span> : null}
      </div>

      {result ? (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            result.ok ? 'bg-good/10 text-good' : 'bg-danger/10 text-danger'
          }`}
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
