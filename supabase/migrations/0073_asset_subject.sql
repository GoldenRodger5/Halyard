-- §409. What a generated image was asked to be a photograph of.
--
-- `assets.shot` (0072) records *how* a picture was taken. Nothing recorded
-- *what it was meant to show*, and that is the only honest oracle for the
-- question an operator actually asks: does the picture make sense with the
-- piece?
--
-- It cannot be answered by comparing the depicted subject against the script. A
-- post about gluten illustrated with a loaf of bread is the job done correctly,
-- and a term comparison calls it a mismatch. But Halyard *chose* the subject and
-- sent it to an image model, so "what was this frame supposed to show" is known
-- exactly rather than inferred — and a describer reporting something unrelated
-- to what was requested is a real, checkable defect.
--
-- The failure this exists to catch: a `history` piece about the origins of
-- sourdough rendered the artifact's beats (§406), so the frames were a plate of
-- teriyaki tofu over a voiceover about ancient Egypt, and the coherence gate
-- reported "coherent, 2 notes across 6 frames".
--
-- Nullable: an asset that was captured or uploaded was never asked to be
-- anything, and a generated one from before this genuinely does not know.
alter table assets add column if not exists subject text;

comment on column assets.subject is
  '§409. What this generated image was asked to be a photograph of, in the '
  'words sent to the image model. Read back by review_media as the oracle for '
  'whether the frames show what the piece asked for. Null for captures, '
  'uploads, and anything generated before §409.';
