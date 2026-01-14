---
"@better-vibe/branch-narrator": major
---

BREAKING: risk-report schema v2 (derived flags, deterministic traceability)

- `risk-report` now outputs `schemaVersion: "2.0"` and all flags include deterministic `flagId` plus `relatedFindingIds` links to the triggering findings.
- `RiskFlag` now requires `ruleKey`, `flagId`, and non-empty `relatedFindingIds` (legacy `id` field removed).
- Legacy risk detector implementation under `src/commands/risk/detectors/` has been removed; flags are derived from analyzer findings via `findingsToFlags()`.
