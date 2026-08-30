/**
 * §385. Room 1 — the Call Sheet.
 *
 * A call sheet is what a production hands you each morning: what is happening,
 * who is needed, what is first. That is exactly what this screen is for, and it
 * is why it opens with **what happened overnight** rather than with a chart.
 *
 * Halyard works while you sleep. No other tool in this category has anything to
 * say about that, because in every other tool nothing happens while you sleep —
 * so this band is the one piece of the console that could not exist anywhere
 * else, and it goes first.
 *
 * Then one decision, from `whatNeedsMe` (§365) — an ordered ladder resolved in
 * code, where the order is the judgement. Then a glance at the counters and the
 * rig.
 */
import Link from 'next/link';
import { whatNeedsMe } from '@halyard/core';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Action, Label, Pill, Sheet, Tally, cx } from '@halyard/ui/studio';
import { accountBadge } from '@/lib/accountBadge';
import { getAccounts, getNavCounts, getOnboarding, getProducts, getSettings } from '@/lib/queries';
import { overnight } from '@/lib/studio/overnight';
import { readReadiness } from '@/lib/studio/readiness';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function CallSheet() {
  const products = await getProducts();
  const product = products[0];
  if (!product) {
    return (
      <Sheet tone="lit">
        <h1 className="font-display text-2xl font-extrabold">No product configured</h1>
        <p className="mt-2 max-w-prose text-sm text-quiet">
          Halyard markets a product, so it cannot do anything at all until it has one to market.
        </p>
        <Action tone="brass" className="mt-4">
          <Link href="/master/product">Add a product</Link>
        </Action>
      </Sheet>
    );
  }

  const [counts, settings, accounts, onboarding, night, readiness, tempo] = await Promise.all([
    getNavCounts(),
    getSettings(),
    getAccounts(product.id),
    getOnboarding(product.id),
    overnight(product.id),
    /*
     * §392. The same `assessReadiness` the First run tab uses. Two screens
     * computing readiness differently would be two answers to one question,
     * and the operator would have no way to know which was right.
     */
    readReadiness(),
    query<{ oldest_days: string | null; scheduled_next7: string; ever_published: string }>(
      `select
         (select floor(extract(epoch from (now() - min(created_at))) / 86400)::text
            from content_items where product_id = $1 and status = 'pending_approval') as oldest_days,
         (select count(*)::text from content_items
           where product_id = $1 and status in ('approved','scheduled')
             and scheduled_at between now() and now() + interval '7 days')             as scheduled_next7,
         (select count(*)::text from content_items
           where product_id = $1 and status = 'published')                             as ever_published`,
      [product.id],
    ),
  ]);

  /*
   * What is actually unfinished. `needsYou` first — those are the ones only a
   * person can clear, and they are what the card above is asking about.
   */
  const outstanding = readiness.sections
    .flatMap((section) => section.checks)
    .filter((check) => check.state === 'fail' || check.state === 'warn')
    .sort((a, b) => Number(Boolean(b.needsYou)) - Number(Boolean(a.needsYou)));


  const badges = accounts.map((a) => accountBadge(a));
  const action = whatNeedsMe({
    hasProduct: true,
    setupIncomplete: [
      !onboarding?.step_ingest_done && 'the brief',
      !onboarding?.step_voice_done && 'the voice',
      !onboarding?.step_calibration_done && 'the calibration batch',
      !onboarding?.step_templates_done && 'the template review',
      !onboarding?.step_accounts_done && 'connecting accounts',
    ].filter((s): s is string => typeof s === 'string'),
    publishingEnabled: settings.publishing_enabled,
    connectedAccounts: badges.filter((b) => b.tone === 'good').length,
    brokenAccounts: badges.filter((b) => b.tone === 'bad').length,
    failed: counts.failed,
    pendingApproval: counts.pendingApproval,
    oldestPendingDays:
      tempo[0]?.oldest_days == null ? null : Number(tempo[0].oldest_days),
    inboxWaiting: counts.inboxPending,
    scheduledNext7: Number(tempo[0]?.scheduled_next7 ?? 0),
    hasEverPublished: Number(tempo[0]?.ever_published ?? 0) > 0,
  });

  const stats = [
    { n: counts.pendingApproval, l: 'holding', href: '/gallery' },
    { n: counts.scheduledToday, l: 'out today', href: '/rundown' },
    { n: counts.failed, l: 'failed', href: '/gallery?view=failed', hot: true },
    { n: counts.inboxPending, l: 'on the wire', href: '/wires' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/*
        §385. While you slept, first.
        Only when there is something to say — an empty band every morning would
        stop being read within a week.
      */}
      {night.anything ? (
        <Sheet tone="cool">
          <div className="mb-2 flex items-center gap-2">
            <Tally state="holding" on="light" />
            <Label className="mb-0">
              {night.heading} · {night.from} → {night.to}
            </Label>
          </div>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2">
            {night.figures.map((f) => (
              <div key={f.label}>
                <span className="font-display text-2xl font-extrabold">{f.n}</span>{' '}
                <span className="text-sm text-quiet">{f.label}</span>
              </div>
            ))}
            <Link href="/floor/live" className="ml-auto">
              <Action tone="ghost" small>
                Watch the room
              </Action>
            </Link>
          </div>
        </Sheet>
      ) : null}

      {/*
        §392. The ask, and what is actually outstanding, side by side.
        
        This was a paragraph and a button in a card eleven hundred pixels wide —
        sixty per cent air. A card that large has to carry something; the
        outstanding checks are what it was asking about, so they go in it. The
        page stops looking like a template the moment its boxes are the shape of
        their contents.
      */}
      <Sheet tone={action.tone === 'calm' ? 'plain' : 'lit'}>
        <div className="grid gap-x-8 gap-y-4 md:grid-cols-[minmax(0,32rem)_1fr]">
          <div>
            <h1 className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.03em]">
              {action.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-quiet">{action.because}</p>
            <Link href={action.href} className="mt-4 inline-block">
              <Action tone={action.tone === 'calm' ? 'ghost' : 'brass'}>{action.cta}</Action>
            </Link>
          </div>

          {outstanding.length > 0 ? (
            <div className="md:border-l md:border-rule2 md:pl-8">
              <Label>Outstanding</Label>
              <ul className="flex flex-col gap-1.5">
                {outstanding.slice(0, 6).map((check) => (
                  <li key={check.id} className="flex items-start gap-2 text-[12.5px] leading-snug">
                    <span
                      aria-hidden
                      className={cx(
                        'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full',
                        check.state === 'fail' ? 'bg-onair' : 'bg-lit',
                      )}
                    />
                    <span className="min-w-0">
                      {check.label}
                      <span className="block text-[11.5px] text-quiet">{check.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {outstanding.length > 6 ? (
                <Link
                  href="/first-run"
                  className="mt-2 inline-block font-data text-[10px] uppercase tracking-[0.1em] text-lit underline decoration-rule2 underline-offset-2"
                >
                  {outstanding.length - 6} more →
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </Sheet>

      {/*
        §392. One panel, four segments — not four floating boxes.

        A row of equal cards each holding a two-digit number is the shape every
        dashboard template ships with, and it spends four borders and four
        shadows saying nothing. A gallery reads its counts off one strip with
        rules between them, which is denser, quieter, and the thing an operator
        actually glances at.
      */}
      <div className="grid grid-cols-2 divide-rule2 overflow-hidden rounded-[11px] border border-rule bg-gradient-to-b from-white to-sheet shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_6px_16px_-10px_rgba(15,23,22,0.28)] sm:grid-cols-4 sm:divide-x">
        {stats.map((s, i) => (
          <Link
            key={s.l}
            href={s.href}
            className={cx(
              'group relative px-4 py-3.5 transition-colors hover:bg-sheet2',
              i < 2 && 'border-b border-rule2 sm:border-b-0',
              i % 2 === 0 && 'border-r border-rule2 sm:border-r-0',
            )}
          >
            {/* A count that needs attention is marked, not boxed. */}
            {s.hot && s.n > 0 ? (
              <span aria-hidden className="absolute inset-x-0 top-0 h-[2px] bg-onair" />
            ) : null}
            <div
              className={cx(
                'font-display text-[30px] font-extrabold leading-none tracking-[-0.03em] tabular-nums',
                s.hot && s.n > 0 ? 'text-onair' : 'text-sink',
              )}
            >
              {s.n}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-xs text-quiet">
              {s.l}
              <span aria-hidden className="opacity-0 transition-opacity group-hover:opacity-100">
                →
              </span>
            </div>
          </Link>
        ))}
      </div>

      <Sheet>
        <Label>The rig</Label>
        <ul>
          {accounts.map((a, i) => {
            const b = badges[i]!;
            const state =
              b.tone === 'good' ? 'ready' : b.tone === 'bad' ? 'onair' : b.tone === 'warn' ? 'working' : 'dark';
            return (
              <li key={a.id} className="border-b border-rule last:border-0">
                {/*
                  Every row is a link. An account with a problem is the thing an
                  operator most wants to open, and this list was the only place
                  it was named and the only place you could not act on it.
                */}
                <Link
                  href="/master"
                  className="flex items-center gap-2.5 py-2 transition-colors hover:text-lit"
                >
                <Tally state={state} on="light" />
                <span className="flex-1 text-[13px]">
                  {PLATFORM_LABELS[a.platform] ?? a.platform}{' '}
                  <span className="text-quiet">{a.handle}</span>
                </span>
                <Pill
                  tone={state === 'ready' ? 'ready' : state === 'onair' ? 'onair' : state === 'working' ? 'working' : 'quiet'}
                >
                  {b.label}
                </Pill>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/master" className="mt-3 inline-block">
          <Action tone="ghost" small>
            Master Control
          </Action>
        </Link>
      </Sheet>
    </div>
  );
}
