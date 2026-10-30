# Phase 2B integration provenance

All new worktrees were created with Git on verified encrypted T9, from exact PR118 head `fbcc2b15a17178dc05598a864bfa7e3e22c1508f`. The fetched active marketing branch was `954c5463b4d03645a4b01f831daa471acd5c42cb`. Phase2B draft PRs target PR118's branch `feat/recipefix-phase2-integration-20261029` while that earlier work remains unmerged. This avoids bulk-merging historical experiments into the active lane. No PR was merged.

| Workstream | Branch / draft PR | Exact focused source commits |
| --- | --- | --- |
| A picture |`feat/recipefix-phase2b-edit-20261029` / [PR121](https://github.com/GoldenRodger5/Halyard/pull/121) |`108cbdb48eb93c99d3bff871598defcf291f8bda`, receipt-only `5e5d611e351f7797cb6061805eb28da1bb36b670` |
| A2 audio |`feat/recipefix-phase2b-audio-20261029` / [PR122](https://github.com/GoldenRodger5/Halyard/pull/122) |`fcb80bb`, source-pin metadata `2fbfb25` |
| B editorial / C held R&D / independent film critique |`feat/recipefix-phase2b-editorial-20261029` / [PR119](https://github.com/GoldenRodger5/Halyard/pull/119) |`db380c6a8033d295d9eedc228d91a217ee1159fc`, initial picture critique `e8c2edd`, corrected picture `242bbf2`, final mixed-export critique `8b8abb970c8f807fcbddbdd0cb90f261e1b7f071` |
| Root D / integration |`feat/recipefix-phase2b-integration-20261029` |Focused specialist commits cherry-picked individually, plus only new `packages/marketing/phase2b/**` gallery/receipts/readiness/calendar/report. See root draft PR and Git history for final head. |

Root cherry-pick map before its final gallery/document commit: B/C `f7439f6`, first critique `c16ac6e`, corrected picture critique `55a3fd3`, final-mix critique `e8ff4b2`, A picture `023bb71`, A receipt `43c2b76`, A2 media `db81b0e`, A2 source pin `0d32047`. Media hashes are preserved exactly across all cherry-picks.

The four worktrees are named `halyard-recipefix-phase2b-{edit,audio,editorial,integration}-20261029` under `/Volumes/T9/Developer/Worktrees/`. Existing older worktrees, primary Git object store, prior PRs, original source/media and dirty user source checkouts were preserved. Known dependency symlinks remain untracked; no dependency install or relocation was performed. All substantial new output/evidence is under `/Volumes/T9/Developer/Builds/recipefix-phase2b-20261029/`.
