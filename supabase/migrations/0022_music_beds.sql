/*
 * Music beds, and the rotation that keeps them from repeating.
 *
 * ElevenLabs Music is not licensed for advertising, and Halyard's entire output
 * is product marketing, so generated beds are off. Beds come instead from audio
 * the operator owns and drops into the asset library, tagged `music_bed`.
 *
 * `last_used_at` exists so selection can rotate least-recently-used. Sixty
 * posts a month over a handful of beds is very noticeable, and the same bed
 * twice in a row is the first thing a viewer registers. Random selection
 * collides more often than people expect; least-recently-used cannot.
 *
 * Nullable, because a bed that has never been used is exactly the one that
 * should go next — `nulls first` in the ordering is doing real work.
 */
alter table assets add column if not exists last_used_at timestamptz;

comment on column assets.last_used_at is
  'When this asset was last selected for a post. Drives least-recently-used rotation for music beds.';

/*
 * The lookup is "audio, for this product, tagged as a bed, least recently
 * used" — a tag membership test, so GIN on tags rather than a btree.
 */
create index if not exists assets_audio_tags_idx
  on assets using gin (tags)
  where kind = 'audio';
