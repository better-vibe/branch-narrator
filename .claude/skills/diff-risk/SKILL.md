---
name: diff-risk
description: Get risk assessment of current git changes with evidence-backed flags. Use before deploying, reviewing security-sensitive changes, or for CI risk gates.
allowed-tools: Bash(branch-narrator:*)
argument-hint: "[--threshold <n>] [--only <categories>]"
---

# Risk Assessment

Analyze risk level of current git changes using branch-narrator's risk scoring model.

## Instructions

1. Run `branch-narrator risk-report --format json --pretty --explain-score`
2. Present the risk assessment with:
   - Overall score and level
   - Critical/high severity flags with evidence
   - Category breakdown if multiple areas affected
   - Actionable recommendations

## Command Variations

- Default: `branch-narrator risk-report --format json --pretty --explain-score`
- With threshold alert: `branch-narrator risk-report --fail-on-score 50 --format json --pretty`
- Filter categories: `branch-narrator risk-report --only security,db --format json --pretty`
- Exclude categories: `branch-narrator risk-report --exclude tests --format json --pretty`

## Risk Categories

| Category | What It Flags |
|----------|---------------|
| `security` | Auth files, secrets, permissions |
| `db` | Migrations, destructive SQL, schema changes |
| `deps` | Major version bumps, risky packages |
| `ci` | Workflow permission changes |
| `infra` | Docker, K8s, Terraform changes |
| `api` | Breaking API changes |
| `tests` | Test coverage gaps |

## Response Format

```
## Risk Assessment: [Score]/100 ([Level])

[If score > 60, add warning banner]

### Critical Flags
- [Flag description with file:line]
- [Evidence excerpt if helpful]

### High Flags
- [List high severity items]

### Category Breakdown
| Category | Score | Top Flag |
|----------|-------|----------|
| security | 45 | Workflow permissions broadened |
| db | 30 | Destructive SQL detected |

### Recommendations
1. [Specific action for highest risk item]
2. [Next priority action]

[If threshold exceeded, clearly state it]
```

## Severity Guide

- **Critical**: Immediate attention required (destructive SQL, exposed secrets)
- **High**: Requires careful review (permission changes, major deps)
- **Warning**: Notable but may be intentional (new env vars, config changes)
- **Info**: Informational only (documentation, minor changes)

## Requirements

```bash
npm install -g @better-vibe/branch-narrator
```
