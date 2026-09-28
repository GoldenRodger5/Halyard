import { box, renderElement, text as satoriText, type SatoriElement } from '@halyard/render/image';

export type MomentCircuitOverlayKind = 'hook' | 'required' | 'persistent';

export interface MomentCircuitOverlaySegment {
  hook_line1?: string;
  hook_line2?: string;
  required_text?: string;
  disclosure?: string;
  disclosure_mode?: 'none' | 'opening' | 'persistent';
}

const WIDTH = 1080;
const HEIGHT = 1920;

function portableText(value: string): string {
  const normalized = value
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ');

  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    const supported =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x00a1 && code <= 0x024f);
    if (!supported) throw new Error('OVERLAY_UNSUPPORTED_GLYPH');
  }
  return normalized;
}

function centeredText(content: string, top: number, size: number, color: string, dx = 0, dy = 0): SatoriElement {
  return box(
    {
      position: 'absolute',
      top: top + dy,
      left: dx,
      width: WIDTH,
      height: Math.round(size * 1.45),
      justifyContent: 'center',
      alignItems: 'center',
    },
    satoriText(content, {
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: size,
      lineHeight: 1,
      color,
      textAlign: 'center',
      whiteSpace: 'nowrap',
    }),
  );
}

function outlinedText(content: string, top: number, size: number): SatoriElement[] {
  const safe = portableText(content.trim().slice(0, 42));
  if (!safe) return [];
  const shadow = 'rgba(0,0,0,0.90)';
  const offsets = [
    [-4, 0], [4, 0], [0, -4], [0, 4],
    [-3, -3], [3, -3], [-3, 3], [3, 3],
  ] as const;
  return [
    ...offsets.map(([dx, dy]) => centeredText(safe, top, size, shadow, dx, dy)),
    centeredText(safe, top, size, '#ffffff'),
  ];
}

function disclosureBadge(text: string): SatoriElement {
  return box(
    {
      position: 'absolute',
      top: 250,
      left: 46,
      width: 104,
      height: 52,
      borderRadius: 12,
      backgroundColor: 'rgba(0,0,0,0.68)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    satoriText(portableText(text), {
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 27,
      lineHeight: 1,
      color: '#ffffff',
    }),
  );
}

function requiredSubtitle(value: string): SatoriElement {
  return box(
    {
      position: 'absolute',
      top: 1305,
      left: 90,
      width: 900,
      minHeight: 70,
      padding: '14px 24px',
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.72)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    satoriText(portableText(value), {
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 34,
      lineHeight: 1.18,
      color: '#ffffff',
      textAlign: 'center',
    }),
  );
}

export async function renderMomentCircuitOverlay(
  segment: MomentCircuitOverlaySegment,
  kind: MomentCircuitOverlayKind,
): Promise<Buffer> {
  const children: SatoriElement[] = [];

  if (kind === 'hook') {
    children.push(...outlinedText(segment.hook_line1 ?? '', 305, 56));
    children.push(...outlinedText(segment.hook_line2 ?? '', 382, 48));
    if (segment.disclosure && segment.disclosure_mode === 'opening') {
      children.push(disclosureBadge(segment.disclosure));
    }
  } else if (kind === 'required' && segment.required_text) {
    children.push(requiredSubtitle(segment.required_text));
  } else if (kind === 'persistent' && segment.disclosure) {
    children.push(disclosureBadge(segment.disclosure));
  }

  const root = box(
    {
      position: 'relative',
      width: WIDTH,
      height: HEIGHT,
    },
    ...children,
  );
  const rendered = await renderElement(root, {
    aspectRatio: '9:16',
    quality: 'final',
    size: { width: WIDTH, height: HEIGHT },
  });
  return rendered.png;
}
