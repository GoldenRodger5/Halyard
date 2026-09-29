# MomentCircuit rejection handling

Canonical production rule:

1. A rejection is evidence, not an endpoint.
2. Classify the failure as INFRASTRUCTURE, GENERATION_SYSTEMIC, SOURCE_IDENTITY, COMPLIANCE, or CREATIVE_LOCAL.
3. For systemic failures, fix the root generator/renderer/source/QC mechanism first so future outputs improve by default.
4. Then apply a targeted repair to the rejected clip using the exact AI defect evidence and timestamps.
5. Rerender the exact final and run the full AI visual rewatch again.
6. Only CREATIVE_LOCAL failures consume the two-strike creative repair budget. Infrastructure/systemic failures never force a good moment to be replaced.
7. After two CREATIVE_LOCAL repair failures, replace the moment rather than endlessly patching it.

This policy is also enforced in Supabase by `momentcircuit_rejection_policy` and AI QC failure scopes.
