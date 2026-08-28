/**
 * A deterministic fixture audio library. §241.
 *
 * ## Why this exists, given §221 said not to synthesise beds
 *
 * §221's argument was never "test audio is bad". It was that a synthesised
 * pad would be **indistinguishable in the pipeline from a real bed**, so
 * nobody would ever notice which one shipped. §239 removed that danger by
 * making the distinction a column the publish path enforces:
 * `provenance = 'test'` cannot reach a post, and `bedPermitted` says so by
 * name.
 *
 * With that gate in place a fixture library is the thing that lets the whole
 * audio pipeline be exercised — mixing, ducking, loudness, selection,
 * repetition avoidance, SFX placement — without inventing a licence.
 *
 * ## What these are
 *
 * Synthesised with FFmpeg from sine and noise sources. They are deliberately
 * plain: nobody should ever be tempted to publish one, and if somebody
 * removes the gate the audio itself should give it away. Every title starts
 * with `[TEST]`.
 *
 * ## What they are not
 *
 * Not licensed music. Not a substitute for buying any. The operator action is
 * unchanged and is recorded in `docs/CREATIVE_SYSTEM.md`.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';

const run = promisify(execFile);

interface FixtureBed {
  key: string;
  title: string;
  mood: string;
  energy: number;
  bpm: number;
  genre: string;
  hasVocals: boolean;
  seconds: number;
  /** The FFmpeg filter that makes it. Deterministic, so re-running is a no-op. */
  filter: string;
}

/*
 * Six beds spanning the mood and tempo space the director scores against, so
 * every branch of the selection has something to choose between. Without a
 * spread the "chose this because" output is meaningless — one candidate always
 * wins.
 */
const BEDS: FixtureBed[] = [
  { key: 'calm-slow', title: '[TEST] Still Kitchen', mood: 'calm', energy: 0.2, bpm: 72,
    genre: 'ambient', hasVocals: false, seconds: 90,
    filter: 'sine=frequency=196:duration=90,volume=0.25,atempo=1.0' },
  { key: 'warm-mid', title: '[TEST] Warm Counter', mood: 'warm', energy: 0.42, bpm: 96,
    genre: 'acoustic', hasVocals: false, seconds: 90,
    filter: 'sine=frequency=262:duration=90,volume=0.25,tremolo=f=1.6:d=0.3' },
  { key: 'bright-mid', title: '[TEST] Bright Prep', mood: 'bright', energy: 0.6, bpm: 112,
    genre: 'pop', hasVocals: false, seconds: 90,
    filter: 'sine=frequency=330:duration=90,volume=0.25,tremolo=f=2.4:d=0.4' },
  { key: 'playful-fast', title: '[TEST] Quick Hands', mood: 'playful', energy: 0.78, bpm: 128,
    genre: 'electronic', hasVocals: false, seconds: 90,
    filter: 'sine=frequency=392:duration=90,volume=0.25,tremolo=f=3.2:d=0.5' },
  { key: 'tense-fast', title: '[TEST] Under Pressure', mood: 'tense', energy: 0.88, bpm: 140,
    genre: 'electronic', hasVocals: false, seconds: 90,
    filter: 'sine=frequency=147:duration=90,volume=0.3,tremolo=f=4.5:d=0.6' },
  /* One vocal bed, so the "vocals under narration" penalty has something to
     penalise. Voiced with a second tone rather than a voice, but flagged. */
  { key: 'warm-vocal', title: '[TEST] Hummed Along (vocal)', mood: 'warm', energy: 0.45, bpm: 100,
    genre: 'acoustic', hasVocals: true, seconds: 90,
    filter: 'sine=frequency=294:duration=90,volume=0.25,vibrato=f=5:d=0.5' },
];

interface FixtureSfx {
  key: string;
  title: string;
  role: string;
  seconds: number;
  peakDb: number;
  filter: string;
}

const EFFECTS: FixtureSfx[] = [
  { key: 'whoosh', title: '[TEST] Whoosh', role: 'transition', seconds: 0.45, peakDb: -20,
    filter: 'anoisesrc=d=0.45:c=pink:a=0.4,highpass=f=400,volume=0.6' },
  { key: 'impact', title: '[TEST] Soft Impact', role: 'impact', seconds: 0.3, peakDb: -16,
    filter: 'sine=frequency=80:duration=0.3,volume=0.7' },
  { key: 'tick', title: '[TEST] Tick', role: 'accent', seconds: 0.12, peakDb: -22,
    filter: 'sine=frequency=1200:duration=0.12,volume=0.4' },
  { key: 'tap', title: '[TEST] UI Tap', role: 'ui', seconds: 0.1, peakDb: -20,
    filter: 'sine=frequency=880:duration=0.1,volume=0.35' },
];

async function synthesise(filter: string, out: string): Promise<Buffer> {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', filter,
    '-c:a', 'libmp3lame', '-b:a', '128k', out,
  ]);
  return readFile(out);
}

async function main(): Promise<void> {
  const productId = process.env.FIXTURE_PRODUCT_ID ?? 'recipefix';
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
  const work = await mkdtemp(path.join(tmpdir(), 'halyard-fixtures-'));

  try {
    for (const b of BEDS) {
      const file = path.join(work, `${b.key}.mp3`);
      const bytes = await synthesise(b.filter, file);
      const storagePath = `fixtures/audio/${b.key}.mp3`;

      const { rows: asset } = await pool.query<{ id: string }>(
        `insert into assets (product_id, kind, mime_type, storage_path, public_url, tags, caption)
         values ($1,'audio','audio/mpeg',$2,$2,array['music_bed','fixture'],$3)
         on conflict do nothing
         returning id`,
        [productId, storagePath, `${b.title} — synthesised test fixture, not licensed music`],
      );
      let assetId = asset[0]?.id;
      if (!assetId) {
        const { rows } = await pool.query<{ id: string }>(
          'select id from assets where storage_path = $1 limit 1',
          [storagePath],
        );
        assetId = rows[0]?.id;
      }
      if (!assetId) continue;

      await pool.query(
        `insert into music_beds
           (product_id, asset_id, title, mood, energy, bpm, genre, duration_seconds,
            loopable, licence, licensor, provenance, source, has_vocals,
            attribution_required, platform_restrictions)
         values ($1,$2,$3,$4,$5,$6,$7,$8,true,
                 'Synthesised test fixture — NOT a licence','Halyard fixtures','test',
                 'scripts/seed-audio-fixtures.ts',$9,false,'{}')
         on conflict do nothing`,
        [productId, assetId, b.title, b.mood, b.energy, b.bpm, b.genre, b.seconds, b.hasVocals],
      );
      console.log(`bed  ${b.title} (${bytes.byteLength} bytes)`);
    }

    for (const e of EFFECTS) {
      const file = path.join(work, `${e.key}.mp3`);
      const bytes = await synthesise(e.filter, file);
      const storagePath = `fixtures/audio/sfx-${e.key}.mp3`;

      const { rows: asset } = await pool.query<{ id: string }>(
        `insert into assets (product_id, kind, mime_type, storage_path, public_url, tags, caption)
         values ($1,'audio','audio/mpeg',$2,$2,array['sfx','fixture'],$3)
         on conflict do nothing returning id`,
        [productId, storagePath, `${e.title} — synthesised test fixture, not licensed audio`],
      );
      let assetId = asset[0]?.id;
      if (!assetId) {
        const { rows } = await pool.query<{ id: string }>(
          'select id from assets where storage_path = $1 limit 1',
          [storagePath],
        );
        assetId = rows[0]?.id;
      }
      if (!assetId) continue;

      await pool.query(
        `insert into sound_effects
           (product_id, asset_id, title, role, duration_seconds, peak_db,
            licence, licensor, provenance, source, attribution_required)
         values ($1,$2,$3,$4,$5,$6,
                 'Synthesised test fixture — NOT a licence','Halyard fixtures','test',
                 'scripts/seed-audio-fixtures.ts',false)
         on conflict do nothing`,
        [productId, assetId, e.title, e.role, e.seconds, e.peakDb],
      );
      console.log(`sfx  ${e.title} (${bytes.byteLength} bytes)`);
    }

    const { rows } = await pool.query<{ provenance: string; n: string }>(
      `select provenance, count(*)::text as n from music_beds group by provenance`,
    );
    console.log('music_beds by provenance:', rows.map((r) => `${r.provenance}=${r.n}`).join(' '));
  } finally {
    await rm(work, { recursive: true, force: true });
    await pool.end();
  }
}

void main();
