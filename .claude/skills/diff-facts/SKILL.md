---
name: diff-facts
description: Analyze git changes with structured findings, risk assessment, and framework detection. Use when reviewing code changes, before committing, or to understand change impact.
allowed-tools: Bash(branch-narrator:*)
argument-hint: "[--staged | --all | --mode branch --base <ref>]"
---

# Diff Facts Analysis

Analyze the current git changes using branch-narrator and provide structured context.

## Instructions

1. Run `branch-narrator facts --format json --pretty` with appropriate mode flags based on user arguments
2. Parse the JSON output and summarize:
   - **Highlights**: Show the prioritized bullets from `highlights` array
   - **Risk**: Report the score (0-100) and level
   - **Key Findings**: Summarize the most important findings by type
   - **Framework**: Mention detected profile if not "default"

## Command Variations

- Default (unstaged): `branch-narrator facts --format json --pretty`
- Staged only: `branch-narrator facts --mode staged --format json --pretty`
- All changes: `branch-narrator facts --mode all --format json --pretty`
- Branch comparison: `branch-narrator facts --mode branch --base <ref> --format json --pretty`

## Output Interpretation

**Risk Levels:**
- 0-20: Low (green light)
- 21-40: Moderate (proceed with review)
- 41-60: Elevated (careful review needed)
- 61-80: High (requires approval)
- 81-100: Critical (block until addressed)

**Finding Types to Highlight:**
- Route changes (API surface changes)
- Database migrations (especially destructive SQL)
- Security file changes
- Environment variable additions/changes
- Dependency updates (especially major versions)
- Test gaps

## Example Response Format

After running the command, format your response like:

```
## Change Analysis

**Risk Score:** 35/100 (Moderate)
**Framework:** Next.js App Router
**Files Changed:** 8 (+120/-45 lines)

### Highlights
- Added new API route /api/users with POST method
- Environment variable API_KEY added
- Test gap: src/lib/auth.ts lacks coverage

### Key Findings
[Summarize 2-4 most important findings with file paths]

### Recommendations
[If risk > 40, provide specific recommendations]
```

## Requirements

Requires `branch-narrator` CLI:
```bash
npm install -g @better-vibe/branch-narrator
```
