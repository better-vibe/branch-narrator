---
"@better-vibe/branch-narrator": minor
---

Improve pr-body and pretty output for human readability

- Add no-changes short-circuit: both renderers return a single "No changes detected" line when the diff is empty with no findings
- Promote dependency change summaries to primary output area (before test plan) with concise overview showing counts by prod/dev, major updates, and new/removed packages
- Trim impact analysis in pr-body details: only show high/medium blast radius (skip low), cap entries at 5 with 3 dependents each
- Omit Notes section when risk is low with no evidence bullets (reduces noise)
- Full dependency tables remain available in the Details block for reviewers who want version details
