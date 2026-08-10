/**
 * A tiny element factory for Satori.
 *
 * Satori accepts React elements, but it only ever reads `type`, `props.style`
 * and `props.children`. Building plain objects keeps the render package free of
 * a React runtime dependency and makes templates trivially snapshot-testable —
 * a template is a pure function returning data.
 */

export interface SatoriStyle {
  [key: string]: string | number | undefined;
}

export interface SatoriElement {
  type: string;
  props: {
    style?: SatoriStyle;
    children?: SatoriChild;
    [key: string]: unknown;
  };
  key?: string | null;
}

export type SatoriChild = SatoriElement | string | number | Array<SatoriChild> | null | undefined;

export function h(
  type: string,
  style: SatoriStyle | null,
  ...children: SatoriChild[]
): SatoriElement {
  const flat = children.flat().filter((c): c is Exclude<SatoriChild, null | undefined> => c !== null && c !== undefined);
  return {
    type,
    props: {
      ...(style ? { style } : {}),
      children: flat.length === 0 ? undefined : flat.length === 1 ? flat[0] : flat,
    },
    key: null,
  };
}

/** Satori requires every div to declare a display mode; this is the default box. */
export function box(style: SatoriStyle, ...children: SatoriChild[]): SatoriElement {
  return h('div', { display: 'flex', ...style }, ...children);
}

export function text(content: string, style: SatoriStyle): SatoriElement {
  return h('div', { display: 'flex', ...style }, content);
}

/** Walk an element tree collecting every text node with its style. Used by tests. */
export function collectText(element: SatoriChild, out: string[] = []): string[] {
  if (element === null || element === undefined) return out;
  if (typeof element === 'string' || typeof element === 'number') {
    out.push(String(element));
    return out;
  }
  if (Array.isArray(element)) {
    for (const child of element) collectText(child, out);
    return out;
  }
  collectText(element.props.children, out);
  return out;
}

/**
 * A right arrow, drawn rather than typed.
 *
 * The Inter latin subset has no U+2192, so a literal arrow renders as tofu.
 * Drawing it as a data-URI SVG keeps the font files small and guarantees the
 * glyph exists on every card.
 */
export function arrowRight(color: string, size = 44): SatoriElement {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">` +
    `<path d="M3 12h15M13 6l6 6-6 6" fill="none" stroke="${color}" stroke-width="2.2" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return {
    type: 'img',
    props: {
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
      width: size,
      height: size,
      style: { width: size, height: size },
    },
    key: null,
  };
}
