---
"@better-vibe/branch-narrator": minor
---

Enhanced facts command with new features inspired by dump-diff

- Added `--out <path>` option to write JSON output to file instead of stdout
- Added `--format <type>` option with 'json' (default) and 'compact' formats
- Added `--dry-run` option to preview analysis without generating full output
- Enhanced JSON output schema with metadata: schemaVersion, mode, base/head refs, and stats object containing totalFindings and findingsByType breakdown
- Extracted `aggregateFindingsByType()` utility function to eliminate code duplication
- Maintained backward compatibility with legacy JSON format
