# JSON Rendering

The JSON renderer generates machine-readable output.

## Entry Point

```typescript
function renderJson(context: RenderContext): string;
```

## Output Structure

```typescript
interface JsonOutput {
  profile: ProfileName;
  riskScore: RiskScore;
  findings: Finding[];
}
```

## Example Output

```json
{
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
  ]
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

## Programmatic Usage

```typescript
import { execSync } from "child_process";

const output = execSync("npx branch-narrator facts").toString();
const facts = JSON.parse(output);

// Access data
console.log(`Risk: ${facts.riskScore.level}`);
console.log(`Score: ${facts.riskScore.score}/100`);

// Filter findings
const routes = facts.findings.filter(f => f.type === "route-change");
const deps = facts.findings.filter(f => f.type === "dependency-change");
```

## Schema Validation

The JSON output follows the TypeScript types exactly. Each finding has a `type` discriminator field that determines its structure.

See [Types: Findings](../04-types/findings.md) for complete type definitions.

