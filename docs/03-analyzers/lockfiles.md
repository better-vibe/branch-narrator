# Lockfile Analyzer

**File:** `src/analyzers/lockfiles.ts`
**Finding Type:** `lockfile-mismatch`

## Purpose

Detects mismatches between dependency changes in `package.json` and lockfile updates.

## Finding Type

```typescript
interface LockfileFinding {
  type: "lockfile-mismatch";
  manifestChanged: boolean;
  lockfileChanged: boolean;
}
```

## Detection Rules

| Trigger | Result |
|---------|--------|
| Dependency changes in `package.json` without lockfile updates | `lockfile-mismatch` |
| Lockfile changed without `package.json` present | `lockfile-mismatch` |

**Supported lockfiles:**
`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `bun.lock`

## Example Output

```json
{
  "type": "lockfile-mismatch",
  "manifestChanged": true,
  "lockfileChanged": false
}
```

## Usage in Markdown

```markdown
### Warnings

- **Lockfile mismatch:** package.json changed but lockfile not updated
```
