# Monorepo Config Analyzer

**File:** `src/analyzers/monorepo.ts`
**Finding Type:** `monorepo-config`

## Purpose

Detects changes to monorepo configuration files for various tools (Turborepo, pnpm workspaces, Lerna, Nx, Yarn, npm workspaces, and Changesets), identifying potentially impactful modifications.

## Finding Type

```typescript
type MonorepoTool =
  | "turborepo"
  | "pnpm"
  | "lerna"
  | "nx"
  | "yarn"
  | "npm"
  | "changesets";

interface MonorepoConfigFinding {
  type: "monorepo-config";
  kind: "monorepo-config";
  category: "config_env";
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  status: FileStatus;
  tool: MonorepoTool;
  affectedFields: string[];
  impacts: string[];
}
```

## Detection Rules

| File Pattern | Tool | Description |
|--------------|------|-------------|
| `turbo.json` | turborepo | Turborepo pipeline config |
| `pnpm-workspace.yaml` | pnpm | pnpm workspace definition |
| `pnpm-workspace.yml` | pnpm | pnpm workspace definition |
| `lerna.json` | lerna | Lerna configuration |
| `nx.json` | nx | Nx workspace config |
| `project.json` | nx | Nx project config |
| `.yarnrc.yml` | yarn | Yarn Berry config |
| `.yarnrc` | yarn | Yarn Classic config |
| `package.json` (workspaces) | npm | npm workspaces |
| `.changeset/config.json` | changesets | Changesets config |

## Critical Fields by Tool

### Turborepo
- `pipeline` / `tasks` - Build pipeline definition
- `globalDependencies` - Global cache invalidation files
- `globalEnv` - Global environment variables

### pnpm
- `packages` - Workspace package patterns

### Lerna
- `packages` - Package locations
- `version` - Version mode (fixed/independent)
- `npmClient` - Package manager
- `useWorkspaces` - Workspaces integration

### Nx
- `targetDefaults` - Default target configuration
- `namedInputs` - Named input definitions
- `plugins` - Nx plugin configuration
- `defaultProject` - Default project

### Yarn
- `nodeLinker` - Module installation strategy
- `enableGlobalCache` - Cache settings
- `nmMode` - Node modules mode

### npm
- `workspaces` - Workspace package patterns

### Changesets
- `baseBranch` - Base branch for versioning
- `access` - Publish access level
- `changelog` - Changelog configuration

## Impact Detection

| Tool | Change | Impact |
|------|--------|--------|
| turborepo | Pipeline/tasks changed | Build pipeline configuration changed |
| turborepo | Cache disabled | Caching disabled for tasks |
| turborepo | globalDependencies changed | Global dependencies changed (affects cache) |
| lerna | version: "independent" | Switching to independent versioning |
| lerna | npmClient changed | npm client configuration changed |
| nx | targetDefaults changed | Default target configuration changed |
| nx | plugins changed | Nx plugins configuration changed |
| yarn | nodeLinker changed | Node linker strategy changed |
| changesets | baseBranch changed | Base branch for changesets modified |
| changesets | access changed | Package publish access level changed |

## Example Output

### Turborepo Pipeline Change

```json
{
  "type": "monorepo-config",
  "kind": "monorepo-config",
  "category": "config_env",
  "confidence": "high",
  "file": "turbo.json",
  "status": "modified",
  "tool": "turborepo",
  "affectedFields": ["pipeline"],
  "impacts": [
    "Build pipeline configuration changed"
  ]
}
```

### Lerna Version Mode Change

```json
{
  "type": "monorepo-config",
  "kind": "monorepo-config",
  "category": "config_env",
  "confidence": "high",
  "file": "lerna.json",
  "status": "modified",
  "tool": "lerna",
  "affectedFields": ["version"],
  "impacts": [
    "Switching to independent versioning"
  ]
}
```

## Profiles

Included in:
- Library profile
