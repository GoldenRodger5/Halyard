'use client';

/**
 * §355. The generation wizard.
 *
 * `docs/UI_GENERATION_SPEC.md` is the spec. Five steps, each narrowing the next:
 * where → what kind → together? → shape → specifics.
 *
 * ## Two rules the whole screen follows
 *
 * **Nothing is hidden; things are disabled with a reason.** An option that
 * disappears makes an operator wonder where it went and whether the tool is
 * broken. One that is greyed out with "TikTok carries no caption-only post"
 * tells them what to change — drop the platform, or pick a different type.
 *
 * **A question with one answer is not a question.** A step whose options
 * collapse to one is shown as already decided rather than asked, because
 * clicking the only button is a step that wastes the operator's attention.
 *
 * Buttons rather than free text wherever the answer is finite: an operator
 * choosing from four options cannot ask for something that does not exist, and
 * the system never has to guess what they meant.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { makePiece, type MakeResult } from './actions';

export interface MakeFormat {
  id: string;
  name: string;
  intent: string;
  platforms: string[];
  channels: string[];
  needsArtifact: boolean;
  needsCitation: boolean;
  needsCapture: boolean;
}

export interface MakeFlow {
  id: string;
  title: string;
  why: string;
}

export interface Carriage {
  id: string;
  name: string;
  intent: string;
  media: string;
  channel: string;
  /** Per platform: can it carry this, and if not, why not. */
  byPlatform: Record<string, { ok: boolean; because: string }>;
}

const PLATFORM_LABELS: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  x: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
};

/** A platform whose account cannot publish, said the way an operator reads it. */
function accountNote(state: string | undefined): string | null {
  if (!state) return 'not set up';
  if (state === 'live' || state === 'draft_only') return null;
  if (state === 'error') return 'reconnect';
  return state.replace('_', ' ');
}

export function MakeClient({
  productId,
  platforms,
  carriage,
  formats,
  flows,
  connected,
}: {
  productId: string;
  platforms: string[];
  carriage: Carriage[];
  formats: MakeFormat[];
  flows: MakeFlow[];
  connected: Record<string, string>;
}) {
  const [chosenPlatforms, setChosenPlatforms] = useState<string[]>([]);
  const [postType, setPostType] = useState<string | null>(null);
  const [together, setTogether] = useState(true);
  const [format, setFormat] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [result, setResult] = useState<MakeResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  /**
   * A post type is offered when **every** chosen platform can carry it.
   *
   * Every, not any: a piece made for three platforms and publishable to two is
   * a piece that fails at the last step, which is the most expensive place to
   * discover it.
   */
  const typeVerdict = useMemo(() => {
    return carriage.map((type) => {
      if (chosenPlatforms.length === 0) return { type, ok: true, because: '' };
      const blocking = chosenPlatforms
        .map((platform) => ({ platform, verdict: type.byPlatform[platform] }))
        .filter((entry) => entry.verdict && !entry.verdict.ok);
      return {
        type,
        ok: blocking.length === 0,
        /* Name the platform that is the obstacle, so it can be dropped. */
        because: blocking.map((entry) => entry.verdict!.because).join(' '),
      };
    });
  }, [carriage, chosenPlatforms]);

  const chosenType = carriage.find((t) => t.id === postType) ?? null;

  /* Formats whose brief matches the chosen post type's channel. */
  const availableFormats = useMemo(() => {
    if (!chosenType) return formats;
    return formats.filter((f) => f.channels.includes(chosenType.channel));
  }, [formats, chosenType]);

  const chosenFormat = availableFormats.find((f) => f.id === format) ?? null;

  const submit = () => {
    const data = new FormData();
    data.set('productId', productId);
    /* One job per platform: the action fans out, the wizard does not. */
    data.set('platforms', chosenPlatforms.join(','));
    data.set('postType', postType ?? '');
    data.set('postFormat', format ?? '');
    data.set('subject', subject);
    data.set('flowId', flowId ?? '');
    data.set('together', together ? '1' : '');
    startTransition(async () => {
      const outcome = await makePiece(data);
      setResult(outcome);
      /*
       * §356. Straight to the run. The several minutes a piece takes used to
       * be silent, and a message saying "it appears in the queue" is an
       * instruction to go and wait somewhere else.
       */
      if (outcome.ok && outcome.jobId) router.push(`/make/run/${outcome.jobId}`);
    });
  };

  const step = (n: number, title: string, hint?: string) => (
    <h2 className="mb-2 flex items-baseline gap-2 text-xs uppercase tracking-[0.1em] text-muted">
      <span>
        {n} · {title}
      </span>
      {hint ? <span className="normal-case tracking-normal text-muted/70">{hint}</span> : null}
    </h2>
  );

  const chip = (active: boolean, usable: boolean) =>
    `rounded-lg border px-3.5 py-2 text-sm transition ${
      active
        ? 'border-primary bg-primary text-paper'
        : usable
          ? 'border-line hover:border-primary'
          : 'cursor-not-allowed border-line text-muted opacity-40'
    }`;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl">Make something</h1>
        <p className="mt-1 text-sm text-muted">
          Each step narrows the next. Anything greyed out says why on hover.
        </p>
      </header>

      {/* ── 1 · Where ─────────────────────────────────────────────────── */}
      <section>
        {step(1, 'Where', 'pick one or several')}
        <div className="flex flex-wrap gap-2">
          {platforms.map((platform) => {
            const note = accountNote(connected[platform]);
            const active = chosenPlatforms.includes(platform);
            return (
              <button
                key={platform}
                type="button"
                onClick={() => {
                  const next = active
                    ? chosenPlatforms.filter((p) => p !== platform)
                    : [...chosenPlatforms, platform];
                  setChosenPlatforms(next);
                  /*
                   * A post type the new set cannot carry is cleared rather than
                   * left selected and silently ignored at submit.
                   */
                  if (postType) {
                    const type = carriage.find((t) => t.id === postType);
                    const stillOk = next.every((p) => type?.byPlatform[p]?.ok);
                    if (!stillOk) {
                      setPostType(null);
                      setFormat(null);
                    }
                  }
                }}
                aria-pressed={active}
                title={note ? `Account state: ${connected[platform] ?? 'none'}` : undefined}
                className={chip(active, true)}
              >
                {PLATFORM_LABELS[platform] ?? platform}
                {note ? <span className="ml-1.5 text-xs text-warn-ink">{note}</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 2 · What kind ─────────────────────────────────────────────── */}
      <section>
        {step(
          2,
          'What kind of post',
          chosenPlatforms.length > 1 ? 'only what all of them can carry' : undefined,
        )}
        <div className="flex flex-wrap gap-2">
          {typeVerdict.map(({ type, ok, because }) => (
            <button
              key={type.id}
              type="button"
              disabled={!ok}
              onClick={() => {
                setPostType(type.id === postType ? null : type.id);
                setFormat(null);
                setFlowId(null);
              }}
              aria-pressed={postType === type.id}
              title={ok ? type.intent : because}
              className={chip(postType === type.id, ok)}
            >
              {type.name}
            </button>
          ))}
        </div>
        {chosenType ? <p className="mt-2 text-xs text-muted">{chosenType.intent}</p> : null}
      </section>

      {/* ── 3 · Together? ─── only a question when there is more than one ── */}
      {chosenPlatforms.length > 1 ? (
        <section>
          {step(3, 'One piece, or several')}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTogether(true)}
              aria-pressed={together}
              className={chip(together, true)}
            >
              One piece for all {chosenPlatforms.length}
            </button>
            <button
              type="button"
              onClick={() => setTogether(false)}
              aria-pressed={!together}
              className={chip(!together, true)}
            >
              A different piece each
              <span className="ml-1.5 text-xs opacity-70">{chosenPlatforms.length}× the cost</span>
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {together
              ? 'One production, finished per platform — the opening budget and caption length differ, the piece does not.'
              : 'Separate productions. Occasionally right: a TikTok quiz and a YouTube explainer on one subject are not the same piece.'}
          </p>
        </section>
      ) : null}

      {/* ── 4 · Shape ─────────────────────────────────────────────────── */}
      <section>
        {step(chosenPlatforms.length > 1 ? 4 : 3, 'What shape')}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFormat(null)}
            aria-pressed={format === null}
            className={chip(format === null, true)}
          >
            Let Halyard choose
          </button>
          {availableFormats.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFormat(f.id === format ? null : f.id);
                if (!f.needsCapture) setFlowId(null);
              }}
              aria-pressed={format === f.id}
              title={f.intent}
              className={chip(format === f.id, true)}
            >
              {f.name}
              {f.needsCitation ? (
                <span className="ml-1.5 text-xs opacity-60" title="Every claim is researched and its source checked">
                  sourced
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {chosenFormat ? <p className="mt-2 text-xs text-muted">{chosenFormat.intent}</p> : null}
      </section>

      {/* ── 5 · Specifics ─────────────────────────────────────────────── */}
      {chosenFormat?.needsCapture ? (
        <section>
          {step(chosenPlatforms.length > 1 ? 5 : 4, 'Which part of the app')}
          <div className="flex flex-wrap gap-2">
            {flows.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFlowId(f.id === flowId ? null : f.id)}
                aria-pressed={flowId === f.id}
                title={f.why}
                className={chip(flowId === f.id, true)}
              >
                {f.title}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Halyard records this flow against the live product, signed in to the test account, and
            builds the video from the recording. Nothing is drawn or simulated.
          </p>
        </section>
      ) : null}

      <section>
        {step(
          (chosenPlatforms.length > 1 ? 5 : 4) + (chosenFormat?.needsCapture ? 1 : 0),
          'About what',
          'optional',
        )}
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Leave empty and it picks from this week's signals"
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />
      </section>

      <section className="border-t border-line pt-6">
        <button
          type="button"
          onClick={submit}
          disabled={pending || chosenPlatforms.length === 0 || !postType}
          className="rounded-lg bg-primary px-5 py-2.5 text-sm text-paper transition disabled:opacity-40"
        >
          {pending ? 'Starting…' : 'Generate'}
        </button>
        {chosenPlatforms.length === 0 || !postType ? (
          <span className="ml-3 text-xs text-muted">
            {chosenPlatforms.length === 0 ? 'Pick where it goes.' : 'Pick what kind of post.'}
          </span>
        ) : null}

        {result ? (
          <p className={`mt-4 text-sm ${result.ok ? 'text-muted' : 'text-warn-ink'}`}>
            {result.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
