/*
 * §377. How much of what the operator said survived into the draft.
 *
 * `opinionPreserved` was written to catch a draft that "sanded the opinion
 * off" and was called by nothing, so a Daily Take could come back fluent,
 * verified and entirely generic, and nothing would say so. That is the one
 * failure this whole path exists to prevent: the point of a Take is that it is
 * the operator's, and a laundered opinion is worse than no post because it
 * publishes under their name.
 *
 * Recorded rather than enforced. A low overlap is a reason to look, not proof
 * of a problem — a short input rephrased well can score low honestly, and
 * refusing on it would block the good case in order to catch the bad one.
 */
alter table takes add column if not exists opinion_overlap numeric;
alter table takes add column if not exists opinion_note text;
