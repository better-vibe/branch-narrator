# CLI Examples

Practical examples for common use cases.

## Basic Usage

### Generate PR Description

```bash
# Analyze unstaged changes (default)
branch-narrator pr-body

# Output goes to stdout
branch-narrator pr-body > pr.md
```

### Quick Risk Check

```bash
# Get risk level as text
branch-narrator facts | jq -r '.risk.level'

# Output: low, medium, or high
```

---

## Git Workflow

### Before Committing

```bash
# Check unstaged changes (default)
branch-narrator pr-body

# See what will be flagged
branch-narrator facts | jq '.risk.evidenceBullets'
```

### Feature Branch

```bash
# Compare feature to main
branch-narrator pr-body --mode branch --base main --head feature/auth
```

### Comparing Commits

```bash
# Last 5 commits
branch-narrator pr-body --mode branch --base HEAD~5 --head HEAD

# Between tags
branch-narrator pr-body --mode branch --base v1.0.0 --head v1.1.0
```

---

## JSON Processing

### Filter by Type

```bash
# Get route changes only
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'

# Get dependency changes
branch-narrator facts | jq '.findings[] | select(.type == "dependency-change")'
```

### Extract Specific Data

```bash
# List all changed files
branch-narrator facts | jq -r '.changeset.files.added[], .changeset.files.modified[], .changeset.files.deleted[]'

# Get new env vars
branch-narrator facts | jq -r '.findings[] | select(.type == "env-var" and .change == "added") | .name'
```

### Risk Analysis

```bash
# Get score and evidence
branch-narrator facts | jq '{score: .risk.score, level: .risk.level, evidence: .risk.evidenceBullets}'
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

      - name: Generate PR body
        run: |
          bunx @better-vibe/branch-narrator pr-body \
            --mode branch \
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

RISK=$(bunx @better-vibe/branch-narrator facts --mode unstaged | jq -r '.risk.level')

if [ "$RISK" = "high" ]; then
  echo "⚠️  High risk changes detected!"
  bunx @better-vibe/branch-narrator facts --mode unstaged | jq -r '.risk.evidenceBullets[]'
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
  pr-body = !bunx @better-vibe/branch-narrator pr-body
  pr-facts = !bunx @better-vibe/branch-narrator facts
  pr-risk = !bunx @better-vibe/branch-narrator facts | jq -r '.risk.level'
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
RISK=$(echo "$FACTS" | jq -r '.risk.level')
SCORE=$(echo "$FACTS" | jq -r '.risk.score')

echo "Risk: $RISK (score: $SCORE)"

if [ "$RISK" = "high" ]; then
  echo "High risk detected. Evidence:"
  echo "$FACTS" | jq -r '.risk.evidenceBullets[]'
fi
```

### Node.js Script

```typescript
import { execSync } from "child_process";

const facts = JSON.parse(
  execSync("bunx @better-vibe/branch-narrator facts").toString()
);

console.log(`Profile: ${facts.profile.detected}`);
console.log(`Risk: ${facts.risk.level} (${facts.risk.score}/100)`);

for (const finding of facts.findings) {
  if (finding.type === "route-change") {
    console.log(`Route: ${finding.routeId} (${finding.change})`);
  }
}
```

---

## Agent Workflows with Zoom

### Interactive Investigation Loop

```bash
# Step 1: Get all findings
branch-narrator facts --format json --pretty > facts.json

# Step 2: Review findings and identify one to investigate
# (Agent or human reviews facts.json)

# Step 3: Zoom into specific finding for detailed context
branch-narrator zoom --finding "finding.env-var#abc123def456" --format md

# Step 4: Make code changes based on zoomed context

# Step 5: Verify the finding is resolved
branch-narrator facts --format json | jq '.findings[] | select(.findingId == "finding.env-var#abc123def456")'
```

### Risk-Driven Investigation

```bash
# Step 1: Get risk report with flags
branch-narrator risk-report --format json --pretty > risk.json

# Step 2: Extract high-risk flags
cat risk.json | jq '.flags[] | select(.effectiveScore > 30)'

# Step 3: Zoom into the highest risk flag
FLAG_ID=$(cat risk.json | jq -r '.flags | max_by(.effectiveScore) | .flagId')
branch-narrator zoom --flag "$FLAG_ID" --format md > investigation.md

# Step 4: Review related findings
cat investigation.md
```

### Automated Evidence Collection

```bash
#!/bin/bash
# Collect evidence for all high-confidence findings

branch-narrator facts --format json | \
  jq -r '.findings[] | select(.confidence == "high") | .findingId' | \
  while read -r finding_id; do
    echo "Investigating: $finding_id"
    branch-narrator zoom --finding "$finding_id" --format md \
      --out "evidence/${finding_id}.md"
  done
```

### CI Integration with Zoom

```bash
# In CI pipeline: investigate specific failures

# Get risk report
branch-narrator risk-report --format json > risk.json

# If there are security flags, investigate each one
if jq -e '.flags[] | select(.category == "security")' risk.json > /dev/null; then
  jq -r '.flags[] | select(.category == "security") | .flagId' risk.json | \
    while read -r flag_id; do
      echo "Security flag found: $flag_id"
      branch-narrator zoom --flag "$flag_id" --format text
    done
  exit 1
fi
```


