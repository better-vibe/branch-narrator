# Prisma Analyzer

Detects changes to Prisma schema files and identifies potentially breaking changes such as removed models, enums, or constraints.

## File Location
`src/analyzers/prisma.ts`

## Finding Type
`PrismaSchemaFinding`

## Detection Rules
- Detects changes to `*.prisma` files (including `schema.prisma`)
- Identifies added, removed, and modified models
- Detects breaking changes: removed models, removed enums, removed unique constraints, removed indexes
- Prisma migration SQL files are skipped (handled by `sql-risks` analyzer)

## Fields
| Field | Type | Description |
|-------|------|-------------|
| `file` | `string` | Path to the changed schema file |
| `status` | `FileStatus` | File change status |
| `isBreaking` | `boolean` | Whether the change is breaking |
| `breakingChanges` | `string[]` | List of breaking change descriptions |
| `addedModels` | `string[]` | Newly added model names |
| `removedModels` | `string[]` | Removed model names |
| `modifiedModels` | `string[]` | Modified model names |

## Example Output
```json
{
  "type": "prisma-schema",
  "kind": "prisma-schema",
  "category": "database",
  "confidence": "high",
  "file": "prisma/schema.prisma",
  "status": "modified",
  "isBreaking": true,
  "breakingChanges": ["Removed model: OldUser"],
  "addedModels": ["NewUser"],
  "removedModels": ["OldUser"],
  "modifiedModels": []
}
```
