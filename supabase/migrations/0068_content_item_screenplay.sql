/*
 * §372. The screenplay a piece was staged from.
 *
 * `writeScreenplay` has existed since §335 and ran only from a script, so every
 * screenplay this system produced was written for a preview and thrown away.
 * Now a production stages the piece, and the staging has to survive the job
 * that made it: the TTS handler needs the bed mood a scene asked for, the
 * renderer needs the moves, and an operator reviewing a finished piece should
 * be able to read what it was supposed to be.
 *
 * Nullable, and staying that way. A caption has no scenes, a still image has
 * none, and a run whose screenwriter was unavailable makes the piece the way it
 * was made before this column existed. Null means "not staged", which is a
 * different fact from an empty scene list and is the one that is actually true.
 */
alter table content_items add column if not exists screenplay jsonb;
