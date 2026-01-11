# Finding Types

All findings use a discriminated union pattern with `type` as the discriminator.

## Schema Version 2.0 Changes

In schema version 2.0, findings are split into two categories:

1. **Domain Findings** - Appear in the `findings` array. These represent specific changes in a domain area (routes, database, tests, etc.)

2. **Meta Findings** - Appear in the `changeset` structure. These describe the changeset as a whole, not domain-specific changes:
   - `file-summary` → `changeset.files`
   - `file-category` → `changeset.byCategory` and `changeset.categorySummary`
   - `large-diff` → `changeset.warnings`
   - `lockfile-mismatch` → `changeset.warnings`

## Finding Union (Domain Findings)

```typescript
type Finding =
  | DependencyChangeFinding
  | RouteChangeFinding
  | EnvVarFinding
  | DbMigrationFinding
  | CloudflareChangeFinding
  | TestChangeFinding
  | RiskFlagFinding
  | SecurityFileFinding
  | ConventionViolationFinding
  | TestParityViolationFinding  // Opt-in via --test-parity flag
  | ImpactAnalysisFinding
  | SQLRiskFinding
  | CIWorkflowFinding
  | InfraChangeFinding
  | APIContractChangeFinding
  | TestGapFinding;
```

## Class Diagram

```mermaid
classDiagram
    Finding <|-- DependencyChangeFinding
    Finding <|-- RouteChangeFinding
    Finding <|-- EnvVarFinding
    Finding <|-- DbMigrationFinding
    Finding <|-- CloudflareChangeFinding
    Finding <|-- TestChangeFinding
    Finding <|-- RiskFlagFinding
    Finding <|-- SecurityFileFinding
    Finding <|-- ImpactAnalysisFinding

    class Finding {
        <<discriminated union>>
        type: string
        category: Category
    }
```

---

## Meta Findings (in changeset structure)

These findings are no longer in the `findings` array. Their data is in `changeset`:

### FileSummaryFinding → `changeset.files`

```typescript
// Old (in findings array):
interface FileSummaryFinding {
  type: "file-summary";
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}

// New (in changeset):
changeset.files = {
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}
```

### FileCategoryFinding → `changeset.byCategory`

```typescript
// Old (in findings array):
interface FileCategoryFinding {
  type: "file-category";
  categories: Record<FileCategory, string[]>;
  summary: Array<{ category: FileCategory; count: number }>;
}

// New (in changeset):
changeset.byCategory = Record<FileCategory, string[]>;
changeset.categorySummary = Array<{ category: FileCategory; count: number }>;
```

### LargeDiffFinding → `changeset.warnings`

```typescript
// Old (in findings array):
interface LargeDiffFinding {
  type: "large-diff";
  filesChanged: number;
  linesChanged: number;
}

// New (in changeset.warnings):
{ type: "large-diff", filesChanged: number, linesChanged: number }
```

### LockfileFinding → `changeset.warnings`

```typescript
// Old (in findings array):
interface LockfileFinding {
  type: "lockfile-mismatch";
  manifestChanged: boolean;
  lockfileChanged: boolean;
}

// New (in changeset.warnings):
{ type: "lockfile-mismatch", manifestChanged: boolean, lockfileChanged: boolean }
```

---

## Domain Findings

These findings appear in the `findings` array and have meaningful `category` values.

## FileSummaryFinding

```typescript
interface FileSummaryFinding {
  type: "file-summary";
  added: string[];
  modified: string[];
  deleted: string[];
  renamed: Array<{ from: string; to: string }>;
}
```

---

## FileCategoryFinding

```typescript
type FileCategory =
  | "product"
  | "tests"
  | "ci"
  | "infra"
  | "database"
  | "docs"
  | "dependencies"
  | "config"
  | "artifacts"
  | "other";

interface FileCategoryFinding {
  type: "file-category";
  categories: Record<FileCategory, string[]>;
  summary: Array<{
    category: FileCategory;
    count: number;
  }>;
}
```

### Database Category Patterns

Files matching these patterns are categorized as `database`:
- `supabase/migrations/*` - Supabase migrations
- `supabase/seed*` - Supabase seed files
- `prisma/migrations/*` - Prisma migrations
- `prisma/schema.prisma` - Prisma schema
- `drizzle/migrations/*` - Drizzle migrations
- `drizzle.config*` - Drizzle config
- `migrations/` or `*/migrations/` - Generic migration directories
- `*.sql` - SQL files

---

## DependencyChangeFinding

```typescript
interface DependencyChangeFinding {
  type: "dependency-change";
  name: string;
  section: "dependencies" | "devDependencies";
  from?: string;
  to?: string;
  impact?: "major" | "minor" | "patch" | "new" | "removed" | "unknown";
  riskCategory?: "auth" | "database" | "native" | "payment";
}
```

---

## RouteChangeFinding

```typescript
type RouteType = "page" | "layout" | "endpoint" | "error" | "unknown";

interface RouteChangeFinding {
  type: "route-change";
  routeId: string;
  file: string;
  change: FileStatus;
  routeType: RouteType;
  methods?: string[];
}
```

---

## EnvVarFinding

```typescript
type EnvVarChange = "added" | "touched";

interface EnvVarFinding {
  type: "env-var";
  name: string;
  change: EnvVarChange;
  evidenceFiles: string[];
}
```

---

## DbMigrationFinding

```typescript
type MigrationRisk = "high" | "medium" | "low";

interface DbMigrationFinding {
  type: "db-migration";
  tool: "supabase";
  files: string[];
  risk: MigrationRisk;
  reasons: string[];
}
```

---

## CloudflareChangeFinding

```typescript
type CloudflareArea = "wrangler" | "pages" | "workers" | "ci";

interface CloudflareChangeFinding {
  type: "cloudflare-change";
  area: CloudflareArea;
  files: string[];
}
```

---

## TestChangeFinding

```typescript
interface TestChangeFinding {
  type: "test-change";
  framework: "vitest";
  files: string[];
}
```

---

## RiskFlagFinding

```typescript
type RiskLevel = "high" | "medium" | "low";

interface RiskFlagFinding {
  type: "risk-flag";
  risk: RiskLevel;
  evidence: string;
}
```

---

## SecurityFileFinding

```typescript
type SecurityFileReason =
  | "auth-path"
  | "session-path"
  | "permission-path"
  | "middleware"
  | "guard"
  | "policy";

interface SecurityFileFinding {
  type: "security-file";
  files: string[];
  reasons: SecurityFileReason[];
}
```

---

## ConventionViolationFinding

```typescript
interface ConventionViolationFinding {
  type: "convention-violation";
  message: string;
  files: string[];
}
```

---

## TestParityViolationFinding

Emitted when a source file is modified/added without a corresponding test file. This finding is only generated when the `--test-parity` flag is used (opt-in).

```typescript
interface TestParityViolationFinding {
  type: "test-parity-violation";
  kind: "test-parity-violation";
  category: "tests";
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
  sourceFile: string;
  expectedTestLocations: string[];
  findingId?: string;
}
```

### Confidence Levels

- **high**: Core business logic files (services, handlers, commands)
- **medium**: Utility/helper files
- **low**: Small changes or edge cases

### Example

```json
{
  "type": "test-parity-violation",
  "kind": "test-parity-violation",
  "category": "tests",
  "confidence": "high",
  "sourceFile": "src/services/auth.ts",
  "expectedTestLocations": [
    "src/services/auth.test.ts",
    "tests/services/auth.test.ts",
    "tests/auth.test.ts"
  ],
  "evidence": [
    {
      "file": "src/services/auth.ts",
      "excerpt": "Source file modified without corresponding test: src/services/auth.ts"
    }
  ]
}
```

---

## ImpactAnalysisFinding

```typescript
interface ImpactAnalysisFinding {
  type: "impact-analysis";
  sourceFile: string;
  affectedFiles: string[];
  importedSymbols?: string[]; // e.g. ["User", "login"]
  usageContext?: string; // e.g. "import { User } from './user'"
  isTestFile?: boolean; // true if all affected files are tests
  blastRadius: "low" | "medium" | "high";
}
```

---

## JSON Example

```json
{
  "findings": [
    {
      "type": "file-summary",
      "added": ["src/routes/login/+page.svelte"],
      "modified": ["package.json"],
      "deleted": [],
      "renamed": []
    },
    {
      "type": "route-change",
      "routeId": "/login",
      "file": "src/routes/login/+page.svelte",
      "change": "added",
      "routeType": "page"
    },
    {
      "type": "dependency-change",
      "name": "lucia",
      "section": "dependencies",
      "to": "^3.0.0",
      "impact": "new",
      "riskCategory": "auth"
    },
    {
      "type": "risk-flag",
      "risk": "medium",
      "evidence": "New Authentication/Security package: lucia"
    }
  ]
}
```

