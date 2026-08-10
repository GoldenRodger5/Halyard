/**
 * Fixture file of known-bad LLM copy. Build pack §6 requires that every entry
 * here fails the slop filter. If a new generation model starts producing a tell
 * this file does not contain, add it here first and then make it fail.
 *
 * Each entry names the rule it is primarily there to exercise, so a regression
 * points at a specific rule rather than "something broke".
 */

import type { SlopPlatform } from '../slopFilter.js';

export interface BadCopyFixture {
  name: string;
  body: string;
  platform: SlopPlatform;
  hashtags?: string[];
  /** The rule id that must appear among the errors. */
  expectRule: string;
}

export const KNOWN_BAD_COPY: BadCopyFixture[] = [
  {
    name: 'em dash',
    expectRule: 'punctuation.em_dash',
    platform: 'x',
    body: 'Gluten-free bread needs vinegar — the acid does what gluten cannot.',
  },
  {
    name: 'en dash used as a prose dash',
    expectRule: 'punctuation.en_dash_in_prose',
    platform: 'x',
    body: 'The crumb was gummy – too much starch, not enough structure.',
  },
  {
    name: 'ellipsis character',
    expectRule: 'punctuation.ellipsis_char',
    platform: 'x',
    body: 'We tested it three ways… and one of them worked.',
  },
  {
    name: 'curly quotes',
    expectRule: 'punctuation.curly_quotes',
    platform: 'x',
    body: 'She called it “the gummy problem” and she was right.',
  },
  {
    name: 'not just X, it is Y',
    expectRule: 'construction.not_just_but',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'breadmaking'],
    body: "It's not just a swap, it's a rebuild of the whole crumb structure.",
  },
  {
    name: 'lets dive in',
    expectRule: 'phrase.banned',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'breadmaking'],
    body: "Gluten-free bread is hard. Let's dive in to why the crumb collapses.",
  },
  {
    name: 'in todays fast-paced world',
    expectRule: 'phrase.banned',
    platform: 'threads',
    body: "In today's fast-paced world, dinner has to be quick.",
  },
  {
    name: 'game changer',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'One teaspoon of vinegar is a game changer for gluten-free loaves.',
  },
  {
    name: 'unlock and elevate',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'Unlock better texture and elevate your bakes.',
  },
  {
    name: 'the secret to',
    expectRule: 'phrase.banned',
    platform: 'tiktok',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body: 'The secret to gluten-free bread is not more flour.',
  },
  {
    name: 'heres the thing',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: "Here's the thing about starch. It holds water but not structure.",
  },
  {
    name: 'whether youre X or Y',
    expectRule: 'construction.whether_youre',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body: "Whether you're new to gluten-free or ten years in, the crumb is the hard part.",
  },
  {
    name: 'thats where product comes in',
    expectRule: 'construction.thats_where_x_comes_in',
    platform: 'x',
    body: "Scaling a recipe is not multiplication. That's where RecipeFix comes in.",
  },
  {
    name: 'seamlessly and effortlessly',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'It seamlessly adapts any recipe.',
  },
  {
    name: 'leverage and utilize',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'Leverage acidity to firm the crumb.',
  },
  {
    name: 'delve',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'Let us delve into the chemistry of starch gelatinisation.',
  },
  {
    name: 'tapestry',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'Baking is a tapestry of chemistry and patience.',
  },
  {
    name: 'testament to',
    expectRule: 'phrase.banned',
    platform: 'x',
    body: 'This loaf is a testament to what acid can do.',
  },
  {
    name: 'rocket emoji',
    expectRule: 'emoji.banned',
    platform: 'x',
    body: 'Shipped a new adaptation engine today. 🚀',
  },
  {
    name: 'emoji spray',
    expectRule: 'emoji.too_many',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body: 'New loaf 🍞 new crumb 😍 same oven 🔥',
  },
  {
    name: 'three consecutive sentences opening with the same word',
    expectRule: 'structure.anaphora',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body: 'This is the crumb. This is the reason it works. This is what changed.',
  },
  {
    name: 'uniform sentence rhythm',
    expectRule: 'structure.uniform_rhythm',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body:
      'The oven runs hotter than the recipe says here. ' +
      'The flour absorbs water faster than wheat does. ' +
      'The crumb sets before the centre has fully cooked. ' +
      'The result is a loaf that looks done outside.',
  },
  {
    name: 'opening line too long',
    expectRule: 'structure.opening_line',
    platform: 'x',
    body:
      'When you are baking a gluten-free loaf at home in a standard domestic oven with ordinary flour, several things go wrong at once.',
  },
  {
    name: 'question spray',
    expectRule: 'structure.question_density',
    platform: 'x',
    body: 'Gummy crumb? Flat loaf? Wet centre? Sound familiar? It usually is.',
  },
  {
    name: 'adjective stacking',
    expectRule: 'structure.adjective_stacking',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body: 'A delicious, tender, perfectly-seasoned result every time.',
  },
  {
    name: 'rule of three used twice',
    expectRule: 'structure.rule_of_three',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body:
      'Swap the flour, drop the heat, add the acid. ' +
      'You get structure, colour, and a crumb that holds.',
  },
  {
    name: 'too many hashtags for X',
    expectRule: 'hashtags.too_many',
    platform: 'x',
    hashtags: ['glutenfree', 'baking', 'bread', 'recipes'],
    body: 'Vinegar firms a gluten-free crumb. One teaspoon per loaf.',
  },
  {
    name: 'hashtags on Pinterest',
    expectRule: 'hashtags.too_many',
    platform: 'pinterest',
    hashtags: ['glutenfree'],
    body: 'Gluten-free sandwich loaf that holds its shape.',
  },
  {
    name: 'nutrition accuracy claim',
    expectRule: 'hard_block.nutrition_accuracy',
    platform: 'x',
    body: 'Every adaptation comes with verified nutrition for the finished dish.',
  },
  {
    name: 'perfect 1:1 substitution',
    expectRule: 'hard_block.one_to_one',
    platform: 'x',
    body: 'Almond flour is a perfect 1:1 swap for wheat flour.',
  },
  {
    name: 'allergy safety guarantee',
    expectRule: 'hard_block.medical_guarantee',
    platform: 'x',
    body: 'Every adapted recipe is safe for celiacs.',
  },
  {
    name: 'competitor named',
    expectRule: 'hard_block.competitor',
    platform: 'x',
    body: 'It handles substitutions better than Paprika does.',
  },
  {
    name: 'one sentence far too long, hidden behind a short hook',
    expectRule: 'structure.sentence_too_long',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body:
      'Gummy centre? ' +
      'The reason a gluten-free loaf reads as underbaked in the middle is that rice and tapioca starches hold considerably more water than wheat flour does at the same hydration percentage. ' +
      'Dropping the oven temperature by twenty five degrees and extending the bake by roughly twelve minutes gives the starch time to set through the centre before the crust colours too far.',
  },
  {
    name: 'every sentence long, so the average blows the ceiling',
    expectRule: 'structure.sentence_length',
    platform: 'instagram',
    hashtags: ['glutenfree', 'baking', 'bread'],
    body:
      'Rice and tapioca starches hold considerably more water than wheat flour does at the very same hydration percentage inside an ordinary home oven. ' +
      'The centre of the finished loaf therefore reads as underbaked to the eye while the crust surrounding it has already set completely hard. ' +
      'Dropping the oven by a full twenty five degrees and then adding twelve extra minutes gives the starch enough time to finish setting through.'
  },
];

/**
 * Copy that must PASS. A filter that rejects everything is as useless as one
 * that rejects nothing, and these guard the false-positive direction.
 */
export const KNOWN_GOOD_COPY: Array<{
  name: string;
  body: string;
  platform: SlopPlatform;
  hashtags?: string[];
}> = [
  {
    name: 'plain X post, no link, short hook',
    platform: 'x',
    body:
      'Your gluten-free loaf is gummy. The starch holds water wheat would have released. Drop the oven 25 degrees and bake it longer.',
  },
  {
    name: 'instagram carousel caption',
    platform: 'instagram',
    hashtags: ['glutenfree', 'breadbaking', 'recipeswap'],
    body:
      'Gummy crumb, every time. We ran an artisan loaf through a gluten-free adaptation and the model added apple cider vinegar nobody asked for. The acid firms the protein network that gluten would normally build. Oven came down from 475 to 450 because gluten-free browns faster than it sets.',
  },
  {
    name: 'pinterest pin, no hashtags',
    platform: 'pinterest',
    body: 'Gluten-free sandwich loaf that holds its shape. Vinegar in the dough, lower oven, longer bake.',
  },
  {
    name: 'numeric range with an en dash is fine',
    platform: 'x',
    body: 'Rest the loaf 45–60 minutes before slicing. Cutting hot bread is what makes it gummy.',
  },
  {
    name: 'one meaningful emoji',
    platform: 'threads',
    body: 'Third loaf this week 🍞 Only the vinegar version held its shape.',
  },
  {
    name: 'apostrophes are not curly quotes',
    platform: 'x',
    body: "Don't slice it hot. That's most of the gummy problem right there.",
  },
];
