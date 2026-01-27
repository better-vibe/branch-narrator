# Core Types

Core types used throughout branch-narrator.

## ChangeSet

The normalized structure built from git diff data.

```typescript
interface ChangeSet {
  base: string;                              // Base ref (e.g., "main")
  head: string;                              // Head ref (e.g., "HEAD", "WORKING")
  files: FileChange[];                       // All changed files
  diffs: FileDiff[];                         // Parsed diff hunks
  basePackageJson?: Record<string, unknown>; // package.json at base
  headPackageJson?: Record<string, unknown>; // package.json at head
}
```

---

## FileChange

Represents a single file change.

```typescript
type FileStatus = "added" | "modified" | "deleted" | "renamed";

interface FileChange {
  path: string;
  status: FileStatus;
  oldPath?: string;  // For renames only
}
```

---

## FileDiff

Parsed diff content for a file.

```typescript
interface FileDiff {
  path: string;
  status: FileStatus;
  oldPath?: string;
  hunks: Hunk[];
}

interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
  additions: string[];   // Lines starting with +
  deletions: string[];   // Lines starting with -
}
```

---

## RiskScore

Aggregate risk assessment.

```typescript
type RiskLevel = "high" | "medium" | "low";

interface RiskFactor {
  kind: string;
  weight: number;
  explanation: string;
  evidence: Evidence[];
}

interface RiskScore {
  score: number;           // 0-100
  level: RiskLevel;
  factors: RiskFactor[];   // Detailed breakdown of risk factors
  evidenceBullets?: string[]; // Legacy field for compatibility
}
```

**Thresholds (facts risk score):**

| Score | Level |
|-------|-------|
| 0-19 | `low` |
| 20-49 | `medium` |
| 50-100 | `high` |

**Note:** `risk-report` uses a separate five-level scale (`low`, `moderate`,
`elevated`, `high`, `critical`) and a different schema.

---

## Analyzer

Interface for all analyzers.

```typescript
interface Analyzer {
  name: string;
  analyze(changeSet: ChangeSet): Finding[] | Promise<Finding[]>;
  cache?: {
    includeGlobs?: string[];
    excludeGlobs?: string[];
  };
}
```

---

## Profile

Profile configuration.

```typescript
type ProfileName =
  | "auto"
  | "sveltekit"
  | "next"
  | "react"
  | "vue"
  | "astro"
  | "stencil"
  | "angular"
  | "library"
  | "python"
  | "vite";

interface Profile {
  name: ProfileName;
  analyzers: Analyzer[];
}
```

---

## RenderContext

Context passed to renderers.

```typescript
interface RenderContext {
  findings: Finding[];
  riskScore: RiskScore;
  profile: ProfileName;
  interactive?: {
    context?: string;
    testNotes?: string;
  };
}
```

---

## ChangesetInfo

Organizational data about the changeset. This structure contains data that describes the changeset as a whole, rather than domain-specific findings.

```typescript
interface ChangesetInfo {
  /** Files grouped by change status */
  files: {
    added: string[];
    modified: string[];
    deleted: string[];
    renamed: Array<{ from: string; to: string }>;
  };
  /** Files grouped by category */
  byCategory: Record<FileCategory, string[]>;
  /** Category summary sorted by count */
  categorySummary: Array<{ category: FileCategory; count: number }>;
  /** Warnings about changeset characteristics */
  warnings: ChangesetWarning[];
}

type ChangesetWarning = LargeDiffWarning | LockfileMismatchWarning;

interface LargeDiffWarning {
  type: "large-diff";
  filesChanged: number;
  linesChanged: number;
}

interface LockfileMismatchWarning {
  type: "lockfile-mismatch";
  manifestChanged: boolean;
  lockfileChanged: boolean;
}
```

**Note:** In schema version 2.0, meta-findings (`file-summary`, `file-category`, `large-diff`, `lockfile-mismatch`) are no longer included in the `findings` array. Their data is now in the `changeset` structure.

---

## Action

Recommended action for AI agents to consider. Actions provide context about what needs attention and why, without prescribing specific commands.

```typescript
type ActionCategory =
  | "tests"
  | "types"
  | "database"
  | "environment"
  | "dependencies"
  | "cloudflare"
  | "documentation";

interface Action {
  id: string;              // Unique identifier (e.g., "run-tests", "apply-migrations")
  category: ActionCategory; // Grouping category
  blocking: boolean;        // Whether this blocks PR merge
  reason: string;           // Human-readable explanation
  triggers: string[];       // Context about what triggered this action
}
```

**Design Philosophy:**

Actions focus on **what** needs attention and **why**, not **how** to do it. AI agents have more context about the project's setup (package manager, CI system, deployment target) to determine the appropriate commands.

**Example:**

```json
{
  "id": "apply-migrations",
  "category": "database",
  "blocking": true,
  "reason": "Apply database migrations in a safe environment and verify data integrity before production",
  "triggers": [
    "1 migration file(s) changed",
    "DROP TABLE detected",
    "DANGEROUS SQL DETECTED (DROP, TRUNCATE, or destructive operations)"
  ]
}
```

---

## Summary

High-level summary of the changeset for quick understanding.

```typescript
interface Summary {
  byArea: Record<string, number>; // Finding counts grouped by area
  highlights: string[];           // Priority-ordered summary bullets
}
```

### Highlights

The `highlights` array contains human-readable summary bullets about the most important changes. Highlights are **priority-ordered** (impact-first):

| Priority | Category | Examples |
|----------|----------|----------|
| Highest | Blast radius | "2 file(s) with high blast radius" |
| High | Breaking changes | "TypeScript config changed (breaking)" |
| High | Risk/security | "Destructive SQL detected", "CI workflow security changes" |
| Medium | Dependency warnings | "Lockfile mismatch: package.json changed but lockfile not updated" |
| Medium | General changes | "Infrastructure changes: docker, terraform", "3 route(s) changed" |
| Lower | API surface | "2 Stencil component(s) with API changes", "3 new environment variable(s)" |
| Lowest | Test coverage | "5 test file(s) modified", "2 modified file(s) lack test coverage" |

**Ordering guarantees:**
- Items are sorted by priority (higher impact first)
- Items with the same priority maintain stable insertion order
- Output is deterministic across runs

---

## FactsOutput

The complete output of the `facts` command.

```typescript
interface FactsOutput {
  schemaVersion: string;        // "2.1"
  generatedAt?: string;         // ISO timestamp
  git: GitInfo;
  profile: ProfileInfo;
  stats: Stats;
  filters: Filters;
  summary: Summary;
  categories: CategoryAggregate[];
  changeset: ChangesetInfo;     // NEW in 2.0: organizational data
  risk: RiskScore;
  findings: Finding[];          // Domain-specific findings only
  actions: Action[];
  skippedFiles: SkippedFile[];
  warnings: string[];
}
```

---

## RiskReport Output

The `risk-report` command emits a separate schema (`schemaVersion: "2.0"`).

```typescript
type RiskReportLevel = "low" | "moderate" | "elevated" | "high" | "critical";
type RiskCategory = "security" | "ci" | "deps" | "db" | "infra" | "api" | "tests" | "churn";

interface RiskFlag {
  ruleKey: string;
  flagId: string;
  relatedFindingIds: string[];
  category: RiskCategory;
  score: number;
  confidence: number;
  title: string;
  summary: string;
  effectiveScore: number;
}

interface RiskReport {
  schemaVersion: "2.0";
  generatedAt?: string;
  range: { base: string; head: string; mode?: DiffMode };
  riskScore: number;
  riskLevel: RiskReportLevel;
  categoryScores: Record<RiskCategory, number>;
  flags: RiskFlag[];
  skippedFiles: Array<{ file: string; reason: string }>;
}
```

---

## Error Types

```typescript
class BranchNarratorError extends Error {
  exitCode: number = 1;
}

class NotAGitRepoError extends BranchNarratorError {
  message = "Not a git repository";
}

class InvalidRefError extends BranchNarratorError {
  constructor(ref: string) {
    super(`Invalid git reference: ${ref}`);
  }
}

class GitCommandError extends BranchNarratorError {
  constructor(command: string, stderr: string) {
    super(`Git command failed: ${command}\n${stderr}`);
  }
}
```

---

## Exports

All types are exported from `src/core/types.ts` and re-exported from the library:

```typescript
import type {
  ChangeSet,
  FileChange,
  FileDiff,
  Finding,
  RiskScore,
  Analyzer,
  Profile,
  RenderContext,
} from "branch-narrator";
```

