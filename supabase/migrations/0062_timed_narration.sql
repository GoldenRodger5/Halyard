-- §306. A narration that lands on the beat, rather than read straight through.
--
-- `vo_script` is one block of prose and `tts` reads it continuously, which is
-- right for a transformation video and wrong for anything with a pause in it.
-- A quiz holds a three-second countdown; a narrator reading straight through
-- answers during it, which removes the only thing the viewer was doing.
--
-- So a piece whose composition has beats carries the lines *with the second
-- each one belongs at*, and the synthesiser places them instead of running
-- them together. Null for everything that came before, which keeps reading
-- `vo_script` exactly as it did.
alter table content_items add column vo_lines jsonb;

comment on column content_items.vo_lines is
  'Timed narration: [{atSeconds, text}], derived from the same slots the video '
  'is built from so the voice cannot say something the screen does not show. '
  'Null means read vo_script straight through, which is the older behaviour.';
