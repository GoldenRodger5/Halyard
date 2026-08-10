import { NextResponse, type NextRequest } from 'next/server';
import { renderTemplate, type TemplateId } from '@halyard/render';
import { one } from '@/lib/db';
import { requireOperator } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Live template preview. v1 §8: the gallery "renders on demand so a template
 * change is visible immediately."
 */
const SAMPLE_PROPS: Record<string, Record<string, unknown>> = {
  transformation_diff_1x1: {
    headline: "Sally's Artisan Bread, gluten-free",
    before: '3 1/4 cups bread flour',
    after: '3 1/4 cups gluten-free bread flour blend',
    reason:
      'A 1:1 blend with xanthan gum is the only swap that keeps the dough workable. Expect a wetter dough than the original.',
    alternative: 'Equal parts white rice flour, tapioca starch and sorghum',
  },
  substitution_ratio: {
    ingredient: 'bread flour',
    substitute: 'gluten-free blend',
    ratio: 'Same volume, more water',
    failureMode: 'Skip the extra water and the crumb reads dry before the centre finishes setting.',
  },
  chef_note_quote: {
    quote: 'The vinegar is doing structural work, not flavour work.',
    attribution: "Sally's Artisan Bread, gluten-free",
  },
  scaling_math: {
    fromServings: 8,
    toServings: 2,
    rows: [
      { label: 'Salt', linear: '1/2 tsp', actual: '3/4 tsp' },
      { label: 'Yeast', linear: '1/2 tsp', actual: '3/4 tsp' },
      { label: 'Water', linear: '3/8 cup', actual: '1/2 cup' },
    ],
    note: 'Salt and yeast scale to roughly 85 percent of linear.',
  },
  pinterest_tall: {
    title: 'Gluten-free sandwich loaf that holds its shape',
    subtitle: 'Vinegar in the dough, lower oven, longer bake.',
    bullets: [
      'Acid firms the protein network',
      'Drop the oven twenty five degrees',
      'Cool completely before slicing',
    ],
  },
  carousel_6: {
    index: 3,
    total: 6,
    kicker: 'The swaps',
    headline: '3 changes',
    bodyLines: [
      '3 1/4 cups bread flour becomes gluten-free blend',
      '1 1/2 cups water becomes 1 3/4 cups',
      'add 1 teaspoon apple cider vinegar',
    ],
  },
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  await requireOperator();
  const { id } = await context.params;

  const template = await one<{ aspect_ratio: string; renderer: string }>(
    'select aspect_ratio, renderer from templates where id = $1',
    [id],
  );
  if (!template) return NextResponse.json({ error: 'unknown template' }, { status: 404 });

  if (template.renderer !== 'satori') {
    return NextResponse.json(
      {
        error: `'${id}' is a ${template.renderer} composition.`,
        hint: 'Video previews come from the worker, which is where Chromium lives.',
      },
      { status: 501 },
    );
  }

  const props = SAMPLE_PROPS[id];
  if (!props) {
    return NextResponse.json({ error: `No sample props defined for '${id}'.` }, { status: 501 });
  }

  const product = await one<{ brand_tokens: Record<string, unknown>; name: string }>(
    'select brand_tokens, name from products order by created_at limit 1',
  );

  const result = await renderTemplate({
    templateId: id as TemplateId,
    props,
    brandTokens: product?.brand_tokens ?? null,
    aspectRatio: template.aspect_ratio,
    wordmark: product?.name.toLowerCase(),
  });

  return new Response(new Uint8Array(result.png), {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'no-store',
    },
  });
}
