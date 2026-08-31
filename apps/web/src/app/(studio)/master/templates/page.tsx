/**
 * §389. Master ▸ Templates — every card and composition.
 *
 * A template that is disabled says **why**, because a renderer quietly refusing
 * a format is indistinguishable from one that is broken. `uses` is the honest
 * measure of whether a template is earning its place: one that has never been
 * used is either wrong for everything or unreachable, and both are worth
 * knowing.
 */
import { Label, Sheet, Tally, cx } from '@halyard/ui/studio';
import { getTemplates } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function Templates() {
  const templates = await getTemplates();

  if (templates.length === 0) {
    return (
      <Sheet tone="lit">
        <Label>No templates</Label>
        <p className="max-w-prose text-sm leading-relaxed text-quiet">
          Nothing can be rendered without one. Templates are seeded with the product; an empty
          list means the seed did not run.
        </p>
      </Sheet>
    );
  }

  const byRenderer = new Map<string, typeof templates>();
  for (const t of templates) {
    if (!byRenderer.has(t.renderer)) byRenderer.set(t.renderer, []);
    byRenderer.get(t.renderer)!.push(t);
  }

  const unused = templates.filter((t) => t.enabled && t.uses === 0).length;

  return (
    <div className="flex flex-col gap-3.5">
      {[...byRenderer.entries()].map(([renderer, list]) => (
        <Sheet key={renderer}>
          <Label>
            {renderer} · {list.length}
          </Label>
          <ul className="flex flex-col">
            {list.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-t border-rule2 py-2 first:border-t-0 first:pt-0"
              >
                <Tally state={t.enabled ? (t.uses > 0 ? 'ready' : 'holding') : 'dark'} on="light" size={6} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-snug">{t.id}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-quiet">
                    {[t.format, t.aspect_ratio, t.description].filter(Boolean).join(' · ')}
                  </span>
                  {/*
                    Why it is off. A renderer quietly refusing a format looks
                    exactly like a broken one from the outside.
                  */}
                  {!t.enabled ? (
                    <span className="mt-0.5 block text-[11.5px] leading-relaxed text-parked">
                      Disabled — {t.disabled_reason ?? 'no reason recorded, which is itself worth finding.'}
                    </span>
                  ) : null}
                  {/*
                    §395. The pool, not just the template.

                    A template is a set of treatments — `Quiz` draws five, and
                    so does `carousel_6`. Counting uses of the *template* says
                    nothing about whether the pool is being used, and a pool
                    with one treatment ever drawn is the variety machinery not
                    working. That is the thing this screen exists to show and
                    could not.
                  */}
                  {t.treatments.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 font-data text-[10px] text-quiet">
                      {t.treatments.map((x) => (
                        <span key={x.treatment}>
                          {x.treatment.replace(/_/g, ' ')}{' '}
                          <b className="font-medium text-sink">{x.uses}</b>
                        </span>
                      ))}
                    </span>
                  ) : t.uses > 0 ? (
                    <span className="mt-1 block text-[11.5px] leading-relaxed text-quiet">
                      Drawn {t.uses} {t.uses === 1 ? 'time' : 'times'}, none of them recording a
                      treatment — every one predates §394.
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    'shrink-0 font-data text-[10px]',
                    t.uses === 0 ? 'text-quiet' : 'text-sink',
                  )}
                >
                  {t.uses === 0 ? 'never used' : `${t.uses} uses`}
                </span>
              </li>
            ))}
          </ul>
        </Sheet>
      ))}

      {unused > 0 ? (
        <p className="text-xs leading-relaxed text-quiet">
          {unused} enabled templates have never been used. That is either a template wrong for
          everything, or one nothing can reach — both worth finding out which.
        </p>
      ) : null}
    </div>
  );
}
