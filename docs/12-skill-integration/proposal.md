# Claude Code Skill Integration Proposal

**Version:** 1.0.0
**Status:** Proposal
**Author:** AI-assisted
**Date:** January 2026

---

## Executive Summary

This proposal outlines how `@better-vibe/branch-narrator` can be integrated as a Claude Code skill, enabling AI agents to gain structured, evidence-based context about git diff changes through simple slash commands.

**Key Benefits:**
- Zero-latency diff analysis (no network calls, no LLM costs)
- Structured JSON output optimized for AI consumption
- Framework-aware detection (Next.js, SvelteKit, React, Vue, etc.)
- Risk scoring with evidence-backed flags
- Prioritized highlights for quick context

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Skill Architecture](#skill-architecture)
4. [Proposed Skills](#proposed-skills)
5. [Implementation Details](#implementation-details)
6. [Example Workflows](#example-workflows)
7. [Configuration](#configuration)
8. [Appendix: Output Schemas](#appendix-output-schemas)

---

## Problem Statement

AI coding assistants like Claude Code frequently need to understand:

1. **What changed** in the current working directory or branch
2. **What's risky** about those changes (security, breaking changes, database migrations)
3. **What's the impact** (blast radius, affected routes, API surface changes)
4. **What needs testing** (test gaps, coverage parity)

Currently, agents must:
- Run raw `git diff` commands and parse unstructured output
- Miss framework-specific context (routes, components, configs)
- Lack risk awareness for security-sensitive changes
- Spend tokens re-analyzing the same diff repeatedly

**Branch-narrator solves this** by providing deterministic, structured, framework-aware analysis of git diffs—perfectly suited for AI agent consumption.

---

## Solution Overview

Integrate branch-narrator as Claude Code skills that provide:

| Skill | Purpose | Output |
|-------|---------|--------|
| `/diff-facts` | Full structured analysis | JSON with findings, risk, highlights |
| `/diff-risk` | Risk-focused analysis | Risk score, flags, evidence |
| `/diff-summary` | Quick overview | Prioritized highlights only |
| `/diff-raw` | AI-optimized diff | Filtered diff text |

### Why Skills vs. Direct CLI?

| Aspect | Direct CLI | Skill Integration |
|--------|-----------|-------------------|
| Discoverability | Must know command exists | Shows in `/help` |
| Context injection | Manual parsing | Automatic prompt injection |
| Caching | None | Session-level caching possible |
| Customization | CLI flags only | Project-level skill config |
| Guidance | None | Inline usage hints |

---

## Skill Architecture

### Skill Definition Structure

Each skill follows Claude Code's skill manifest format:

```yaml
name: diff-facts
description: Analyze git changes with structured findings
trigger: /diff-facts
tool: bash
command: branch-narrator facts --pretty --format json
output_handling: inject_as_context
cache_strategy: session  # Invalidate on file changes
```

### Data Flow

```
User: /diff-facts
         ↓
┌─────────────────────────────────────────────────────────┐
│ Claude Code Skill Runner                                │
│                                                         │
│  1. Parse skill trigger                                 │
│  2. Check cache (optional)                              │
│  3. Execute: branch-narrator facts --format json        │
│  4. Parse JSON output                                   │
│  5. Inject structured context into conversation         │
└─────────────────────────────────────────────────────────┘
         ↓
Claude receives structured context:
- highlights (prioritized bullets)
- findings (typed, categorized)
- risk score (0-100)
- file categories
```

---

## Proposed Skills

### 1. `/diff-facts` — Full Structured Analysis

**Purpose:** Get comprehensive, structured analysis of current changes.

**When to use:**
- Starting code review
- Before committing changes
- Understanding impact of modifications
- CI/CD context gathering

**Command:**
```bash
branch-narrator facts --format json --pretty
```

**Output includes:**
- `highlights`: Prioritized summary bullets (3-7 items)
- `findings`: Array of typed findings with evidence
- `risk`: Score (0-100), level, and contributing factors
- `stats`: File counts, insertions, deletions
- `profile`: Detected framework with confidence

**Example invocation:**
```
User: /diff-facts

[System injects structured analysis]

Claude: Based on the diff analysis:
- 3 route changes detected in your Next.js app
- Risk score: 42/100 (moderate) due to database migration
- 2 environment variables added (API_KEY, DB_URL)
- Test gap: src/utils/auth.ts lacks test coverage

Would you like me to review any specific finding?
```

---

### 2. `/diff-risk` — Risk-Focused Analysis

**Purpose:** Quick risk assessment with actionable flags.

**When to use:**
- Before deploying
- Reviewing security-sensitive changes
- CI gates for risk thresholds

**Command:**
```bash
branch-narrator risk-report --format json --pretty --explain-score
```

**Output includes:**
- `score`: 0-100 risk score
- `level`: low/moderate/elevated/high/critical
- `flags`: Array of risk flags with evidence
- `breakdown`: Category scores (security, deps, db, etc.)

**Example invocation:**
```
User: /diff-risk

[System injects risk report]

Claude: Risk Assessment: 67/100 (Elevated)

Critical flags:
- ⚠️ Destructive SQL detected in migrations/002_drop_users.sql
- ⚠️ GitHub Actions workflow permissions broadened
- ⚠️ Security file modified: src/auth/session.ts

Recommendation: Review these changes carefully before merging.
```

---

### 3. `/diff-summary` — Quick Overview

**Purpose:** Fast, token-efficient summary of changes.

**When to use:**
- Quick context check
- When full analysis is overkill
- Conversational context refresh

**Command:**
```bash
branch-narrator facts --format json | jq -c '{highlights, stats, risk: {score: .risk.score, level: .risk.level}}'
```

**Output includes:**
- `highlights`: 3-7 prioritized bullets
- `stats`: Basic file counts
- `risk`: Score and level only

**Example invocation:**
```
User: /diff-summary

Claude: Quick summary of your changes:
• Modified 5 files (+120/-45 lines)
• Added new API route: /api/users/[id]
• Updated 2 dependencies (react, @types/node)
• Risk: 28/100 (moderate)
```

---

### 4. `/diff-raw` — AI-Optimized Diff

**Purpose:** Get filtered diff text for detailed code analysis.

**When to use:**
- Deep code review
- Understanding specific changes
- When you need actual diff content

**Command:**
```bash
branch-narrator dump-diff --format text --unified 3
```

**Features:**
- Excludes lockfiles, build artifacts, minified files
- Smart chunking for large diffs
- Binary file detection

**Example invocation:**
```
User: /diff-raw

[System injects filtered diff text]

Claude: I can see the diff changes. The key modifications are:
1. In src/api/users.ts (lines 45-67): New validation logic
2. In src/types/user.ts: Added `role` field to User interface

Should I explain any specific change in detail?
```

---

### 5. `/diff-zoom` — Deep Dive on Specific Finding

**Purpose:** Drill into a specific finding or flag for detailed context.

**When to use:**
- Investigating a specific risk flag
- Understanding a particular finding
- Getting patch context for a change

**Command:**
```bash
branch-narrator zoom --finding <findingId> --format json --pretty
# or
branch-narrator zoom --flag <flagId> --format json --pretty
```

**Workflow:**
1. User runs `/diff-facts` or `/diff-risk`
2. Sees a concerning finding/flag
3. Runs `/diff-zoom finding.env-var#abc123` for details

**Example invocation:**
```
User: /diff-zoom finding.sql-risk#def456

[System injects zoom output with patch context]

Claude: Detailed analysis of the SQL risk finding:

**Location:** migrations/002_update_schema.sql
**Issue:** Destructive SQL pattern detected

The migration contains:
```sql
DROP TABLE IF EXISTS user_sessions;  -- Line 15
ALTER TABLE users DROP COLUMN legacy_id;  -- Line 23
```

These operations are irreversible. Recommendations:
1. Ensure backup exists before running
2. Consider soft-delete instead of DROP TABLE
3. Add migration rollback script
```

---

## Implementation Details

### Skill Manifest Files

Skills can be defined in `.claude/skills/` directory:

```
.claude/
  skills/
    diff-facts.yaml
    diff-risk.yaml
    diff-summary.yaml
    diff-raw.yaml
    diff-zoom.yaml
```

### Example Skill Manifest: `diff-facts.yaml`

```yaml
# .claude/skills/diff-facts.yaml
apiVersion: claude.ai/v1
kind: Skill
metadata:
  name: diff-facts
  description: Get structured analysis of git diff changes
  category: development
  tags: [git, diff, analysis, context]

spec:
  trigger: /diff-facts

  # Arguments passed after the command
  arguments:
    - name: mode
      type: string
      default: unstaged
      enum: [unstaged, staged, all, branch]
      description: Diff mode to analyze

    - name: base
      type: string
      required: false
      description: Base ref for branch mode

  # The command to execute
  execution:
    tool: bash
    command: |
      branch-narrator facts \
        --mode {{ args.mode }} \
        {{ if args.base }}--base {{ args.base }}{{ end }} \
        --format json \
        --pretty

    # How to handle the output
    output:
      format: json
      injection: context  # Inject as system context
      summary: |
        Analyzed {{ .stats.filesChanged }} files with risk score {{ .risk.score }}/100 ({{ .risk.level }}).
        Key findings: {{ range .highlights }}{{ . }} {{ end }}

  # Caching behavior
  cache:
    strategy: content-hash  # Invalidate when git status changes
    ttl: 300  # 5 minutes max

  # Dependencies
  requires:
    - command: branch-narrator
      install: npm install -g @better-vibe/branch-narrator
```

### Example Skill Manifest: `diff-risk.yaml`

```yaml
# .claude/skills/diff-risk.yaml
apiVersion: claude.ai/v1
kind: Skill
metadata:
  name: diff-risk
  description: Get risk assessment of current changes
  category: development

spec:
  trigger: /diff-risk

  arguments:
    - name: threshold
      type: number
      default: 50
      description: Risk threshold to highlight

    - name: categories
      type: string
      required: false
      description: Comma-separated categories to focus on

  execution:
    tool: bash
    command: |
      branch-narrator risk-report \
        --format json \
        --pretty \
        --explain-score \
        {{ if args.categories }}--only {{ args.categories }}{{ end }}

    output:
      format: json
      injection: context
      highlight_if: "{{ .score }} >= {{ args.threshold }}"
      summary: |
        Risk Score: {{ .score }}/100 ({{ .level }})
        {{ if gt .score args.threshold }}⚠️ Exceeds threshold of {{ args.threshold }}{{ end }}
```

### Example Skill Manifest: `diff-zoom.yaml`

```yaml
# .claude/skills/diff-zoom.yaml
apiVersion: claude.ai/v1
kind: Skill
metadata:
  name: diff-zoom
  description: Drill into a specific finding or flag

spec:
  trigger: /diff-zoom

  arguments:
    - name: target
      type: string
      required: true
      description: Finding ID (finding.*) or Flag ID (flag.*)

  execution:
    tool: bash
    command: |
      {{ if hasPrefix args.target "finding." }}
      branch-narrator zoom --finding {{ args.target }} --format json --pretty
      {{ else if hasPrefix args.target "flag." }}
      branch-narrator zoom --flag {{ args.target }} --format json --pretty
      {{ else }}
      echo '{"error": "Target must start with finding. or flag."}'
      {{ end }}

    output:
      format: json
      injection: context
```

---

## Example Workflows

### Workflow 1: Code Review Assistance

```
User: I just finished implementing a new feature. Can you review my changes?

Claude: Let me analyze your changes first.

User: /diff-facts

[Structured analysis injected]

Claude: I've analyzed your changes. Here's my review:

**Summary:**
- 8 files modified, 2 new files added
- Risk score: 35/100 (moderate)
- Profile: Next.js App Router detected

**Findings to address:**

1. **Route Change** (`app/api/users/route.ts`)
   - New POST endpoint added without rate limiting
   - Recommendation: Add rate limiting middleware

2. **Environment Variable** (`API_SECRET`)
   - New secret added but not in `.env.example`
   - Add placeholder to `.env.example`

3. **Test Gap**
   - `src/lib/auth.ts` modified but no test updates
   - Consider adding unit tests

Would you like me to help address any of these?
```

### Workflow 2: Pre-Commit Risk Check

```
User: /diff-risk

[Risk report injected]

Claude: ⚠️ **Elevated Risk Detected: 58/100**

**Critical Flags:**
1. `flag.db.destructive_sql#a1b2c3`
   - Location: `migrations/003_cleanup.sql`
   - Issue: `DROP TABLE legacy_data`

2. `flag.security.env_secret_added#d4e5f6`
   - New secret: `STRIPE_SECRET_KEY`
   - Not in `.gitignore` check

**Recommendations before committing:**
1. Verify database backup exists
2. Ensure `.env` is gitignored
3. Consider soft-delete migration

Run `/diff-zoom flag.db.destructive_sql#a1b2c3` for details.
```

### Workflow 3: Iterative Development Loop

```
User: I'm fixing the issues you mentioned. Let me check progress.

User: /diff-summary

Claude: Quick update on your changes:
• 3 files modified since last check
• New test file added: `src/lib/auth.test.ts` ✓
• Risk score dropped: 58 → 32 (moderate)

The test gap is now addressed. The SQL migration risk remains.
Would you like to tackle that next?
```

### Workflow 4: Deep Dive Investigation

```
User: Tell me more about that SQL risk

User: /diff-zoom flag.db.destructive_sql#a1b2c3

[Zoom output with patch context injected]

Claude: **Detailed Analysis: Destructive SQL**

**File:** `migrations/003_cleanup.sql`
**Lines:** 12-18

```sql
-- Cleanup legacy data (irreversible)
DROP TABLE IF EXISTS legacy_data;
DROP TABLE IF EXISTS old_sessions;
TRUNCATE audit_logs;
```

**Risk Assessment:**
- 3 destructive operations detected
- No rollback migration exists
- `audit_logs` truncation loses audit trail

**Suggested Fix:**

```sql
-- Option 1: Soft delete with archival
CREATE TABLE archived_legacy_data AS SELECT * FROM legacy_data;
DROP TABLE legacy_data;

-- Option 2: Keep audit logs
-- Remove: TRUNCATE audit_logs;
```

Would you like me to create a safer migration script?
```

---

## Configuration

### Project-Level Configuration

Projects can customize skill behavior via `.claude/config.yaml`:

```yaml
# .claude/config.yaml
skills:
  diff-facts:
    default_mode: all  # Include untracked files
    profile: auto      # Let branch-narrator detect

  diff-risk:
    default_threshold: 40  # More sensitive
    exclude_categories:
      - tests  # Don't flag test changes

  diff-raw:
    max_chars: 50000  # Larger context window
    exclude:
      - "**/*.generated.ts"
      - "**/vendor/**"
```

### Global User Configuration

Users can set defaults in `~/.claude/skills.yaml`:

```yaml
# ~/.claude/skills.yaml
branch-narrator:
  install_path: ~/.bun/bin/branch-narrator
  default_format: json
  redact_secrets: true
```

---

## Appendix: Output Schemas

### Facts Output Schema (v2.1)

```typescript
interface FactsOutput {
  schemaVersion: "2.1";
  generatedAt: string;  // ISO timestamp

  git: {
    mode: "unstaged" | "staged" | "all" | "branch";
    base: string | null;
    head: string | null;
    range: string;
  };

  profile: {
    requested: string | null;
    detected: string;
    confidence: "high" | "medium" | "low";
    reasons: string[];
  };

  stats: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };

  highlights: string[];  // Prioritized bullets (3-7)

  risk: {
    score: number;       // 0-100
    level: "low" | "moderate" | "elevated" | "high" | "critical";
    factors: Array<{
      category: string;
      score: number;
      flags: string[];
    }>;
  };

  findings: Array<Finding>;  // Typed findings

  changeset: {
    files: {
      added: string[];
      modified: string[];
      deleted: string[];
      renamed: Array<{ from: string; to: string }>;
    };
    byCategory: Record<string, string[]>;
    warnings: Array<{ type: string; message: string }>;
  };
}
```

### Risk Report Output Schema

```typescript
interface RiskReport {
  schemaVersion: "2.0";
  generatedAt: string;

  score: number;           // 0-100
  level: RiskLevel;

  flags: Array<{
    flagId: string;        // flag.{category}.{rule}#{hash}
    ruleKey: string;
    category: string;
    severity: "info" | "warning" | "critical";
    score: number;
    confidence: number;
    message: string;
    evidence: Evidence[];
    relatedFindingIds: string[];
  }>;

  breakdown: Record<string, {
    score: number;
    flags: string[];
  }>;
}
```

### Zoom Output Schema

```typescript
interface ZoomOutput {
  schemaVersion: "1.0";
  generatedAt: string;

  itemType: "finding" | "flag";
  findingId?: string;
  flagId?: string;

  finding?: Finding;
  flag?: Flag;

  evidence: Array<{
    file: string;
    excerpt: string;
    line?: number;
  }>;

  patchContext: Array<{
    file: string;
    status: string;
    hunks: Hunk[];
  }>;
}
```

---

## Implementation Roadmap

### Phase 1: Core Skills (MVP)
- [ ] `/diff-facts` skill implementation
- [ ] `/diff-risk` skill implementation
- [ ] Basic skill manifest format
- [ ] Documentation

### Phase 2: Enhanced Skills
- [ ] `/diff-summary` for quick context
- [ ] `/diff-raw` for detailed diffs
- [ ] `/diff-zoom` for drill-down
- [ ] Caching layer

### Phase 3: Integration
- [ ] Claude Code skill registry submission
- [ ] Project template generation
- [ ] IDE extension support
- [ ] CI/CD skill variants

---

## Conclusion

Branch-narrator is uniquely positioned to serve as an AI coding assistant skill:

1. **Deterministic** - Same input always produces same output
2. **Structured** - JSON output perfect for programmatic consumption
3. **Comprehensive** - 36 analyzers covering frameworks, security, infra
4. **Fast** - No network calls, instant analysis
5. **Evidence-based** - Every finding includes file paths and excerpts

By integrating as Claude Code skills, we enable AI assistants to:
- Gain instant context about code changes
- Make risk-aware recommendations
- Provide framework-specific guidance
- Support iterative development workflows

---

## References

- [Branch-narrator CLI Documentation](../05-cli/commands.md)
- [Facts Command Output](../08-rendering/json.md)
- [Risk Scoring Model](../08-rendering/risk-scoring.md)
- [Stable IDs](../09-stable-ids/09-stable-ids.md)
- [Delta Mode](../11-delta-mode/11-delta-mode.md)
