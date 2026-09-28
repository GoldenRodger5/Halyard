import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

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
let fontDataUrlPromise: Promise<string> | null = null;

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

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function bundledFontDataUrl(): Promise<string> {
  if (!fontDataUrlPromise) {
    fontDataUrlPromise = (async () => {
      const candidates = [
        path.join(process.cwd(), '../../packages/render/assets/fonts/Inter-SemiBold.woff'),
        path.join(process.cwd(), 'packages/render/assets/fonts/Inter-SemiBold.woff'),
        '/var/task/packages/render/assets/fonts/Inter-SemiBold.woff',
        '/var/task/apps/web/../../packages/render/assets/fonts/Inter-SemiBold.woff',
      ];
      for (const candidate of candidates) {
        try {
          const font = await fs.readFile(candidate);
          return `data:font/woff;base64,${font.toString('base64')}`;
        } catch {
          // Try the next traced location.
        }
      }
      throw new Error('MOMENTCIRCUIT_FONT_MISSING');
    })();
  }
  return fontDataUrlPromise;
}

function textNode(
  content: string,
  y: number,
  size: number,
  options: { stroke?: number; x?: number; anchor?: 'middle' | 'start' } = {},
): string {
  const safe = escapeXml(portableText(content.trim().slice(0, 84)));
  if (!safe) return '';
  const x = options.x ?? WIDTH / 2;
  const anchor = options.anchor ?? 'middle';
  const stroke = options.stroke ?? 0;
  const strokeAttrs = stroke
    ? ` stroke="rgba(0,0,0,0.92)" stroke-width="${stroke}" paint-order="stroke fill" stroke-linejoin="round"`
    : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="MCInter, Arial, sans-serif" font-size="${size}" font-weight="700" fill="#ffffff"${strokeAttrs}>${safe}</text>`;
}

function wrapSubtitle(value: string, maxChars = 40): string[] {
  const safe = portableText(value).trim();
  if (!safe) return [];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= 2) return lines;
  const first = lines[0]!;
  const rest = lines.slice(1).join(' ');
  return [first, rest.length <= maxChars ? rest : `${rest.slice(0, maxChars - 3)}...`];
}

function svgDocument(children: string, fontDataUrl: string | null): string {
  const fontFace = fontDataUrl
    ? `<style>@font-face{font-family:'MCInter';src:url('${fontDataUrl}') format('woff');font-weight:700;font-style:normal;}</style>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><defs>${fontFace}</defs>${children}</svg>`;
}

function disclosureBadge(value: string): string {
  const safe = escapeXml(portableText(value).trim().slice(0, 24));
  if (!safe) return '';
  return [
    '<rect x="46" y="250" width="150" height="52" rx="12" fill="rgba(0,0,0,0.68)"/>',
    `<text x="121" y="285" text-anchor="middle" font-family="MCInter, Arial, sans-serif" font-size="27" font-weight="700" fill="#ffffff">${safe}</text>`,
  ].join('');
}

function requiredSubtitle(value: string): string {
  const lines = wrapSubtitle(value);
  if (!lines.length) return '';
  const height = lines.length === 1 ? 86 : 128;
  const top = lines.length === 1 ? 1305 : 1284;
  const firstY = lines.length === 1 ? top + 56 : top + 49;
  const nodes = [
    `<rect x="90" y="${top}" width="900" height="${height}" rx="16" fill="rgba(0,0,0,0.72)"/>`,
  ];
  for (let i = 0; i < lines.length; i += 1) {
    nodes.push(textNode(lines[i]!, firstY + i * 43, 34));
  }
  return nodes.join('');
}

export async function renderMomentCircuitOverlay(
  segment: MomentCircuitOverlaySegment,
  kind: MomentCircuitOverlayKind,
): Promise<Buffer> {
  const children: string[] = [];

  if (kind === 'hook') {
    if (segment.hook_line1) children.push(textNode(segment.hook_line1.slice(0, 42), 360, 56, { stroke: 8 }));
    if (segment.hook_line2) children.push(textNode(segment.hook_line2.slice(0, 42), 430, 48, { stroke: 7 }));
    if (segment.disclosure && segment.disclosure_mode === 'opening') {
      children.push(disclosureBadge(segment.disclosure));
    }
  } else if (kind === 'required' && segment.required_text) {
    children.push(requiredSubtitle(segment.required_text));
  } else if (kind === 'persistent' && segment.disclosure) {
    children.push(disclosureBadge(segment.disclosure));
  }

  const hasText = children.some(Boolean);
  const fontDataUrl = hasText ? await bundledFontDataUrl() : null;
  const svg = svgDocument(children.join(''), fontDataUrl);
  return sharp(Buffer.from(svg)).png().toBuffer();
}
