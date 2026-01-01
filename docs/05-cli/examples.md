# CLI Examples

Practical examples for common use cases.

## Basic Usage

### Generate PR Description

```bash
# Compare main to HEAD
branch-narrator pr-body

# Output goes to stdout
branch-narrator pr-body > pr.md
```

### Quick Risk Check

```bash
# Get risk level as text
branch-narrator facts | jq -r '.riskScore.level'

# Output: low, medium, or high
```

### Preview Analysis (Dry Run)

```bash
# See what would be analyzed without generating full output
branch-narrator facts --dry-run

# Shows: mode, profile, findings count, risk score, and breakdown by type
branch-narrator facts --mode all --dry-run

# Preview before writing to file
branch-narrator facts --out report.json --dry-run
```

---

## Git Workflow

### Before Committing

```bash
# Check uncommitted changes
branch-narrator pr-body -u

# See what will be flagged
branch-narrator facts -u | jq '.riskScore.evidenceBullets'
```

### Feature Branch

```bash
# Compare feature to main
branch-narrator pr-body --base main --head feature/auth
```

### Comparing Commits

```bash
# Last 5 commits
branch-narrator pr-body --base HEAD~5 --head HEAD

# Between tags
branch-narrator pr-body --base v1.0.0 --head v1.1.0
```

---

## JSON Processing

### Using Enhanced Output Format

```bash
# Get metadata and stats
branch-narrator facts --mode all | jq '.stats'

# Get total findings count
branch-narrator facts | jq '.stats.totalFindings'

# Get findings breakdown by type
branch-narrator facts | jq '.stats.findingsByType'

# Check which mode was used
branch-narrator facts --mode unstaged | jq -r '.mode'
```

### Filter by Type

```bash
# Get route changes only
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'

# Get dependency changes
branch-narrator facts | jq '.findings[] | select(.type == "dependency-change")'

# Count specific finding type
branch-narrator facts | jq '.stats.findingsByType["route-change"]'
```

### Extract Specific Data

```bash
# List all changed files
branch-narrator facts | jq -r '.findings[] | select(.type == "file-summary") | .added[], .modified[]'

# Get new env vars
branch-narrator facts | jq -r '.findings[] | select(.type == "env-var" and .change == "added") | .name'
```

### Risk Analysis

```bash
# Get score and evidence
branch-narrator facts | jq '{score: .riskScore.score, level: .riskScore.level, evidence: .riskScore.evidenceBullets}'
```

### Write to File for CI/CD

```bash
# Save analysis for later processing
branch-narrator facts --out analysis.json

# Compact format for storage efficiency
branch-narrator facts --format compact --out analysis.min.json

# Preview before writing
branch-narrator facts --dry-run
```

---

## Clipboard Integration

### macOS

```bash
branch-narrator pr-body | pbcopy
```

### Linux (xclip)

```bash
branch-narrator pr-body | xclip -selection clipboard
```

### Windows (PowerShell)

```powershell
branch-narrator pr-body | clip
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: PR Description
on:
  pull_request:

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v1

      - run: bun add -D branch-narrator

      - name: Generate PR body
        run: |
          npx branch-narrator pr-body \
            --base ${{ github.base_ref }} \
            --head ${{ github.head_ref }} > pr-body.md

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const body = fs.readFileSync('pr-body.md', 'utf8');
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

RISK=$(npx branch-narrator facts -u | jq -r '.riskScore.level')

if [ "$RISK" = "high" ]; then
  echo "⚠️  High risk changes detected!"
  npx branch-narrator facts -u | jq -r '.riskScore.evidenceBullets[]'
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi
```

---

## Git Aliases

Add to `~/.gitconfig`:

```ini
[alias]
  pr-body = !npx branch-narrator pr-body
  pr-facts = !npx branch-narrator facts
  pr-risk = !npx branch-narrator facts | jq -r '.riskScore.level'
```

Usage:

```bash
git pr-body
git pr-facts | jq
git pr-risk
```

---

## Scripting

### Bash Script

```bash
#!/bin/bash

# Generate PR description and check risk
FACTS=$(branch-narrator facts)
RISK=$(echo "$FACTS" | jq -r '.riskScore.level')
SCORE=$(echo "$FACTS" | jq -r '.riskScore.score')

echo "Risk: $RISK (score: $SCORE)"

if [ "$RISK" = "high" ]; then
  echo "High risk detected. Evidence:"
  echo "$FACTS" | jq -r '.riskScore.evidenceBullets[]'
fi
```

### Node.js Script

```typescript
import { execSync } from "child_process";

const facts = JSON.parse(
  execSync("npx branch-narrator facts").toString()
);

console.log(`Profile: ${facts.profile}`);
console.log(`Risk: ${facts.riskScore.level} (${facts.riskScore.score}/100)`);

for (const finding of facts.findings) {
  if (finding.type === "route-change") {
    console.log(`Route: ${finding.routeId} (${finding.change})`);
  }
}
```

