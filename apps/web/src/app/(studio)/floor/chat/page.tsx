/**
 * §389. Floor ▸ Chat — talk it out, then send it to the floor.
 *
 * The brief is a form and the concepts are a menu; this is the conversation for
 * everything neither fits. It reuses `ComposeClient` unchanged — a second
 * streaming chat with its own tool loop would be a second thing to keep
 * correct, and the co-pilot's tools are the point of it.
 *
 * The formats are resolved **here**, on the server, because `ComposeClient` is
 * a client component and `@halyard/core`'s barrel reaches `node:crypto`.
 * §283 established that and `clientBoundary.test.ts` guards it; §387 hit the
 * same wall from the other direction through `desks.ts`.
 */
import {
  POST_FORMATS,
  POST_FORMAT_CATALOG,
  platformsForFormat,
  requiresCitation,
} from '@halyard/core';
import { Label, Sheet } from '@halyard/ui/studio';
import { ComposeClient } from '@/app/(studio)/floor/chat/ComposeClient';
import { getProducts } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** What the co-pilot can actually do, named rather than discovered by asking. */
const TOOLS: Array<[string, string]> = [
  ['generate_sample', 'Pull real product output'],
  ['draft_copy', 'Platform-specific copy'],
  ['render_preview', 'Fast 480p render for iteration'],
  ['render_final', 'Full-quality render'],
  ['check_novelty', 'Have I posted this before?'],
  ['search_past_posts', 'Find and re-template a winner'],
];

export default async function Chat() {
  const products = await getProducts();
  const product = products[0];

  return (
    <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <ComposeClient
        productId={product?.id ?? 'recipefix'}
        formats={POST_FORMATS.map((id) => {
          const f = POST_FORMAT_CATALOG[id];
          return {
            id: f.id,
            name: f.name,
            intent: f.intent,
            /* Derived from the format's channels, never a second hand-kept list. §295. */
            platforms: platformsForFormat(f.id),
            needsArtifact: f.needsArtifact,
            needsCitation: requiresCitation(f),
          };
        })}
      />

      <aside className="flex flex-col gap-3.5">
        <Sheet>
          <Label>What it can do</Label>
          <ul className="flex flex-col gap-1.5">
            {TOOLS.map(([id, what]) => (
              <li key={id} className="text-[12px] leading-snug">
                <span className="font-data text-[10.5px] text-quiet">{id}</span>
                <span className="mt-0.5 block text-quiet">{what}</span>
              </li>
            ))}
          </ul>
        </Sheet>
        <Sheet tone="cool">
          <Label>Where it ends</Label>
          <p className="text-[12px] leading-relaxed text-quiet">
            Anything you keep lands in the Gallery as a draft. The chat cannot publish, and
            nothing here skips the gates.
          </p>
        </Sheet>
      </aside>
    </div>
  );
}
