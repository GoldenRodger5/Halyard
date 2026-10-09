# V2 current Content Rewards contracts

Current first-party public client bundle observed 2026-10-09 exposes GET `/api/campaign/campaigns/:id`, `/api/campaign/campaigns/applications/me`, `/api/campaign/campaigns/:id/feature-flags`, `/api/user/users/me`, `/api/user/social-media-accounts`. Join is POST `/api/campaign/campaigns/:id/join`; application is a separate POST `/api/campaign/campaigns/:id/apply`. Application status in the creator UI is pending/approved/rejected/withdrawn. None of this establishes brand draft approval or exact social-account eligibility.

The bridge diagnostic action `inspect_contract` performs only the five fixed GETs, bounded by response bytes, same-origin redirects and elapsed time. It exposes field paths/types and target-presence booleans, never raw response values, cookies or credentials. Its result always remains UNKNOWN. A 200, field presence, or client-bundle endpoint is not authenticated enrollment proof. No new mutation endpoint is enabled until actual authenticated schema and idempotent readback are demonstrated.

Verification: 28 focused bridge tests; web typecheck; affected eslint; diff check. Primary checkout and existing Halyard worker untouched.
