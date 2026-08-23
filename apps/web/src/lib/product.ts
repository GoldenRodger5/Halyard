/**
 * Which product the dashboard is currently showing.
 *
 * §172. This lives here rather than beside the route handler that writes it,
 * because a Next route file may only export route fields — `GET`, `dynamic`,
 * `revalidate` and friends. Exporting a constant from one typechecks cleanly and
 * fails the production build with "not a valid Route export field", which is a
 * good example of why `next build` is part of verification and `tsc` alone is not.
 */
export const PRODUCT_COOKIE = 'halyard_product';
