-- §536. The story channel gets something to render.
--
-- `story` is a declared post type with two formats mapped to it (`poll` and
-- `behind`), a resolver that routes them correctly, and `media: 'image'`. The
-- only image path in `generate.ts` is gated on the still being *about the
-- product*, and neither story format is — so a poll wrote a caption, queued no
-- render, and produced an Instagram story with nothing to show. A whole channel
-- that could be chosen and could never be published.
--
-- Product-neutral like §518's four: the card is built from the format's own
-- written slots, not from a recipe, so nothing about it belongs to RecipeFix.

insert into templates (id, product_id, renderer, format, aspect_ratio, description, enabled)
values (
  'story_card',
  null,
  'satori',
  'story',
  '9:16',
  'A vertical story card: one question set large, optionally over the piece''s photograph, with two tappable halves when the format is a poll.',
  true
)
on conflict (id) do update
  set enabled = true,
      product_id = null,
      aspect_ratio = '9:16',
      format = 'story';
