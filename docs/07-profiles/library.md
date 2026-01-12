# Library Profile

**File:** `src/profiles/library.ts`
**Profile Name:** `library`

## Purpose

The Library profile is optimized for npm package and library development. It focuses on API surface changes, breaking change detection, and package metadata that matters for library consumers.

## Detection

The Library profile is automatically detected when:

1. **Exports field:** `exports` in package.json
2. **Publish config:** `publishConfig` in package.json
3. **Public package:** `private: false` in package.json
4. **CLI tool:** `bin` field in package.json

```bash
# Force Library profile
branch-narrator --profile library
```

## Analyzers Included

| Analyzer | Purpose |
|----------|---------|
| `file-summary` | File change summary |
| `file-category` | File categorization |
| `package-exports` | Package entry point changes |
| `typescript-config` | TypeScript configuration |
| `dependencies` | Package dependency changes |
| `vitest` | Test file changes |
| `impact` | Blast radius analysis |
| `monorepo` | Monorepo configuration |
| `large-diff` | Large changeset warnings |
| `lockfiles` | Lockfile mismatch detection |
| `test-gaps` | Test coverage gaps |
| `ci-workflows` | CI/CD security |
| `api-contracts` | API contract changes |

## Library-Specific Detection

### Package Exports

Tracks changes to the `exports` field:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./utils": "./dist/utils.js",
    "./package.json": "./package.json"
  }
}
```

### Legacy Entry Points

Tracks changes to:
- `main` - CommonJS entry point
- `module` - ES module entry point
- `types` / `typings` - TypeScript declarations
- `browser` - Browser-specific entry

### CLI Binaries

Tracks changes to the `bin` field:

```json
{
  "bin": {
    "mycli": "./bin/cli.js",
    "mycli-debug": "./bin/debug.js"
  }
}
```

## Breaking Change Detection

| Change | Breaking? | Reason |
|--------|-----------|--------|
| Export path removed | Yes | Consumers may import this path |
| Export path added | No | Additive change |
| main/module removed | Yes | Consumers may use this entry |
| bin command removed | Yes | CLI users affected |
| TypeScript config stricter | Maybe | May cause type errors |

## Example Output

### Markdown Summary

```markdown
## Package API

**Breaking Changes Detected:**
- Removed export: `./utils`
- Removed export: `./legacy`

**Added Exports:**
- `./new-feature`

**Entry Point Changes:**
- `main`: `./dist/index.cjs` → `./dist/index.js`
```

### JSON Finding

```json
{
  "type": "package-exports",
  "kind": "package-exports",
  "category": "api",
  "confidence": "high",
  "isBreaking": true,
  "addedExports": ["./new-feature"],
  "removedExports": ["./utils", "./legacy"],
  "legacyFieldChanges": [
    {
      "field": "main",
      "from": "./dist/index.cjs",
      "to": "./dist/index.js"
    }
  ],
  "binChanges": {
    "added": [],
    "removed": []
  }
}
```

## Monorepo Support

The Library profile includes monorepo detection:

- Turborepo (`turbo.json`)
- pnpm workspaces (`pnpm-workspace.yaml`)
- Lerna (`lerna.json`)
- Nx (`nx.json`)
- npm/Yarn workspaces
- Changesets (`.changeset/config.json`)

## Usage

```bash
# Auto-detect (recommended)
branch-narrator

# Force Library profile
branch-narrator --profile library

# JSON output
branch-narrator facts --profile library

# Risk report (for breaking changes)
branch-narrator risk-report --profile library
```

## Best Practices

When developing libraries:

1. **Track exports carefully** - Removed exports are breaking changes
2. **Update version appropriately** - Use semver for breaking changes
3. **Document changes** - Include migration guides for breaking changes
4. **Run the risk report** - Check for potential issues before release

## Related Profiles

- **Default:** For general projects
- **Stencil:** For Stencil component libraries
