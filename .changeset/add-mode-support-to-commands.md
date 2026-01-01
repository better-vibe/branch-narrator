---
"@better-vibe/branch-narrator": minor
---

Add mode support to facts and risk-report commands

Both commands now support `--mode` option with `branch|unstaged|staged|all` modes, enabling analysis of working tree changes in addition to branch comparisons. The `--base` and `--head` options are now only used in branch mode.
