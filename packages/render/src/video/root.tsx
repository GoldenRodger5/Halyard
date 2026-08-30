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
import { QuizVideo, quizDurationFor, quizDurationSeconds } from './quiz.js';
import { Walkthrough, walkthroughDurationSeconds } from './walkthrough.js';
import { Narrative, narrativeDurationSeconds } from './narrative.js';
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
    {/*
      §289. The quiz. Its length is a function of how many questions it has, so
      `durationInFrames` is computed rather than fixed — a composition whose
      length does not match its content clips the last answer or ends on dead
      air, and both read as a bug rather than an edit. The worker overrides this
      per render with the real question count.
    */}
    {/*
      §298. Spec §12's "animated UI demonstrations" — the one media type on that
      list with nothing behind it. A screenshot says a screen exists; a recording
      inside a device, with the thing being explained pointed at as it happens,
      says what using it is like.
    */}
    <Composition
      id="Walkthrough"
      component={Walkthrough as unknown as React.FC<Record<string, unknown>>}
      /*
       * §306. As long as the recording, not a flat twenty seconds.
       *
       * The same bug the quiz had: a fixed length for a composition whose
       * content decides it. Twenty seconds against a twelve-second capture
       * holds a frozen last frame for eight; against a thirty-second one it
       * cuts the payoff. `footageSeconds` is measured by the worker (`footageMs`
       * in the capture handler) and passed through, so the video is exactly as
       * long as the thing it shows.
       */
      calculateMetadata={({ props }) => {
        /*
         * §321. After the ramps. A stretch played at 3× occupies a third of the
         * timeline, and a composition sized from raw footage would hold a
         * frozen final frame for the difference.
         */
        const p = props as {
          footageSeconds?: number;
          speedRamps?: Array<{ fromSeconds: number; toSeconds: number; rate: number }>;
        };
        const seconds =
          p.footageSeconds && p.footageSeconds > 0
            ? walkthroughDurationSeconds(p.footageSeconds, p.speedRamps ?? [])
            : 20;
        return { durationInFrames: Math.round(VIDEO_FPS * seconds) };
      }}
      durationInFrames={VIDEO_FPS * 20}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        screenSrc: '',
        headline: 'Paste a recipe. Get it adapted.',
        wordmark: 'recipefix',
        callouts: [
          { atSeconds: 1.2, text: 'Paste any recipe link', at: { x: 0.5, y: 0.34 } },
          { atSeconds: 5.0, text: 'Pick what you need to avoid', at: { x: 0.5, y: 0.56 } },
          { atSeconds: 9.5, text: 'Every swap says why', at: { x: 0.5, y: 0.45 } },
        ],
      }}
    />

    {/*
      §308. The composition the other four short-video formats run through.
      `history`, `tips`, `myth_fact` and `origin` had none and rendered as
      cards, which is why they looked like slideshows. They differ in what
      their beats *mean*, not in how a beat is drawn.
    */}
    <Composition
      id="Narrative"
      component={Narrative as unknown as React.FC<Record<string, unknown>>}
      calculateMetadata={({ props }) => {
        const beats = (props as { beats?: Array<{ seconds: number }> }).beats ?? [];
        return {
          durationInFrames: Math.max(
            1,
            Math.round(VIDEO_FPS * (beats.length > 0 ? narrativeDurationSeconds(beats) : 20)),
          ),
        };
      }}
      durationInFrames={VIDEO_FPS * 20}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        wordmark: 'recipefix',
        beats: [
          { role: 'hook', text: 'Bread was accidental.', seconds: 3 },
          { role: 'setup', text: 'Flour and water left out long enough catches wild yeast.', seconds: 4.2 },
          { role: 'turn', text: 'Somebody baked it anyway.', kicker: 'And then', seconds: 3.4 },
          {
            role: 'payoff',
            text: 'Every loaf since is that same accident, repeated on purpose.',
            seconds: 4.6,
          },
        ],
      }}
    />

    <Composition
      id="Quiz"
      component={QuizVideo as unknown as React.FC<Record<string, unknown>>}
      /*
       * §306. Derived from the props, not fixed at three questions.
       *
       * This was `quizDurationSeconds(3)` with a comment saying the worker
       * overrides it per render. The worker passes `durationInFrames` **only
       * when there is a voiceover**, so every quiz without one ran for exactly
       * three questions' worth of frames — a four-question quiz ended in the
       * middle of question three, on screen, reading "Question 3 of 4". Which
       * is what an operator saw.
       *
       * `calculateMetadata` makes the composition describe its own length, so
       * no caller has to remember. A composition whose duration depends on its
       * content and is declared as a constant is a bug waiting for the first
       * piece that is not the default size.
       */
      calculateMetadata={({ props }) => {
        /*
         * §312. Sized from the questions themselves, because a reveal that
         * carries a fact holds longer than one that does not — a composition
         * sized by the average ends mid-sentence on the long ones.
         */
        const questions =
          (props as { questions?: Array<{ answer: string; aside?: string | null }> }).questions ??
          [];
        const countdown = (props as { countdownSeconds?: number }).countdownSeconds;
        return {
          durationInFrames: Math.round(
            VIDEO_FPS *
              (questions.length > 0
                ? quizDurationFor(questions, countdown, (props as { title?: string }).title ?? '')
                : quizDurationSeconds(1)),
          ),
        };
      }}
      durationInFrames={Math.round(VIDEO_FPS * quizDurationSeconds(3))}
      fps={VIDEO_FPS}
      width={VIDEO_WIDTH}
      height={VIDEO_HEIGHT}
      defaultProps={{
        brand: DEFAULT_BRAND,
        title: 'Five gluten questions in thirty seconds',
        wordmark: 'recipefix',
        questions: [
          {
            question: 'What year was gluten first identified?',
            answer: '1728 — by Jacopo Beccari, separating wheat into starch and a stretchy residue.',
            source: 'en.wikipedia.org/wiki/Jacopo_Bartolomeo_Beccari',
          },
          {
            question: 'Are oats naturally gluten free?',
            answer: 'Yes — but most are milled beside wheat, so only certified oats are safe.',
            source: 'celiac.org',
          },
          {
            question: 'What does gluten actually do in bread?',
            answer: 'It forms the elastic network that traps gas, which is why loaves hold their shape.',
            source: 'kingarthurbaking.com',
          },
        ],
      }}
    />

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
