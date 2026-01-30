# Linter Config Analyzer

Detects changes to linter and formatter configuration files across multiple tools: ESLint, Biome, Prettier, Stylelint, and oxlint.

## File Location
`src/analyzers/linter-config.ts`

## Finding Type
`LinterConfigFinding`

## Supported Tools
| Tool | Config Files |
|------|-------------|
| ESLint | `.eslintrc.*`, `eslint.config.*`, `.eslintignore` |
| Biome | `biome.json`, `biome.jsonc` |
| Prettier | `.prettierrc.*`, `prettier.config.*`, `.prettierignore` |
| Stylelint | `.stylelintrc.*`, `stylelint.config.*` |
| oxlint | `.oxlintrc.json`, `oxlint.json` |

## Detection Rules
- Identifies which linter tool the config belongs to
- Tracks affected sections per tool (rules, extends, plugins, parser, etc.)
- Detects breaking changes from deleted critical configuration

## Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path to the changed config file |
| `status` | `FileStatus` | File change status |
| `tool` | `LinterTool` | Which linter tool (`eslint`, `biome`, `prettier`, `stylelint`, `oxlint`) |
| `isBreaking` | `boolean` | Whether the change is breaking |
| `affectedSections` | `string[]` | Config sections affected |
| `breakingReasons` | `string[]` | Reasons the change is breaking |

## Example Output
```json
{
  "type": "linter-config",
  "kind": "linter-config",
  "category": "quality",
  "confidence": "high",
  "file": "eslint.config.mjs",
  "status": "modified",
  "tool": "eslint",
  "isBreaking": true,
  "affectedSections": ["rules", "extends"],
  "breakingReasons": ["Extends configuration changed"]
}
```
