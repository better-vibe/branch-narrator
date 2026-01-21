---
name: diff-zoom
description: Drill into a specific finding or risk flag for detailed context with patch hunks. Use when investigating a specific issue from diff-facts or diff-risk output.
allowed-tools: Bash(branch-narrator:*)
argument-hint: "<finding-id | flag-id>"
disable-model-invocation: true
---

# Zoom Into Finding or Flag

Get detailed context for a specific finding or risk flag, including patch hunks and evidence.

## Instructions

1. Parse the argument to determine if it's a finding ID or flag ID:
   - Finding IDs start with `finding.` (e.g., `finding.env-var#abc123`)
   - Flag IDs start with `flag.` (e.g., `flag.db.destructive_sql#def456`)

2. Run the appropriate command:
   - For findings: `branch-narrator zoom --finding <id> --format json --pretty`
   - For flags: `branch-narrator zoom --flag <id> --format json --pretty`

3. Present detailed analysis with:
   - Finding/flag metadata
   - Evidence with file paths and line numbers
   - Actual code snippets from patch context
   - Specific recommendations

## Usage Examples

```
/diff-zoom finding.env-var#abc123
/diff-zoom flag.db.destructive_sql#def456
/diff-zoom finding.route-change#xyz789
```

## Getting IDs

IDs come from previous `/diff-facts` or `/diff-risk` output:

```bash
# From facts
branch-narrator facts --format json | jq '.findings[].findingId'

# From risk-report
branch-narrator risk-report --format json | jq '.flags[].flagId'
```

## Response Format

```
## [Finding/Flag Type]: [ID]

**Category:** [category]
**Severity:** [severity if flag]
**Confidence:** [high/medium/low]

### Location
- **File:** [path]:[line]
- **Status:** [added/modified/deleted]

### Evidence
[Code excerpt or evidence details]

### Patch Context
```diff
[Relevant diff hunks]
```

### Analysis
[What this means and why it was flagged]

### Recommendations
1. [Specific action to address]
2. [Alternative approach if applicable]
```

## Error Handling

If the ID is not found:
- Suggest running `/diff-facts` or `/diff-risk` first
- The ID may be from a different diff state (files changed since)

## Requirements

```bash
npm install -g @better-vibe/branch-narrator
```
