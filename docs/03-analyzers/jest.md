# Jest Analyzer

Detects changes to Jest configuration files and identifies potentially breaking configuration changes.

## File Location
`src/analyzers/jest.ts`

## Finding Type
`JestConfigFinding`

## Detection Rules
- Detects `jest.config.{ts,js,mjs,cjs,json}` files (including suffixed variants like `jest.config.e2e.ts`)
- Detects `jest.setup.{ts,js,mjs,cjs}` files
- Identifies affected sections: transform, moduleNameMapper, testEnvironment, preset, etc.
- Detects breaking changes: environment, transform, module mappings, preset, globals, test match changes

## Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path to the changed config file |
| `status` | `FileStatus` | File change status |
| `affectedSections` | `string[]` | Config sections affected by the change |
| `isBreaking` | `boolean` | Whether the change is breaking |
| `breakingReasons` | `string[]` | Reasons the change is breaking |

## Example Output
```json
{
  "type": "jest-config",
  "kind": "jest-config",
  "category": "tests",
  "confidence": "high",
  "file": "jest.config.ts",
  "status": "modified",
  "affectedSections": ["testEnvironment", "transform"],
  "isBreaking": true,
  "breakingReasons": ["Test environment changed", "Transform configuration changed"]
}
```
