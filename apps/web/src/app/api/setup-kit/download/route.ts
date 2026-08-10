import { NextResponse, type NextRequest } from 'next/server';
import {
  CREATION_ORDER,
  CREATION_ORDER_NOTE,
  PROFILE_SPECS,
  SETUP_CHECKLISTS,
  buildZip,
  profileUrl,
  type PlatformId,
  type ZipEntry,
} from '@halyard/core';
import { avatarElement, bannerElement, renderElement } from '@halyard/render/image';
import { one, query } from '@/lib/db';
import { requireOperator } from '@/lib/auth';
import { linkInBioUrl } from '@/lib/origin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface KitRow {
  platform: string;
  persona: string;
  bios: Array<{ text: string; angle: string; length: number }>;
  display_names: string[];
  pinned_post: string | null;
  chosen_bio: number | null;
  chosen_name: number | null;
}

/**
 * The whole kit as one download. Milestone 50.
 *
 * A folder of correctly sized images plus one text file containing every bio,
 * display name, pinned post and checklist — the shape the spec asks for, and the
 * shape the job actually takes: the operator has this open in one window and a
 * signup form in another, working through seven platforms.
 *
 * The text file is deliberately one file rather than seven. Seven files means
 * seven times finding the right window.
 */
export async function GET(request: NextRequest) {
  await requireOperator();

  const productId = request.nextUrl.searchParams.get('product') ?? '';
  const persona = request.nextUrl.searchParams.get('persona') ?? 'brand';

  const product = await one<{
    id: string;
    name: string;
    tagline: string | null;
    brand_tokens: Record<string, unknown>;
  }>('select id, name, tagline, brand_tokens from products where id = $1', [productId]);

  if (!product) {
    return NextResponse.json({ error: 'Unknown product.' }, { status: 404 });
  }

  const entries = await query<KitRow>(
    `select platform, persona, bios, display_names, pinned_post, chosen_bio, chosen_name
       from setup_kit_entries where product_id = $1 and persona = $2`,
    [productId, persona],
  );
  const handles = await query<{ platform: string; handle: string; last_status: string | null }>(
    'select platform, handle, last_status from desired_handles where product_id = $1',
    [productId],
  );

  const bioLink = await linkInBioUrl(productId);
  const byPlatform = new Map(entries.map((row) => [row.platform, row]));
  const handleFor = new Map(handles.map((row) => [row.platform, row]));

  const files: ZipEntry[] = [];
  const slug = product.id.replace(/[^a-zA-Z0-9-]/g, '') || 'product';

  // ── images ───────────────────────────────────────────────────────────────
  const artInput = {
    productName: product.name,
    tagline: product.tagline,
    brandTokens: product.brand_tokens,
  };

  for (const platform of CREATION_ORDER) {
    const spec = PROFILE_SPECS[platform];

    const avatar = await renderElement(avatarElement(artInput, spec.avatar.width), {
      aspectRatio: '1:1',
      size: { width: spec.avatar.width, height: spec.avatar.height },
    });
    files.push({
      path: `${slug}-setup-kit/images/${platform}-avatar-${spec.avatar.width}x${spec.avatar.height}.png`,
      content: avatar.png,
    });

    if (spec.banner) {
      const banner = await renderElement(
        bannerElement(artInput, spec.banner.width, spec.banner.height, spec.banner.safeAreaFraction),
        {
          aspectRatio: '16:9',
          size: { width: spec.banner.width, height: spec.banner.height },
        },
      );
      files.push({
        path: `${slug}-setup-kit/images/${platform}-header-${spec.banner.width}x${spec.banner.height}.png`,
        content: banner.png,
      });
    }
  }

  // ── the paste file ───────────────────────────────────────────────────────
  files.push({
    path: `${slug}-setup-kit/profiles.txt`,
    content: renderPasteFile({
      productName: product.name,
      persona,
      bioLink,
      byPlatform,
      handleFor,
    }),
  });

  const zip = buildZip(files);

  return new Response(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${slug}-setup-kit.zip"`,
      'content-length': String(zip.length),
      'cache-control': 'private, max-age=0, must-revalidate',
    },
  });
}

function renderPasteFile(input: {
  productName: string;
  persona: string;
  bioLink: string | null;
  byPlatform: Map<string, KitRow>;
  handleFor: Map<string, { handle: string; last_status: string | null }>;
}): string {
  const lines: string[] = [
    `${input.productName} — account setup kit`,
    `${input.persona} accounts`,
    '',
    CREATION_ORDER_NOTE,
    '',
    input.bioLink
      ? `Link for every profile's website field:\n  ${input.bioLink}`
      : `NO LINK-IN-BIO URL YET.\n  The /l page is only reachable on a deployed origin, and this kit was\n  generated from one that is not public. Deploy first, then download again,\n  rather than creating profiles you have to go back and edit.`,
    '',
    '='.repeat(72),
    '',
  ];

  for (const platform of CREATION_ORDER) {
    const spec = PROFILE_SPECS[platform as PlatformId];
    const entry = input.byPlatform.get(platform);
    const handle = input.handleFor.get(platform);

    lines.push(`## ${platform.toUpperCase()}`, '');

    if (handle) {
      lines.push(
        `Handle:        @${handle.handle}` +
          (handle.last_status === 'available'
            ? '   (looked free when checked)'
            : handle.last_status === 'taken'
              ? '   (TAKEN when checked — pick another)'
              : handle.last_status === 'invalid'
                ? '   (not a legal handle here)'
                : '   (could not be checked — verify by hand)'),
        `Check it at:   ${profileUrl(platform, handle.handle)}`,
      );
    }
    lines.push(
      `Bio limit:     ${spec.bioMaxChars} characters`,
      `Name limit:    ${spec.displayNameMaxChars} characters`,
      `Avatar:        ${spec.avatar.width}x${spec.avatar.height}  (images/${platform}-avatar-${spec.avatar.width}x${spec.avatar.height}.png)`,
    );
    if (spec.banner) {
      lines.push(
        `${spec.banner.label.padEnd(14)} ${spec.banner.width}x${spec.banner.height}  (images/${platform}-header-${spec.banner.width}x${spec.banner.height}.png)`,
      );
      if (spec.banner.note) lines.push(`               ${spec.banner.note}`);
    }
    lines.push(`Link field:    ${spec.linkNote}`, '');

    if (!entry) {
      lines.push('  Nothing generated for this platform yet.', '');
    } else {
      lines.push('DISPLAY NAME');
      entry.display_names.forEach((name, i) => {
        const mark = entry.chosen_name === i ? '>' : ' ';
        lines.push(`  ${mark} ${name}   [${name.length}/${spec.displayNameMaxChars}]`);
      });
      lines.push('', 'BIO');
      entry.bios.forEach((bio, i) => {
        const mark = entry.chosen_bio === i ? '>' : ' ';
        lines.push(`  ${mark} (${bio.angle})   [${bio.length}/${spec.bioMaxChars}]`);
        for (const line of bio.text.split('\n')) lines.push(`      ${line}`);
        lines.push('');
      });

      if (entry.pinned_post) {
        lines.push('PINNED POST');
        for (const line of entry.pinned_post.split('\n')) lines.push(`    ${line}`);
        lines.push('');
      }
    }

    lines.push('BEFORE HALYARD CAN PUBLISH HERE');
    for (const step of SETUP_CHECKLISTS[platform as PlatformId]) {
      lines.push(`  [${step.blocking ? '!' : ' '}] ${step.label}`);
      lines.push(`      ${step.detail}`);
    }
    lines.push('', '-'.repeat(72), '');
  }

  lines.push(
    'A [!] step is not optional. Skipping it means no API can publish to that',
    'account regardless of what any app review says, and fixing it later usually',
    'means creating the account again.',
    '',
  );

  return lines.join('\n');
}
