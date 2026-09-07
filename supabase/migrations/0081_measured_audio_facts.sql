-- §554. "Instrumental" was a default, not a measurement.
--
-- `music_beds.has_vocals` is `not null default false`, and `import-music.ts`
-- wrote `entry.hasVocals ?? false` from a manifest that never set it. So every
-- bed in the library asserts it has no vocals because **nobody listened**, and
-- the music director reports that to the operator in as many words:
--
--     "instrumental, so it does not fight the voice"
--
-- The director is not at fault; it is written for three states and reads them
-- correctly. `bed.hasVocals === true` is penalised 2.5, an explicit `false`
-- earns the line above, and `undefined` does neither — it neither credits nor
-- punishes something nobody has checked. The column could not express the
-- third state, so a default became a finding.
--
-- Gotcha 9, one table along: null means unmeasured, false means measured false,
-- and a claim about the world needs an observation behind it.
--
-- Existing rows are set to null rather than kept: not one of them was measured,
-- so `false` is the wrong answer for every single one. `import-music.ts` now
-- transcribes each file and writes a real boolean.

alter table music_beds alter column has_vocals drop not null;
alter table music_beds alter column has_vocals drop default;

update music_beds set has_vocals = null;

comment on column music_beds.has_vocals is
  'True when a transcription found words, false when it found none, NULL when nobody has listened. The director treats NULL as unknown and neither credits nor penalises it — a default of false would tell the operator a bed is instrumental on no evidence.';

-- `energy` has the same shape of problem and is not fixed here: it is
-- `not null` and every bed carries the constant its search bucket declared,
-- so two beds found under "warm" have identical energy whatever they sound
-- like. Left alone deliberately — a nullable energy would change how the
-- director scores every bed, and that wants its own change with its own
-- measurement behind it.
