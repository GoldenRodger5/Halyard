-- §430. Two more pin shapes.
--
-- `VARIETY_BY_POST_TYPE.md` §3.2: Pinterest "gets its own aspect and one
-- template today", and one shape repeated is the whole feed on a surface where
-- a user sees a grid of cards at once. `pinterest_tall` plus these two is
-- enough range that an account does not read as a single advertiser.
--
-- They are different *moves*, not rearrangements. `pinterest_tall` leads with a
-- title and supports it with bullets; `pin_stack` **is** the list, numbered,
-- because a reader saves a pin to come back to a sequence; `pin_quote` is one
-- line at size, and it is the pin that can stand on a photograph — the same
-- density rule §422 settled for the stills.
--
-- Enabled on insert. A template registered but switched off is unreachable, and
-- §395 already recorded what happens then: four still templates sat behind an
-- operator toggle nobody knew to flip.
insert into templates (id, renderer, aspect_ratio, format, enabled, product_id)
values
  ('pin_stack', 'satori', '2:3', 'pin', true, null),
  ('pin_quote', 'satori', '2:3', 'pin', true, null)
on conflict (id) do nothing;

comment on table templates is
  'Renderable templates by format. §430 added pin_stack and pin_quote so '
  'Pinterest has range; a template row that exists and is disabled is a '
  'template nothing can pick.';
