---
"@better-vibe/branch-narrator": minor
---

Add agent-grade structured output to dump-diff command

Implement RFC Issue #4 upgrades for dump-diff command:

- **New JSON schema v1.0**: Structured diff output with hunks, lines, and metadata
- **Selective retrieval modes**:
  - `--name-only`: List changed files only (no diff content)
  - `--stat`: Show file statistics (additions/deletions)
  - `--patch-for <path>`: Get diff for a single file (supports renamed files)
- **Enhanced exclusion reporting**: Excluded files appear in `skippedFiles` with reasons
- **Deterministic output**: Files and skippedFiles sorted alphabetically
- **Agent-friendly**: JSON-only stdout in JSON mode, all metadata included

This enables AI agents to efficiently retrieve diffs in stages: first get the file list, then fetch only relevant diffs.
