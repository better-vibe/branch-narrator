# TypeScript Config Analyzer

**File:** `src/analyzers/typescript-config.ts`
**Finding Type:** `typescript-config`

## Purpose

Detects changes to TypeScript configuration files and identifies potentially build-breaking or behavior-changing modifications, especially strictness-related options.

## Finding Type

```typescript
interface TypeScriptConfigFinding {
  type: "typescript-config";
  kind: "typescript-config";
  category: "config_env";
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  status: FileStatus;
  isBreaking: boolean;
  changedOptions: {
    added: string[];
    removed: string[];
    modified: string[];
  };
  strictnessChanges: string[];
}
```

## Detection Rules

| File Pattern | Description |
|--------------|-------------|
| `tsconfig.json` | Root TypeScript config |
| `tsconfig.*.json` | Named configs (build, node, lib) |
| `*/tsconfig.json` | Nested package configs |

## Critical Options Tracked

The analyzer considers these options as potentially breaking:

### Strictness Options
- `strict`, `strictNullChecks`, `strictFunctionTypes`
- `strictBindCallApply`, `strictPropertyInitialization`
- `noImplicitAny`, `noImplicitThis`, `noImplicitReturns`
- `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

### Module/Build Options
- `target`, `module`, `moduleResolution`
- `lib`, `jsx`, `esModuleInterop`
- `isolatedModules`, `verbatimModuleSyntax`

### Output Options
- `outDir`, `rootDir`, `baseUrl`, `paths`
- `declaration`, `declarationMap`, `sourceMap`

## Example Output

### Strictness Change

```json
{
  "type": "typescript-config",
  "kind": "typescript-config",
  "category": "config_env",
  "confidence": "high",
  "file": "tsconfig.json",
  "status": "modified",
  "isBreaking": true,
  "changedOptions": {
    "added": ["strict", "strictNullChecks"],
    "removed": [],
    "modified": []
  },
  "strictnessChanges": [
    "Added strict",
    "Added strictNullChecks"
  ]
}
```

### Module Change

```json
{
  "type": "typescript-config",
  "kind": "typescript-config",
  "category": "config_env",
  "confidence": "high",
  "file": "tsconfig.json",
  "status": "modified",
  "isBreaking": true,
  "changedOptions": {
    "added": [],
    "removed": [],
    "modified": ["module", "target"]
  },
  "strictnessChanges": []
}
```

## Confidence Levels

- **high**: Breaking changes (critical options modified/removed)
- **medium**: Non-critical options changed
- **low**: Minor changes detected

## Profiles

Included in:
- Default profile (auto)
- Vue profile
- Astro profile
- Library profile
