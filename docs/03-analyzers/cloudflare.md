# Cloudflare Analyzer

**File:** `src/analyzers/cloudflare.ts`
**Finding Type:** `cloudflare-change`

## Purpose

Detects Cloudflare-related configuration changes.

## Finding Type

```typescript
type CloudflareArea = "wrangler" | "pages" | "workers" | "ci";

interface CloudflareChangeFinding {
  type: "cloudflare-change";
  area: CloudflareArea;
  files: string[];
}
```

## Detection Rules

| Trigger | Area |
|---------|------|
| `wrangler.toml` changed | `wrangler` |
| `wrangler.json` changed | `wrangler` |
| `.github/workflows/*` contains "wrangler" | `ci` |
| `.github/workflows/*` contains "cloudflare" | `ci` |

## Example Output

### Wrangler Config Change

```json
{
  "type": "cloudflare-change",
  "area": "wrangler",
  "files": ["wrangler.toml"]
}
```

### CI Workflow Change

```json
{
  "type": "cloudflare-change",
  "area": "ci",
  "files": [".github/workflows/deploy.yml"]
}
```

## Workflow Detection

Scans workflow file diff additions for keywords:

```yaml
# Triggers detection
- name: Deploy to Cloudflare
  uses: cloudflare/wrangler-action@v3
```

## Usage in Markdown

```markdown
## Cloudflare

**Area:** wrangler
**Files:**
- `wrangler.toml`

**Area:** ci
**Files:**
- `.github/workflows/deploy.yml`
```

## Future Enhancements

Planned for future versions:
- Detect D1 database changes
- Detect KV namespace changes
- Detect R2 bucket changes
- Parse wrangler.toml for breaking changes

