/**
 * §492. The columns this build reads that a database might not have.
 *
 * `/settings/health` shows the build; nothing showed the schema. Production
 * ran a build that read `renders.treatment` against a database that stopped
 * one migration short of it, and every gallery visit was a 500 with a digest
 * nobody could read (§489). Migrations are additive and the deploy doc says
 * never to deploy ahead of them — and the only thing enforcing that was a
 * person remembering.
 *
 * This is the short list of columns added recently enough that a database
 * could plausibly lack them, each with the migration that adds it. The
 * readiness page asks `information_schema` for them and turns an absence into
 * a red row that names the file to apply. A test keeps each entry honest
 * against the migration it claims.
 *
 * Add a row here whenever a migration adds a column the web or worker reads
 * on a hot path. Remove rows once a migration is old enough that no deployed
 * database could predate it.
 */
export interface SchemaExpectation {
  table: string;
  column: string;
  /** The migration file that adds it, by its four-digit prefix. */
  migration: string;
  /** Who reads it, so the row says what breaks. */
  readBy: string;
}

export const SCHEMA_EXPECTATIONS: readonly SchemaExpectation[] = [
  { table: 'content_items', column: 'screenplay', migration: '0068', readBy: 'the gallery and the render' },
  { table: 'renders', column: 'treatment', migration: '0071', readBy: 'the gallery wall and treatment recency' },
  { table: 'assets', column: 'shot', migration: '0072', readBy: 'shot rotation for generated images' },
  { table: 'assets', column: 'subject', migration: '0073', readBy: 'the coherence gate' },
  { table: 'content_items', column: 'caption_shape', migration: '0074', readBy: 'caption-shape rotation' },
];

/** The expectations a database does not meet, given the columns it reports. */
export function missingSchema(
  present: ReadonlyArray<{ table: string; column: string }>,
): SchemaExpectation[] {
  const have = new Set(present.map((p) => `${p.table}.${p.column}`));
  return SCHEMA_EXPECTATIONS.filter((e) => !have.has(`${e.table}.${e.column}`));
}
