# idea_generator.v1

Daily. Proposes angles worth writing, not posts.

## Inputs

- product brief summary
- brand voice summary
- unconsumed signals (product activity, changelog, editorial backlog, seasonal,
  trend, performance)
- last 60 days of titles, for the novelty check
- top historical performers
- content mix: target vs actual over 21 days

## What makes an idea good

Specific, grounded in something the product actually produced, counterintuitive
or solving a problem the reader already has, and renderable with an enabled
template.

## What makes an idea bad

Generic advice, a listicle, product promotion wearing an educational hat, or
anything posted in the last sixty days.

## Scoring

The model proposes; `scoreIdeas()` scores. Mix debt is weighted highest at cold
start (0.25) and historical performance lowest (0.10), rising to 0.40 once there
are roughly twenty posts in a category. The UI states that the weights are
hand-set rather than rendering a confident chart over n=3.

## Changelog

- **v1** — initial.
