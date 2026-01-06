# Delta Mode (`--since`)

The `--since` feature provides iteration-friendly delta comparison for both `facts` and `risk-report` commands. It shows what changed between two runs, making it easy to verify that specific issues were resolved during interactive development or agent loops.

## Overview

When you run `branch-narrator` multiple times during development, you often want to answer:
- "Did I fix that database migration issue?"
- "Are there any new security risks?"
- "What changed since my last analysis?"

Delta mode provides this answer by computing a structured diff keyed by stable IDs.

## How It Works

1. Run a command and save the output:
   ```bash
   branch-narrator facts --out .ai/baseline.json
   ```

2. Make code changes

3. Compare to the baseline:
   ```bash
   branch-narrator facts --since .ai/baseline.json
   ```

The output shows:
- **Added** findings/flags (by ID)
- **Removed** findings/flags (by ID)  
- **Changed** findings/flags (with before/after objects)

## Stable IDs

Delta mode relies on stable, deterministic IDs:

- **Finding IDs**: Format `finding.<type>#<hash>`
  - Example: `finding.env-var#abc123`
  - Hash is computed from canonical fingerprint (type + key attributes)
  - Same finding across runs = same ID

- **Flag IDs**: Format `flag.<ruleKey>#<hash>`
  - Example: `flag.deps.major_bump#def456`
  - Hash is computed from rule key + related finding IDs
  - Same flag across runs = same ID

## Features

### Deterministic Output

- Results are sorted alphabetically by ID
- Timestamps are automatically ignored during comparison
- Works with `--no-timestamp` for fully deterministic baseline files

### Scope Validation

Delta mode compares scope metadata:
- Mode (unstaged, branch, etc.)
- Git refs (base, head)
- Profile (auto, sveltekit, etc.)
- Filters (include, exclude, only)

If scope differs, warnings are included in output:

```json
{
  "warnings": [
    {
      "code": "scope-mismatch",
      "message": "Previous run used profile=sveltekit, current is profile=auto"
    }
  ]
}
```

Use `--since-strict` to exit with code 1 on any mismatch.

### Timestamp Normalization

The comparison automatically ignores `generatedAt` fields, so you can use:
- Timestamped baselines (default)
- Deterministic baselines (`--no-timestamp`)

Both work correctly with `--since`.

## Output Schemas

### `facts --since` Output

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-01-06T12:00:00.000Z",
  "command": {
    "name": "facts",
    "args": ["--mode", "unstaged", "--since", ".ai/prev-facts.json"]
  },
  "since": {
    "path": ".ai/prev-facts.json",
    "toolVersion": "1.1.0",
    "schemaVersion": "1.0"
  },
  "current": {
    "toolVersion": "1.1.0",
    "schemaVersion": "1.0"
  },
  "scope": {
    "mode": "unstaged",
    "base": null,
    "head": null,
    "profile": "auto",
    "include": [],
    "exclude": []
  },
  "warnings": [],
  "delta": {
    "added": ["finding.env-var#abc123"],
    "removed": ["finding.db-migration#def456"],
    "changed": [
      {
        "findingId": "finding.dependency-change#ghi789",
        "before": { "name": "express", "from": "4.17.0", "to": "4.18.0", "..." },
        "after": { "name": "express", "from": "4.17.0", "to": "5.0.0", "..." }
      }
    ]
  },
  "summary": {
    "addedCount": 1,
    "removedCount": 1,
    "changedCount": 1
  }
}
```

### `risk-report --since` Output

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-01-06T12:00:00.000Z",
  "command": {
    "name": "risk-report",
    "args": ["--mode", "unstaged", "--since", ".ai/prev-risk.json"]
  },
  "since": {
    "path": ".ai/prev-risk.json",
    "toolVersion": "1.1.0",
    "schemaVersion": "1.0"
  },
  "current": {
    "toolVersion": "1.1.0",
    "schemaVersion": "1.0"
  },
  "scope": {
    "mode": "unstaged",
    "base": null,
    "head": null,
    "only": null
  },
  "delta": {
    "riskScore": {
      "from": 62,
      "to": 40,
      "delta": -22
    },
    "flags": {
      "added": ["flag.ci.workflow_permissions#abc123"],
      "removed": ["flag.db.destructive_sql#def456"],
      "changed": [
        {
          "flagId": "flag.deps.major_bump#ghi789",
          "before": { "title": "Major bump: express", "score": 40, "..." },
          "after": { "title": "Major bump: express", "score": 50, "..." }
        }
      ]
    }
  },
  "summary": {
    "flagAddedCount": 1,
    "flagRemovedCount": 1,
    "flagChangedCount": 1
  }
}
```

## Use Cases

### 1. Iterative Development

```bash
# Start a feature
branch-narrator risk-report --out .ai/baseline-risk.json

# Work on the feature...
# (edit files)

# Check progress
branch-narrator risk-report --since .ai/baseline-risk.json --pretty | jq '.delta.riskScore'
# { "from": 80, "to": 60, "delta": -20 }

# Continue until risk is acceptable
# (edit more files)

branch-narrator risk-report --since .ai/baseline-risk.json --pretty | jq '.delta.riskScore'
# { "from": 80, "to": 30, "delta": -50 }
```

### 2. Agent Loops

```bash
# Agent detects issue from facts
branch-narrator facts --out .ai/step1.json
# Sees: finding.env-var#secret123 (missing SECRET_KEY)

# Agent makes fix
# (adds SECRET_KEY to .env.example)

# Verify fix
branch-narrator facts --since .ai/step1.json --pretty | jq '.delta.removed'
# ["finding.env-var#secret123"]  ✅ Fixed!
```

### 3. PR Validation

```bash
# Baseline at PR start
git checkout feature/new-api
branch-narrator risk-report --mode branch --base main --out .ai/pr-risk.json

# Make changes based on review
# (fix security issues)

# Verify improvements
branch-narrator risk-report --mode branch --base main --since .ai/pr-risk.json
# Shows which security flags were resolved
```

### 4. CI Integration

```bash
# Strict mode for CI (fail on scope mismatch)
branch-narrator facts --since .ai/main-baseline.json --since-strict

# Ensures:
# - Same mode
# - Same profile
# - Same filters
# - Apples-to-apples comparison
```

## Limitations (v1)

- **JSON only**: `--since` only supports JSON format. Using `--format md` or `--format text` with `--since` (for risk-report) will error.
- **ID equality only**: No fuzzy matching. Findings/flags are matched by exact ID.
- **No field-level diffs**: Changed items include full before/after objects, not field-by-field diffs (may be added in future).
- **Manual file management**: You must save and manage baseline files yourself (no automatic persistence in v1).

## Best Practices

1. **Use `--no-timestamp` for baselines**:
   ```bash
   branch-narrator facts --no-timestamp --out .ai/baseline.json
   ```
   This makes baselines deterministic and git-friendly.

2. **Version baselines with code**:
   ```bash
   # Commit baseline with feature branch
   git add .ai/baseline.json
   git commit -m "feat: add baseline for comparison"
   ```

3. **Use `--since-strict` in CI**:
   ```bash
   # Ensure consistent comparison in CI
   branch-narrator risk-report --since .ai/main-baseline.json --since-strict
   ```

4. **Combine with `jq` for specific checks**:
   ```bash
   # Check if specific finding was resolved
   branch-narrator facts --since .ai/prev.json | \
     jq '.delta.removed | contains(["finding.env-var#secret123"])'
   ```

5. **Name baselines descriptively**:
   ```bash
   .ai/
     baseline-facts.json
     baseline-risk.json
     step1-facts.json
     step2-facts.json
   ```

## Error Handling

### Invalid File

```bash
$ branch-narrator facts --since not-a-facts-file.json
Error: File not-a-facts-file.json does not appear to be a valid facts output
```

### Scope Mismatch (Strict Mode)

```bash
$ branch-narrator risk-report --since .ai/prev.json --since-strict
Error: Scope mismatch detected (--since-strict): Previous run used mode=branch, current is mode=unstaged
```

### Missing File

```bash
$ branch-narrator facts --since .ai/missing.json
Error: Failed to load previous facts from .ai/missing.json: ENOENT: no such file or directory
```

## Future Enhancements

Potential improvements for future versions:

- Field-level diffs for changed items
- Markdown/text output for delta mode
- Automatic baseline persistence (`--save-baseline`)
- Delta history tracking (`--since @last`, `--since @step-3`)
- Fuzzy ID matching for renamed findings
- Summary statistics in delta output
