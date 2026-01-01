# JSON Rendering

The JSON renderer generates machine-readable output for the `facts` command.

## Entry Point

```typescript
function renderJson(
  context: RenderContext,
  options?: RenderJsonOptions
): string;
```

## Output Structure

### Enhanced Format (with options)

```typescript
interface EnhancedFactsOutput {
  schemaVersion: string;
  mode: DiffMode;
  base: string | null;
  head: string | null;
  profile: string;
  riskScore: RiskScore;
  findings: Finding[];
  stats: {
    totalFindings: number;
    findingsByType: Record<string, number>;
  };
}
```

### Legacy Format (without options)

```typescript
interface FactsOutput {
  profile: ProfileName;
  riskScore: RiskScore;
  findings: Finding[];
}
```

## Example Output

### Enhanced Format (Default)

```json
{
  "schemaVersion": "1.0",
  "mode": "branch",
  "base": "main",
  "head": "HEAD",
  "profile": "sveltekit",
  "riskScore": {
    "score": 45,
    "level": "medium",
    "evidenceBullets": [
      "⚠️ Major version bump: @sveltejs/kit ^1.0.0 → ^2.0.0",
      "⚡ Security-sensitive files changed (Authentication): 2 file(s)",
      "ℹ️ New env var: PUBLIC_API_URL"
    ]
  },
  "findings": [
    {
      "type": "file-summary",
      "added": ["src/routes/login/+page.svelte"],
      "modified": ["package.json"],
      "deleted": [],
      "renamed": []
    },
    {
      "type": "file-category",
      "categories": {
        "product": ["src/routes/login/+page.svelte"],
        "tests": [],
        "ci": [],
        "infra": [],
        "docs": [],
        "dependencies": ["package.json"],
        "config": [],
        "other": []
      },
      "summary": [
        { "category": "product", "count": 1 },
        { "category": "dependencies", "count": 1 }
      ]
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
      "name": "@sveltejs/kit",
      "section": "dependencies",
      "from": "^1.0.0",
      "to": "^2.0.0",
      "impact": "major"
    }
  ],
  "stats": {
    "totalFindings": 4,
    "findingsByType": {
      "file-summary": 1,
      "file-category": 1,
      "route-change": 1,
      "dependency-change": 1
    }
  }
}
```

## Usage with jq

### Get Risk Level

```bash
branch-narrator facts | jq -r '.riskScore.level'
# Output: medium
```

### Get Risk Score

```bash
branch-narrator facts | jq '.riskScore.score'
# Output: 45
```

### Filter by Finding Type

```bash
# Route changes only
branch-narrator facts | jq '.findings[] | select(.type == "route-change")'

# Dependencies only
branch-narrator facts | jq '.findings[] | select(.type == "dependency-change")'
```

### Extract File Lists

```bash
# All added files
branch-narrator facts | jq -r '.findings[] | select(.type == "file-summary") | .added[]'

# Files by category
branch-narrator facts | jq '.findings[] | select(.type == "file-category") | .categories.product'
```

### Evidence Bullets

```bash
branch-narrator facts | jq -r '.riskScore.evidenceBullets[]'
```

### Statistics

```bash
# Get total number of findings
branch-narrator facts | jq '.stats.totalFindings'

# Get findings breakdown
branch-narrator facts | jq '.stats.findingsByType'

# Count specific finding type
branch-narrator facts | jq '.stats.findingsByType["route-change"]'
```

## Output Format Options

### JSON Format (Default)

Pretty-printed with 2-space indentation:

```bash
branch-narrator facts --format json
```

### Compact Format

Minified without whitespace (useful for piping):

```bash
branch-narrator facts --format compact | jq '.riskScore.level'
```

## Writing to File

```bash
# Write to file
branch-narrator facts --out analysis.json

# Compact to file
branch-narrator facts --format compact --out analysis.min.json
```

## Programmatic Usage

```typescript
import { execSync } from "child_process";

const output = execSync("npx branch-narrator facts").toString();
const facts = JSON.parse(output);

// Access data
console.log(`Risk: ${facts.riskScore.level}`);
console.log(`Score: ${facts.riskScore.score}/100`);

// Access stats
console.log(`Total findings: ${facts.stats.totalFindings}`);
console.log(`Route changes: ${facts.stats.findingsByType["route-change"] || 0}`);

// Filter findings
const routes = facts.findings.filter(f => f.type === "route-change");
const deps = facts.findings.filter(f => f.type === "dependency-change");
```

## Schema Validation

The JSON output follows the TypeScript types exactly. Each finding has a `type` discriminator field that determines its structure.

See [Types: Findings](../04-types/findings.md) for complete type definitions.

## Backward Compatibility

The legacy format (without metadata) is still available when using the renderer without options, ensuring backward compatibility with existing integrations.

