import sharp from 'sharp';

export type MomentCircuitOverlayKind = 'hook' | 'required' | 'persistent' | 'caption';

export interface MomentCircuitOverlaySegment {
  hook_line1?: string;
  hook_line2?: string;
  required_text?: string;
  caption_text?: string;
  disclosure?: string;
  disclosure_mode?: 'none' | 'opening' | 'persistent';
}

const WIDTH = 1080;
const HEIGHT = 1920;

const RAW_SUBTITLE_ARTIFACT_RE =
  /(Dialogue:|Style:|Script Info|Format:|-->|,Cap,,|(?:^|\s)\d{1,2}:\d{2}:\d{2}[.,]\d+|"(?:start|end)"\s*:|\{\s*"start")/i;

export function assertCleanOverlayText(value: string): void {
  if (RAW_SUBTITLE_ARTIFACT_RE.test(value)) throw new Error('OVERLAY_RAW_SUBTITLE_ARTIFACT');
}

function portableText(value: string): string {
  assertCleanOverlayText(value);
  const normalized = value
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    const supported =
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0x00a1 && code <= 0x024f);
    if (!supported) throw new Error('OVERLAY_UNSUPPORTED_GLYPH');
  }
  return normalized;
}

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapWords(value: string, maxChars: number, maxLines: number): string[] {
  const safe = portableText(value);
  if (!safe) return [];
  const words = safe.split(' ');
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxChars || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }

  if (lines.length < maxLines && line) {
    const consumed = lines.join(' ').split(' ').filter(Boolean).length;
    const remaining = words.slice(consumed).join(' ');
    lines.push(remaining.length > maxChars ? `${remaining.slice(0, Math.max(1, maxChars - 3)).trim()}...` : remaining);
  }

  return lines.slice(0, maxLines);
}

function textBlock(
  lines: string[],
  opts: { top: number; fontSize: number; lineHeight: number; strokeWidth?: number; box?: boolean },
): string {
  if (!lines.length) return '';
  const { top, fontSize, lineHeight, strokeWidth = 5, box = false } = opts;
  const height = Math.max(80, lines.length * lineHeight + 34);
  const rect = box
    ? `<rect x="65" y="${top - 24}" width="950" height="${height}" rx="20" fill="rgba(0,0,0,0.64)"/>`
    : '';
  const tspans = lines
    .map((line, i) => `<tspan x="540" dy="${i === 0 ? 0 : lineHeight}">${xml(line)}</tspan>`)
    .join('');

  return `${rect}<text x="540" y="${top}" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="${fontSize}"
    fill="white" stroke="rgba(0,0,0,0.92)" stroke-width="${strokeWidth}"
    stroke-linejoin="round" paint-order="stroke fill">${tspans}</text>`;
}

function disclosureBadge(value: string): string {
  const safe = portableText(value).slice(0, 20);
  if (!safe) return '';
  return `<rect x="46" y="250" width="118" height="54" rx="12" fill="rgba(0,0,0,0.72)"/>
    <text x="105" y="286" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-weight="800" font-size="28" fill="white">${xml(safe)}</text>`;
}

export async function renderMomentCircuitOverlay(
  segment: MomentCircuitOverlaySegment,
  kind: MomentCircuitOverlayKind,
): Promise<Buffer> {
  let body = '';

  if (kind === 'hook') {
    const line1 = wrapWords(segment.hook_line1 ?? '', 30, 2);
    const line2 = wrapWords(segment.hook_line2 ?? '', 34, 2);
    body += textBlock(line1, { top: 335, fontSize: 58, lineHeight: 66 });
    if (line2.length) {
      body += textBlock(line2, { top: 335 + Math.max(1, line1.length) * 70, fontSize: 48, lineHeight: 58 });
    }
    if (segment.disclosure && segment.disclosure_mode === 'opening') {
      body += disclosureBadge(segment.disclosure);
    }
  } else if (kind === 'required' && segment.required_text) {
    body += textBlock(wrapWords(segment.required_text, 40, 2), {
      top: 1348,
      fontSize: 38,
      lineHeight: 48,
      strokeWidth: 3,
      box: true,
    });
  } else if (kind === 'persistent' && segment.disclosure) {
    body += disclosureBadge(segment.disclosure);
  } else if (kind === 'caption' && segment.caption_text) {
    body += textBlock(wrapWords(segment.caption_text, 34, 2), {
      top: 1422,
      fontSize: 48,
      lineHeight: 58,
      strokeWidth: 4,
      box: true,
    });
  }

  const svg = Buffer.from(
    `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`,
  );
  return sharp(svg).png().toBuffer();
}
