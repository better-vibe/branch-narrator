---
"@better-vibe/branch-narrator": minor
---

Add `--since` flag for iteration-friendly delta comparison in `facts` and `risk-report` commands

This feature enables comparing current analysis output to a previous run, showing added/removed/changed findings or flags. Useful for interactive agent loops where you want to verify specific issues are resolved.

**New flags:**
- `--since <path>` - Compare to a previous JSON file
- `--since-strict` - Exit with code 1 on scope mismatch

**Delta output includes:**
- Added/removed/changed IDs (deterministic, sorted)
- Risk score delta (risk-report only)
- Scope mismatch warnings
- Full before/after objects for changed items

**Usage:**
```bash
# Save baseline
branch-narrator facts --out .ai/prev-facts.json
branch-narrator risk-report --out .ai/prev-risk.json

# Make changes...

# Compare
branch-narrator facts --since .ai/prev-facts.json
branch-narrator risk-report --since .ai/prev-risk.json
```
