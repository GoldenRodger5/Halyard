/**
 * §388. Rundown ▸ First two weeks — the opening run for a new account.
 *
 * Fourteen pieces that establish what an account *is*, in an order that earns
 * the follow before it asks for anything. Generated as a batch and reviewed as
 * a batch, because the shape of an opening run is a decision about the whole
 * run rather than about any one piece in it.
 *
 * The plan is shown before anything is committed — `planLaunchBatch` returns
 * its own `rationale` and `warnings`, and both are printed. A batch that
 * silently drops a platform because the account cannot carry the format is the
 * failure this screen exists to prevent.
 */
import Link from 'next/link';
import { FIRST_THIRTY_DAYS } from '@halyard/core';
import { PLATFORM_LABELS } from '@halyard/ui';
import { Action, Label, Sheet } from '@halyard/ui/studio';
import { getCurrentProduct } from '@/lib/queries';
import { buildLaunchPlan, generateLaunchBatch } from '@/app/(studio)/rundown/launch/actions';

export const dynamic = 'force-dynamic';

/**
 * Slots by the day they land.
 *
 * A slot with no date is not dropped — it goes under "No date yet", because a
 * piece the planner could not place is the most interesting row in the list and
 * hiding it would be the failure this screen exists to prevent.
 */
type PlannedSlot = Awaited<ReturnType<typeof buildLaunchPlan>>['plan']['slots'][number];

function groupByDay(slots: PlannedSlot[]): Map<string, PlannedSlot[]> {
  const days = new Map<string, PlannedSlot[]>();
  for (const slot of slots) {
    const key = slot.scheduledAt
      ? new Date(slot.scheduledAt).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        })
      : 'No date yet';
    if (!days.has(key)) days.set(key, []);
    days.get(key)!.push(slot);
  }
  /*
   * Sorted by the real date, with the undated group last. A `Map` keeps
   * insertion order, which put "No date yet" wherever the first deferred slot
   * happened to appear — in the middle of the second week.
   */
  const at = (group: PlannedSlot[]): number => {
    const first = group.find((s) => s.scheduledAt);
    return first?.scheduledAt ? new Date(first.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER;
  };
  return new Map([...days.entries()].sort((a, b) => at(a[1]) - at(b[1])));
}

export default async function Launch() {
  const product = await getCurrentProduct();

  if (!product) {
    return (
      <Sheet tone="lit">
        <Label>No product</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          An opening run introduces a product. Add one first.
        </p>
      </Sheet>
    );
  }

  const { plan, accounts } = await buildLaunchPlan(product.id, 14);

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet tone="lit">
        <Label>The opening run</Label>
        <p className="mb-3 max-w-[70ch] text-[12.5px] leading-relaxed text-quiet">
          {plan.slots.length} pieces that establish what this account is, in an order that earns
          the follow before it asks for anything. Generated as a batch, reviewed as a batch.
        </p>
        <form action={generateLaunchBatch}>
          <input type="hidden" name="productId" value={product.id} />
          <input type="hidden" name="days" value="14" />
          <Action tone="brass" disabled={plan.slots.length === 0}>
            Generate the batch
          </Action>
        </form>
      </Sheet>

      {plan.warnings.length > 0 ? (
        <Sheet tone="onair">
          <Label>What could not be honoured</Label>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-relaxed text-quiet">
            {plan.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      {plan.rationale.length > 0 ? (
        <Sheet>
          <Label>Why the plan looks like this</Label>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[12.5px] leading-relaxed text-quiet">
            {plan.rationale.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Sheet>
      ) : null}

      <Sheet>
        <Label>
          The run · {plan.slots.length} pieces over{' '}
          {Object.keys(plan.perPlatform).length} platforms
        </Label>
        {plan.slots.length === 0 ? (
          <p className="max-w-prose text-[12.5px] leading-relaxed text-quiet">
            No slots could be placed. {accounts.length === 0
              ? 'No account is connected that can carry anything — the rig is where that starts.'
              : 'Every connected account was refused a format it can carry; the warnings above say which.'}
          </p>
        ) : (
          <>
            {/*
              The mix, before the list. Thirty-eight rows reading "regular" is a
              list nobody finishes; what an operator is actually deciding is
              whether the *shape* of the run is right, and that is these two
              distributions.
            */}
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 font-data text-[11px] text-quiet">
              {Object.entries(plan.perCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([category, n]) => (
                  <span key={category}>
                    {category} <b className="font-medium text-sink">{n}</b>
                  </span>
                ))}
            </div>

            {/*
              Grouped by the day it lands. A launch batch is a *sequence* — the
              order is the argument it makes — so a flat list loses the thing
              that matters most about it.
            */}
            {[...groupByDay(plan.slots).entries()].map(([day, slots]) => (
              <div key={day} className="border-t border-rule2 py-2.5 first:border-t-0 first:pt-0">
                <div className="mb-1 font-data text-[9.5px] uppercase tracking-[0.1em] text-quiet">
                  {day}
                </div>
                <div className="flex flex-col gap-1">
                  {slots.map((slot) => (
                    <div key={slot.key} className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]">
                      <span className="font-data text-[10px] uppercase tracking-[0.06em] text-quiet">
                        {PLATFORM_LABELS[slot.platform] ?? slot.platform}
                      </span>
                      <span>{slot.category}</span>
                      <span className="text-quiet">{slot.format}</span>
                      {slot.purpose === 'introduction' ? (
                        <span className="font-data text-[9px] uppercase tracking-[0.07em] text-lit">
                          introduction
                        </span>
                      ) : null}
                      {slot.deferred ? (
                        <span className="font-data text-[9px] uppercase tracking-[0.07em] text-parked">
                          deferred
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </Sheet>

      <Sheet tone="cool">
        <Label>What the first month looks like</Label>
        <div className="flex flex-col gap-3">
          {FIRST_THIRTY_DAYS.map((phase) => (
            <div key={phase.title}>
              <div className="text-[13px] font-semibold">
                {phase.title}{' '}
                <span className="font-normal text-quiet">· {phase.when}</span>
              </div>
              {/*
                What will look wrong but is not. This is the half that stops an
                operator switching the system off in week one.
              */}
              {phase.expected.length > 0 ? (
                <p className="mt-1 max-w-[74ch] text-[12px] leading-relaxed text-quiet">
                  {phase.expected[0]}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Sheet>

      <p className="text-xs leading-relaxed text-quiet">
        The batch lands in <Link href="/gallery" className="text-lit underline">the Gallery</Link>{' '}
        as drafts. Nothing publishes without you.
      </p>
    </div>
  );
}
