# Render timings

Measured on the worker container. These decide whether the three-to-five
videos-per-week cadence is achievable, so they are recorded rather than
estimated.

| Composition | Seconds | Render time | Size | Visual QC |
|---|---|---|---|---|
| `TransformationDiff` | 28 | 26.5s | 1.6 MB | pass |
| `SubstitutionExplainer` | 32 | 25.1s | 1.5 MB | pass |
| `ScalingMath` | 24 | 18.4s | 1.2 MB | pass |
| `ChefNoteCard` | 16 | 12.6s | 0.8 MB | pass |

Rendered 4 compositions at concurrency 3.
