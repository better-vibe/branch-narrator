---
"@better-vibe/branch-narrator": minor
---

Implement agent-facing reliability guarantees for JSON output and CLI behavior

This release implements comprehensive reliability guarantees for AI coding agents that pipe CLI output into JSON parsers:

**JSON-only stdout in JSON mode:**
- `facts`, `risk-report --format json`, and `dump-diff --format json` commands now output pure JSON to stdout
- All diagnostics, warnings, and info messages are sent to stderr
- Errors are reported on stderr with appropriate exit codes

**Global logging flags:**
- `--quiet`: suppresses all non-fatal stderr output (warnings, info) while preserving fatal errors
- `--debug`: increases diagnostic information to stderr (timings, detector counts, etc.)
- `--quiet` overrides `--debug` when both are specified

**Deterministic output ordering:**
- File paths sorted lexicographically with POSIX normalization
- Risk flags sorted by: category (asc), effectiveScore (desc), id (asc)
- Findings sorted by: type (asc), file (asc), location (asc)
- Evidence sorted by: file (asc), line number (asc)
- JSON object keys are stable and predictable

**Agent-grade reliability:**
- `branch-narrator facts | jq .` works reliably even when warnings occur
- `branch-narrator risk-report --format json | jq .` works reliably
- Running the same command twice produces identical JSON output (excluding timestamps)
- No ANSI color codes in JSON mode

These changes ensure that AI coding agents can safely parse and cache CLI output without encountering JSON parsing errors or output churn.
