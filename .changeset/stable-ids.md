---
"@better-vibe/branch-narrator": major
---

BREAKING: Add stable IDs to findings and risk flags for deterministic references

- All findings now include an optional `findingId` field (format: "finding.<type>#<hash>")
- Risk flags now include `flagId`, `ruleKey`, and `relatedFindingIds` fields
- New finding types added to support risk detection patterns
- Facts builder automatically assigns findingIds to all findings
