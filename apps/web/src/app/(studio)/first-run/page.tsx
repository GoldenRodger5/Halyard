/**
 * §388. Call Sheet ▸ First run — what has to be true before the room opens.
 *
 * Daily generation refuses to run while this is unfinished, and says so rather
 * than producing nothing quietly. That makes this the most consequential screen
 * in the console for a new installation, which is why it is a tab on Room 1
 * rather than buried in settings — where it was.
 *
 * Reads `assessReadiness` through `lib/studio/readiness.ts`, the same gathering
 * the readiness page uses. Two screens computing readiness slightly differently
 * would be two answers to one question with no way to tell which was right.
 *
 * ## Blocked is not failed
 *
 * A check that cannot run yet reads `·`, not `✗`. §-gotcha-6's lesson in the
 * place a new operator meets it first: the checklist must not tell somebody
 * their install is broken when it is merely unfinished.
 */
import Link from 'next/link';
import type { CheckState } from '@halyard/core';
import { Label, Sheet, cx } from '@halyard/ui/studio';
import { readReadiness } from '@/lib/studio/readiness';

export const dynamic = 'force-dynamic';

const MARK: Record<CheckState, { glyph: string; tone: string; means: string }> = {
  pass: { glyph: '✓', tone: 'text-passed', means: 'Done' },
  warn: { glyph: '!', tone: 'text-lit', means: 'Works, but worth knowing about' },
  fail: { glyph: '✗', tone: 'text-onair', means: 'Stops the run' },
  blocked: { glyph: '·', tone: 'text-quiet', means: 'Cannot be checked yet' },
};

export default async function FirstRun() {
  const { sections, verdict, product } = await readReadiness();

  if (!product) {
    return (
      <Sheet tone="lit">
        <Label>No product</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          Halyard markets a product, so it cannot do anything at all until it has one.{' '}
          <Link href="/master/product" className="text-lit underline">Add one</Link>.
        </p>
      </Sheet>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Sheet tone={verdict.ready ? 'plain' : 'lit'}>
        <Label>{verdict.ready ? 'Ready to run unattended' : 'Not ready yet'}</Label>
        <p className="max-w-[74ch] font-display text-[15px] font-semibold leading-snug tracking-[-0.02em]">
          {verdict.summary}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-quiet">
          {verdict.needsYou > 0
            ? `${verdict.needsYou} of these only you can resolve — a credential, or a decision.`
            : 'Nothing here is waiting on a decision from you.'}
          {' '}This is about whether the <em>setup</em> is finished, not whether the code is.
        </p>
      </Sheet>

      {sections.map((section) => (
        <Sheet key={section.id}>
          <Label>{section.title}</Label>
          <p className="mb-3 max-w-[74ch] text-xs leading-relaxed text-quiet">{section.why}</p>
          <ul className="flex flex-col">
            {section.checks.map((check) => {
              const m = MARK[check.state];
              return (
                <li
                  key={check.id}
                  className="flex items-start gap-2.5 border-t border-rule2 py-2.5 first:border-t-0 first:pt-0"
                >
                  <span
                    aria-hidden
                    title={m.means}
                    className={cx('w-3 shrink-0 pt-0.5 text-center font-data text-xs', m.tone)}
                  >
                    {m.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug">
                      {check.label}
                      {check.needsYou ? (
                        <span className="ml-1.5 font-data text-[9px] uppercase tracking-[0.08em] text-lit">
                          needs you
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-quiet">
                      {check.detail}
                    </span>
                    {/*
                      The fix, printed rather than hinted. A checklist that says
                      what is wrong and not what to do about it is a list of
                      complaints.
                    */}
                    {check.fix ? (
                      <span className="mt-1 block text-[11.5px] leading-relaxed text-lit">
                        {check.fix}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </Sheet>
      ))}

      <p className="text-xs leading-relaxed text-quiet">
        A dot means a check that cannot run yet, not one that failed — an install can be
        unfinished without being broken.
      </p>
    </div>
  );
}
