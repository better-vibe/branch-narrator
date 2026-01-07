# File Category Analyzer

**File:** `src/analyzers/file-category.ts`
**Finding Type:** `file-category`

## Purpose

Categorizes files into meaningful groups for better PR organization.

## Categories

| Category | Description | Example Paths |
|----------|-------------|---------------|
| `product` | Application code | `src/`, `lib/`, `app/` |
| `tests` | Test files | `tests/`, `src/tests/`, `*.test.ts`, `*.spec.ts` |
| `ci` | CI/CD configuration | `.github/workflows/`, `Jenkinsfile` |
| `infra` | Infrastructure | `Dockerfile`, `helm/`, `terraform/` |
| `database` | Database files | `supabase/migrations/`, `prisma/`, `*.sql` |
| `docs` | Documentation | `docs/`, `*.md`, `README` |
| `dependencies` | Package manifests | `package.json`, lockfiles |
| `config` | Configuration | `*.config.*`, `.env*`, `tsconfig` |
| `other` | Uncategorized | Everything else |

## Finding Type

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

## Detection Rules (Priority Order)

1. **tests** - `tests/`, `src/tests/`, `__tests__/`, `*.test.*`, `*.spec.*`, `vitest.config.*`
2. **ci** - `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`
3. **infra** - `Dockerfile`, `docker-compose*`, `helm/`, `terraform/`, `k8s/`
4. **database** - `supabase/migrations/`, `prisma/migrations/`, `drizzle/`, `migrations/`, `*.sql`
5. **docs** - `docs/`, `*.md`, `README*`, `CHANGELOG*`
6. **dependencies** - `package.json`, `*lock*`, `Cargo.toml`, `requirements.txt`
7. **config** - `.*rc`, `*.config.*`, `.env*`, `tsconfig*`
8. **product** - `src/`, `lib/`, `app/`, `*.ts`, `*.svelte`

## Example Output

```json
{
  "type": "file-category",
  "categories": {
    "product": ["src/lib/auth.ts", "src/routes/+page.svelte"],
    "tests": ["tests/auth.test.ts"],
    "ci": [],
    "infra": [],
    "database": ["supabase/migrations/001_init.sql"],
    "docs": ["README.md"],
    "dependencies": ["package.json"],
    "config": ["tsconfig.json"],
    "other": []
  },
  "summary": [
    { "category": "product", "count": 2 },
    { "category": "database", "count": 1 },
    { "category": "tests", "count": 1 },
    { "category": "docs", "count": 1 },
    { "category": "dependencies", "count": 1 },
    { "category": "config", "count": 1 }
  ]
}
```

## Usage in Markdown

Creates the **What Changed** section:

```markdown
## What Changed

### Product Code (2)

- `src/lib/auth.ts`
- `src/routes/+page.svelte` *(new)*

### Tests (1)

- `tests/auth.test.ts` *(new)*

### Documentation (1)

- `README.md`
```

## Helper Functions

```typescript
// Categorize a single file
categorizeFile(path: string): FileCategory

// Get human-readable label
getCategoryLabel(category: FileCategory): string
// "product" → "Product Code"
// "ci" → "CI/CD"
```

