/**
 * §330. The marks a product uses, and where they point.
 *
 * §284 gave Halyard hand-drawn annotations — circles, arrows, underlines, drawn
 * with a seeded wobble so they read as a person with a pen rather than a UI
 * element. Two things were missing.
 *
 * **They point at nothing in particular.** An `Annotation` takes a box and
 * draws inside it. If a voiceover says "look at this" and an arrow is meant to
 * indicate a control, nothing computes where the arrow should *start*, which
 * way it should approach, or where its head should land. It has to be placed by
 * hand, which cannot happen for content nobody is authoring by hand.
 *
 * **They are the same marks for every product.** A hand-drawn wobbling circle
 * suits a warm editorial recipe brand. On a dark, precise, grotesque-set film
 * product it looks like somebody scribbled on the design. The operator's point
 * is that a pack is generated *per app*: RecipeFix and Kinolog should not share
 * a pen.
 *
 * ## Derived from the brand, not chosen
 *
 * A motif pack follows from what the brand already says about itself. A product
 * that sets its display face in a serif on a warm light ground is speaking in
 * an editorial register, and a drawn mark belongs there. One that sets a
 * grotesque on near-black is speaking in a precise register, where a mark
 * should be geometric and exact.
 *
 * That is a real inference from real data — the fonts and colours §323 reads out
 * of the product's own stylesheet — rather than a per-product configuration
 * somebody has to remember to fill in. A third product attached tomorrow gets a
 * coherent pack without anybody choosing one.
 */
import type { BrandTokens } from '../brand.js';
import type { AnnotationKind } from './annotate.js';

export const MOTIF_REGISTERS = ['drawn', 'precise'] as const;
export type MotifRegister = (typeof MOTIF_REGISTERS)[number];

export interface MotifPack {
  register: MotifRegister;
  /**
   * The marks this product uses, in preference order.
   *
   * A pack is a *restriction*, not a menu. An account that circles some things,
   * boxes others and underlines the rest looks like three people made it; one
   * that always circles looks like a house style.
   */
  marks: AnnotationKind[];
  /** Stroke weight, in viewBox units, so it scales with the frame. */
  stroke: number;
  /**
   * How much the hand shakes, 0..1. Zero is a ruler.
   *
   * The single strongest signal of register. A precise brand with a wobble
   * reads as sloppy; a warm brand without one reads as clip art.
   */
  wobble: number;
  /** Corner rounding for boxes and rings, in viewBox units. */
  radius: number;
  /** Whether an arrowhead is two open strokes or a filled triangle. */
  head: 'open' | 'filled';
  /** Why this pack, in a line an operator can disagree with. */
  reason: string;
}

/** Perceived brightness of a hex colour, 0..1. */
function brightness(hex: string): number {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Typefaces whose names indicate a geometric or technical register.
 *
 * Names rather than metrics, because a font file's metrics do not say what it
 * is *for* and its name usually does. A product that chose "Grotesque" or
 * "Mono" chose a register when it picked the name.
 */
const PRECISE_FACE = /grotesk|grotesque|mono|neue|helvetica|inter|geist|arial|roboto|suisse/i;
const DRAWN_FACE = /serif|garamond|caslon|georgia|playfair|instrument|lora|merriweather|tiempos/i;

/**
 * The pack a product uses, derived from its brand.
 *
 * Two signals, both from `brand_tokens`: how bright the ground is, and what the
 * display face is. A dark ground is a deliberate, designed choice — nobody
 * arrives at near-black by accident — and it almost always accompanies a
 * precise visual language. A serif display face is the opposite signal and
 * outweighs the ground, because a warm editorial brand on a dark ground is
 * still editorial.
 */
export function motifFor(brand: BrandTokens): MotifPack {
  const heading = brand.headingFont ?? '';
  const dark = brightness(brand.background) < 0.35;

  const serif = DRAWN_FACE.test(heading);
  const grotesque = PRECISE_FACE.test(heading);

  /*
   * A serif display face is the strongest single signal and is checked first:
   * a product that set its headlines in a serif is speaking editorially
   * whatever its ground, and a ruled geometric mark would fight the type.
   */
  if (serif && !dark) {
    return {
      register: 'drawn',
      marks: ['circle', 'underline', 'arrow'],
      stroke: 0.85,
      wobble: 1,
      radius: 0,
      head: 'open',
      reason: `${heading} is a serif on a light ground, which is an editorial register — a drawn mark belongs there.`,
    };
  }

  if (grotesque || dark) {
    return {
      register: 'precise',
      marks: ['box', 'arrow', 'underline'],
      stroke: 0.7,
      /* Not zero: a perfectly straight stroke reads as a UI chrome element
         rather than as something a person added. Just enough to be human. */
      wobble: 0.15,
      radius: 2.5,
      head: 'filled',
      reason: dark
        ? `A ${brightness(brand.background) < 0.2 ? 'near-black' : 'dark'} ground with ${heading || 'a sans face'} is a precise register, so marks are geometric.`
        : `${heading} is a grotesque, which is a precise register — a wobbling mark would read as sloppy against it.`,
    };
  }

  /*
   * Neither signal. Drawn is the safer default: a slightly hand-made mark on a
   * precise brand looks like a choice, and a ruled mark on a warm brand looks
   * like a missing stylesheet.
   */
  return {
    register: 'drawn',
    marks: ['circle', 'underline', 'arrow'],
    stroke: 0.85,
    wobble: 0.7,
    radius: 0,
    head: 'open',
    reason: 'Neither the ground nor the display face indicates a register, so the softer one is used.',
  };
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PointedArrow {
  /** The arrow's own box, in the same fractions an `Annotation` takes. */
  box: Rect;
  /** Which edge of the target it approaches, for a caller that wants to know. */
  approach: 'above' | 'below' | 'left' | 'right';
}

/**
 * §330. An arrow that lands on a target rather than near it.
 *
 * Given what to point at and where the arrow may start from, this returns the
 * box an `Annotation` needs so the head **stops at the target's edge** — not
 * inside it, which covers the thing being indicated, and not short of it, which
 * points at nothing.
 *
 * The approach is chosen by where there is room. An arrow that crosses the
 * frame to reach a control it could have approached from the near side is
 * longer, slower to draw, and passes over content on the way.
 *
 * Everything is in frame fractions, so the same numbers work at any render
 * size — and nothing here knows what the target *is*, which is what lets it
 * point at a diet chip, a play button, or a word in a caption.
 */
export function arrowTo(
  target: Rect,
  options: { from?: { x: number; y: number }; gap?: number; length?: number } = {},
): PointedArrow {
  /* A small gap so the head indicates the edge instead of overlapping it. */
  const gap = options.gap ?? 0.012;
  const length = options.length ?? 0.16;

  const centre = { x: target.x + target.width / 2, y: target.y + target.height / 2 };

  /*
   * Prefer the side with the most room between the target and the frame edge.
   * Vertical approaches are preferred on a tie because a phone-shaped frame has
   * more vertical room, and an arrow along the long axis stays clear of
   * whatever sits beside the target.
   */
  const room = {
    above: target.y,
    below: 1 - (target.y + target.height),
    left: target.x,
    right: 1 - (target.x + target.width),
  };

  let approach: PointedArrow['approach'];
  if (options.from) {
    /* An explicit origin decides it: the caller knows where the eye already is. */
    const dx = centre.x - options.from.x;
    const dy = centre.y - options.from.y;
    approach =
      Math.abs(dy) >= Math.abs(dx) ? (dy > 0 ? 'above' : 'below') : dx > 0 ? 'left' : 'right';
  } else {
    approach = (Object.entries(room).sort((a, b) => b[1] - a[1])[0]![0] ??
      'above') as PointedArrow['approach'];
  }

  /*
   * The box runs *from* the arrow's tail *to* its head, and `annotate` draws
   * from the box's top-left to its bottom-right — so a box with the head at the
   * top-left is expressed by swapping the corners, which the caller does not
   * need to know about.
   */
  switch (approach) {
    case 'above': {
      const headY = Math.max(0, target.y - gap);
      const tailY = Math.max(0, headY - length);
      return { box: { x: centre.x, y: tailY, width: 0.0001, height: headY - tailY }, approach };
    }
    case 'below': {
      const headY = Math.min(1, target.y + target.height + gap);
      const tailY = Math.min(1, headY + length);
      return { box: { x: centre.x, y: tailY, width: 0.0001, height: headY - tailY }, approach };
    }
    case 'left': {
      const headX = Math.max(0, target.x - gap);
      const tailX = Math.max(0, headX - length);
      return { box: { x: tailX, y: centre.y, width: headX - tailX, height: 0.0001 }, approach };
    }
    case 'right': {
      const headX = Math.min(1, target.x + target.width + gap);
      const tailX = Math.min(1, headX + length);
      return { box: { x: tailX, y: centre.y, width: headX - tailX, height: 0.0001 }, approach };
    }
  }
}

/**
 * A mark that surrounds a target, sized to it.
 *
 * The same idea as §324's ring and available to anything that has a box: a
 * circle or box drawn around something is only correct if it is the size of the
 * thing, and a constant is wrong for every target that is not the one it was
 * tuned against.
 */
export function markAround(target: Rect, pad = 0.02): Rect {
  return {
    x: Math.max(0, target.x - pad),
    y: Math.max(0, target.y - pad * 0.6),
    width: Math.min(1, target.width + pad * 2),
    height: Math.min(1, target.height + pad * 1.2),
  };
}
