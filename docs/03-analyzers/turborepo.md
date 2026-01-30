# Turborepo Analyzer

Detects changes to Turborepo configuration (`turbo.json`) and identifies potentially breaking changes such as task pipeline modifications and cache invalidation changes.

## File Location
`src/analyzers/turborepo.ts`

## Finding Type
`TurborepoConfigFinding`

## Detection Rules
- Detects `turbo.json` and `turbo.jsonc` files
- Identifies affected sections: tasks, pipeline, globalDependencies, globalEnv, remoteCache, etc.
- Detects breaking changes: task definitions, pipeline changes, global dependencies, cache disabling, remote cache config
- Skips files with no meaningful changes (e.g., only `$schema` updates)

## Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path to the changed config file |
| `status` | `FileStatus` | File change status |
| `isBreaking` | `boolean` | Whether the change is breaking |
| `affectedSections` | `string[]` | Config sections affected |
| `breakingReasons` | `string[]` | Reasons the change is breaking |

## Example Output
```json
{
  "type": "turborepo-config",
  "kind": "turborepo-config",
  "category": "config_env",
  "confidence": "high",
  "file": "turbo.json",
  "status": "modified",
  "isBreaking": true,
  "affectedSections": ["tasks", "globalDependencies"],
  "breakingReasons": ["Task definitions changed", "Global dependencies changed (affects cache invalidation)"]
}
```
