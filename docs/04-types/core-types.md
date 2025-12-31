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

interface RiskScore {
  score: number;           // 0-100
  level: RiskLevel;
  evidenceBullets: string[];
}
```

**Thresholds:**

| Score | Level |
|-------|-------|
| 0-19 | `low` |
| 20-49 | `medium` |
| 50-100 | `high` |

---

## Analyzer

Interface for all analyzers.

```typescript
interface Analyzer {
  name: string;
  analyze(changeSet: ChangeSet): Finding[];
}
```

---

## Profile

Profile configuration.

```typescript
type ProfileName = "auto" | "sveltekit";

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

