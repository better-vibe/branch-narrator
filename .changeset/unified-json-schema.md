---
"@better-vibe/branch-narrator": minor
---

BREAKING CHANGE: Unified dump-diff JSON schema to v2.0

- All `dump-diff --format json` output now uses schema v2.0 regardless of flags
- Removed legacy v1.1 schema (used for default full-diff mode)
- All modes (--name-only, --stat, --patch-for, default) now share the same structure
- New schema includes: command metadata, git context with isDirty, options including includeUntracked
- Files now use `patch.text` for raw diff content (instead of `diff` field)
- Hunks are only included in `patch.hunks` when using --patch-for
- Skip reasons now in `skippedFiles` array (was `skipped`)
- Summary counts now in `summary` object (was `stats`)

Migration:
- Update JSON parsing to expect `schemaVersion: "2.0"`
- Access diff content via `files[].patch.text` instead of `files[].diff` or `included[].diff`
- Access skipped files via `skippedFiles` instead of `skipped`
- Access counts via `summary` instead of `stats`

