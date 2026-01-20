---
"@better-vibe/branch-narrator": patch
---

Improve test analyzer to differentiate between added, modified, and deleted test files.

- `TestChangeFinding` now includes `added`, `modified`, and `deleted` arrays for granular status tracking
- Highlights show test file counts by status (e.g., "Test files: 2 added, 1 modified")
- Markdown test plan includes counts of new and updated test files
