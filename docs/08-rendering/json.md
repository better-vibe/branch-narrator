# JSON Output

branch-narrator produces two JSON shapes:

1. **Facts output (canonical)** — emitted by the `facts` command and the recommended JSON contract for automation.
2. **Legacy `renderJson` helper** — a minimal `{ profile, riskScore, findings }` envelope used only in library contexts.

## Facts Output (Canonical)

The `facts` command emits a schema versioned envelope (`schemaVersion: "2.1"`) that includes metadata, summary, changeset details, and findings.

```typescript
interface FactsOutput {
  schemaVersion: string;
  generatedAt?: string;
  git: GitInfo;
  profile: ProfileInfo;
  stats: Stats;
  filters: Filters;
  summary: Summary;
  categories: CategoryAggregate[];
  changeset: ChangesetInfo;
  risk: RiskScore;
  findings: Finding[];
  actions: Action[];
  skippedFiles: SkippedFile[];
  warnings: string[];
}
```

### Example Output (Truncated)

```json
{
  "schemaVersion": "2.1",
  "git": { "base": "main", "head": "HEAD", "range": "main..HEAD" },
  "profile": { "requested": "auto", "detected": "sveltekit", "confidence": "high" },
  "stats": { "filesChanged": 12, "insertions": 245, "deletions": 89, "skippedFilesCount": 0 },
  "summary": { "highlights": ["2 route(s) changed", "Lockfile mismatch detected"] },
  "changeset": {
    "files": { "added": ["src/routes/login/+page.svelte"], "modified": ["package.json"], "deleted": [], "renamed": [] },
    "warnings": [{ "type": "lockfile-mismatch", "manifestChanged": true, "lockfileChanged": false }]
  },
  "risk": { "score": 35, "level": "medium" },
  "findings": [
    { "type": "route-change", "routeId": "/login", "change": "added", "routeType": "page" }
  ]
}
```

## Legacy `renderJson` Helper

The `renderJson` helper (in `src/render/json.ts`) returns a minimal envelope used for library-only cases.
It is **not** the same schema as `facts` and is not used by CLI commands.

```typescript
interface JsonOutput {
  profile: ProfileName;
  riskScore: RiskScore;
  findings: Finding[];
}
```

## Usage with jq (Facts Output)

```bash
# Get risk level
branch-narrator facts | jq -r '.risk.level'

# Get added files
branch-narrator facts | jq -r '.changeset.files.added[]'

# Filter by finding type
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'
```

## Schema Validation

Facts output follows the TypeScript definitions in `src/core/types.ts`.
Each finding uses a `type` discriminator. See [Types: Findings](../04-types/findings.md) for the full schema.

