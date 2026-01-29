# Playwright Analyzer

Detects changes to Playwright configuration files and identifies potentially breaking changes.

## File Location
`src/analyzers/playwright.ts`

## Finding Type
`PlaywrightConfigFinding`

## Detection Rules
- Detects `playwright.config.{ts,js,mjs,cjs}` files
- Detects `playwright.ct.config.{ts,js}` (component testing)
- Identifies affected sections: projects, use, webServer, testDir, baseURL, etc.
- Detects breaking changes: project config, web server, test directory, base URL, global setup/teardown

## Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path to the changed config file |
| `status` | `FileStatus` | File change status |
| `affectedSections` | `string[]` | Config sections affected |
| `isBreaking` | `boolean` | Whether the change is breaking |
| `breakingReasons` | `string[]` | Reasons the change is breaking |

## Example Output
```json
{
  "type": "playwright-config",
  "kind": "playwright-config",
  "category": "tests",
  "confidence": "high",
  "file": "playwright.config.ts",
  "status": "modified",
  "affectedSections": ["testDir", "projects"],
  "isBreaking": true,
  "breakingReasons": ["Test directory changed", "Test projects configuration changed"]
}
```
