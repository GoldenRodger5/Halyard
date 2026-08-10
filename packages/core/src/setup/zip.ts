/**
 * A minimal ZIP writer. Milestone 50.
 *
 * The setup kit has to come out as one download: a folder of correctly sized
 * images plus a text file of every bio and pinned post, ready to paste while
 * creating accounts. Seven platforms is up to sixteen files, and sixteen
 * right-click-save-as is not a download.
 *
 * Written rather than pulled in because the whole requirement is *store* mode —
 * PNGs are already compressed and deflating them again saves nothing, so the
 * only real work is the header layout. A dependency would be ~1MB and a supply
 * chain for eighty lines of struct packing.
 *
 * Format: PKZIP APPNOTE 6.3.3, method 0 (stored), no data descriptors, no
 * Zip64. That is sufficient here and refused past its limits rather than
 * silently producing an archive that opens as garbage.
 */

export interface ZipEntry {
  /** Path inside the archive. Forward slashes, no leading slash. */
  path: string;
  content: Buffer | string;
}

/** Entries beyond this need Zip64, which this writer does not implement. */
const MAX_ENTRIES = 0xffff;
/** Sizes beyond this need Zip64 too. */
const MAX_BYTES = 0xfffffffe;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]!) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS date and time, which is what ZIP records.
 *
 * Fixed rather than taken from the clock. Two runs of the same kit should
 * produce byte-identical archives — it makes the output testable, and an
 * operator who downloads twice gets one file instead of two that differ only in
 * a timestamp they cannot see.
 */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

export function buildZip(entries: ZipEntry[]): Buffer {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(
      `A ZIP with ${entries.length} entries needs Zip64, which this writer does not implement.`,
    );
  }

  const seen = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const path = entry.path.replace(/^\/+/, '').replace(/\\/g, '/');
    if (seen.has(path)) {
      throw new Error(`Duplicate path in archive: ${path}`);
    }
    seen.add(path);

    const name = Buffer.from(path, 'utf8');
    const content = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8');

    if (content.length > MAX_BYTES) {
      throw new Error(`${path} is too large for a non-Zip64 archive.`);
    }

    const crc = crc32(content);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 names
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18); // compressed size
    local.writeUInt32LE(content.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // offset of local header

    locals.push(local, name, content);
    centrals.push(central, name);
    offset += local.length + name.length + content.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralDirectory, end]);
}
