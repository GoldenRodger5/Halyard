/**
 * Remotion root. The worker bundles `entry.tsx`, which registers this, then
 * renders a composition by id.
 *
 * Compositions are 1080×1920 at 30fps, with a landscape twin at 1920×1080 for
 * long-form YouTube (§222). `durationInFrames` is supplied per render from the
 * measured audio length (v1 §5.2 "audio-first timing"), so the defaults here
 * only matter in the Remotion Studio preview.
 *
 * The landscape variants share their component with the portrait ones. Layout
 * is resolved from the frame by `geometry.ts` rather than branched on here, so
 * a treatment cannot render correctly in one orientation and wrongly in the
 * other — there is only one implementation to be right.
 */
import React from 'react';
import { Composition } from 'remotion';
import { DEFAULT_BRAND } from '../brand.js';
import { LANDSCAPE_SUFFIX } from './geometry.js';
import {
  ChefNoteCardVideo,
  ScalingMathVideo,
  SubstitutionExplainer,
  TransformationDiffVideo,
} from './compositions.js';

export const VIDEO_WIDTH = 1080;
export const VIDEO_HEIGHT = 1920;
export const VIDEO_FPS = 30;

/** Long-form and landscape. §222. */
export const LANDSCAPE_WIDTH = 1920;
export const LANDSCAPE_HEIGHT = 1080;



export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="TransformationDiff"
      component={TransformationDiffVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={VIDEO_FPS * 28}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        headline: "Sally's Artisan Bread, gluten-free",
        swaps: [
          {
            before: '3 1/4 cups bread flour',
            after: '3 1/4 cups gluten-free bread flour blend',
            reason: 'A 1:1 blend with xanthan gum is the only swap that keeps the dough workable.',
          },
        ],
        wordmark: 'recipefix',
      }}
    />

    <Composition
      id="SubstitutionExplainer"
      component={SubstitutionExplainer as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={VIDEO_FPS * 32}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        ingredient: 'bread flour',
        substitute: 'gluten-free blend',
        ratio: 'Same volume, more water',
        failureMode: 'Skip the extra water and the crumb reads dry before it finishes setting.',
        wordmark: 'recipefix',
      }}
    />

    <Composition
      id="ScalingMath"
      component={ScalingMathVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={VIDEO_FPS * 24}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        fromServings: 8,
        toServings: 2,
        rows: [
          { label: 'Salt', linear: '1/2 tsp', actual: '3/4 tsp' },
          { label: 'Yeast', linear: '1/2 tsp', actual: '3/4 tsp' },
        ],
        note: 'Salt and yeast scale to roughly 85 percent of linear.',
        wordmark: 'recipefix',
      }}
    />

    <Composition
      id="ChefNoteCard"
      component={ChefNoteCardVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={VIDEO_FPS * 16}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        quote: 'The vinegar is doing structural work, not flavour work.',
        attribution: "Sally's Artisan Bread, gluten-free",
        wordmark: 'recipefix',
      }}
    />

    {/*
      §222. Landscape twins. Same components, same props, a different canvas —
      `geometryFor` reads the frame and the layout follows.
    */}
    <Composition
      id={`TransformationDiff${LANDSCAPE_SUFFIX}`}
      component={TransformationDiffVideo as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={VIDEO_FPS * 28}
      fps={VIDEO_FPS}
      width={LANDSCAPE_WIDTH}
      height={LANDSCAPE_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        headline: "Sally's Artisan Bread, gluten-free",
        swaps: [
          {
            before: '3 1/4 cups bread flour',
            after: '3 1/4 cups gluten-free bread flour blend',
            reason: 'A 1:1 blend with xanthan gum is the only swap that keeps the dough workable.',
          },
        ],
        wordmark: 'recipefix',
      }}
    />

    <Composition
      id={`SubstitutionExplainer${LANDSCAPE_SUFFIX}`}
      component={SubstitutionExplainer as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={VIDEO_FPS * 32}
      fps={VIDEO_FPS}
      width={LANDSCAPE_WIDTH}
      height={LANDSCAPE_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        ingredient: 'bread flour',
        substitute: 'gluten-free blend',
        ratio: 'Same volume, more water',
        failureMode: 'Skip the extra water and the crumb reads dry before it finishes setting.',
        wordmark: 'recipefix',
      }}
    />
  </>
);
