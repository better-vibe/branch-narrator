---
"branch-narrator": minor
---

CLI Command Cohesion Improvements

## Breaking Changes

- **pr-body**: The `--uncommitted` flag is now deprecated. Use `--mode unstaged` instead.
- **dump-diff**, **risk-report**: JSON output now defaults to compact format. Use `--pretty` for indented output.

## New Features

- **pr-body**: Added `--mode` option (branch|unstaged|staged|all) for consistency with other commands.
- **facts**: Added `--out` option to write output to a file instead of stdout.
- **dump-diff**, **risk-report**: Added `--pretty` option for formatted JSON output (default: compact).
- **dump-diff**, **risk-report**, **facts**: Added `--no-timestamp` option to omit `generatedAt` field for deterministic output.
- **dump-diff**, **risk-report**: JSON output now includes `generatedAt` timestamp by default.

## Documentation

- Updated CLI documentation to reflect all changes.
- Added examples for new options.

