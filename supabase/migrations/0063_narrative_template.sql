-- §308. The composition `history`, `tips`, `myth_fact` and `origin` run through.
--
-- All four declare `short_video` and none had a composition, so they rendered
-- as cards — which is what "the videos look like slideshows" meant. They differ
-- in what their beats mean rather than in how a beat is drawn, so they share
-- one composition and each supplies its own mapping from slots to beat roles.
insert into templates (id, product_id, renderer, format, aspect_ratio, description, enabled)
values ('Narrative', 'recipefix', 'remotion', 'video', '9:16',
        'Beats with roles, each drawn by a treatment that has not been used lately', true)
on conflict (id) do nothing;
