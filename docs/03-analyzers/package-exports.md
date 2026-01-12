# Package Exports Analyzer

**File:** `src/analyzers/package-exports.ts`
**Finding Type:** `package-exports`

## Purpose

Detects changes to package.json `exports` field and legacy entry points (`main`, `module`, `types`, `bin`), which are critical for library consumers. Removing exports is considered a breaking change.

## Finding Type

```typescript
interface PackageExportsFinding {
  type: "package-exports";
  kind: "package-exports";
  category: "api";
  confidence: Confidence;
  evidence: Evidence[];
  isBreaking: boolean;
  addedExports: string[];
  removedExports: string[];
  legacyFieldChanges: Array<{
    field: string;
    from?: string;
    to?: string;
  }>;
  binChanges: {
    added: string[];
    removed: string[];
  };
}
```

## Detection Rules

The analyzer compares `package.json` between base and head commits.

### Exports Field
Tracks changes to the `exports` field (Node.js package entry points):

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./utils": "./dist/utils.js",
    "./components/*": "./dist/components/*.js"
  }
}
```

### Legacy Entry Points
Tracks changes to legacy fields:
- `main` - CommonJS entry point
- `module` - ES module entry point
- `types` / `typings` - TypeScript declarations
- `browser` - Browser-specific entry

### Binary Entry Points
Tracks changes to the `bin` field (CLI commands):

```json
{
  "bin": {
    "mycli": "./bin/cli.js"
  }
}
```

## Breaking Change Detection

| Change Type | Breaking? | Reason |
|-------------|-----------|--------|
| Export removed | Yes | Consumers may import this path |
| Export added | No | Additive change |
| main/module removed | Yes | Consumers may use this entry |
| main/module changed | Maybe | May break if path changed |
| bin removed | Yes | CLI command no longer available |
| bin added | No | New CLI command |

## Example Output

### Removed Export (Breaking)

```json
{
  "type": "package-exports",
  "kind": "package-exports",
  "category": "api",
  "confidence": "high",
  "isBreaking": true,
  "addedExports": [],
  "removedExports": ["./utils", "./legacy"],
  "legacyFieldChanges": [],
  "binChanges": {
    "added": [],
    "removed": []
  }
}
```

### Added Export (Non-Breaking)

```json
{
  "type": "package-exports",
  "kind": "package-exports",
  "category": "api",
  "confidence": "low",
  "isBreaking": false,
  "addedExports": ["./new-feature"],
  "removedExports": [],
  "legacyFieldChanges": [],
  "binChanges": {
    "added": [],
    "removed": []
  }
}
```

### Legacy Field Changes

```json
{
  "type": "package-exports",
  "kind": "package-exports",
  "category": "api",
  "confidence": "medium",
  "isBreaking": false,
  "addedExports": [],
  "removedExports": [],
  "legacyFieldChanges": [
    {
      "field": "main",
      "from": "./dist/index.cjs",
      "to": "./dist/index.js"
    },
    {
      "field": "types",
      "from": undefined,
      "to": "./dist/index.d.ts"
    }
  ],
  "binChanges": {
    "added": [],
    "removed": []
  }
}
```

## Conditional Exports

The analyzer handles conditional exports by flattening them:

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./utils": {
      "import": "./dist/utils.mjs",
      "require": "./dist/utils.cjs"
    }
  }
}
```

This is tracked as two export paths: `.` and `./utils`.

## Profiles

Included in:
- Library profile

## Use Case

This analyzer is particularly useful for:
- npm package maintainers
- Library authors
- CLI tool developers
- Anyone publishing to npm registries
