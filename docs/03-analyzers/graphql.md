# GraphQL Schema Analyzer

**File:** `src/analyzers/graphql.ts`
**Finding Type:** `graphql-change`

## Purpose

Detects changes to GraphQL schema files and identifies potentially breaking changes such as removed types, fields, enums, interfaces, and input types.

## Finding Type

```typescript
interface GraphQLChangeFinding {
  type: "graphql-change";
  kind: "graphql-change";
  category: "api";
  confidence: Confidence;
  evidence: Evidence[];
  file: string;
  status: FileStatus;
  isBreaking: boolean;
  breakingChanges: string[];
  addedElements: string[];
}
```

## Detection Rules

| File Pattern | Description |
|--------------|-------------|
| `*.graphql` | Standard GraphQL schema files |
| `*.gql` | Alternative GraphQL extension |
| `schema.graphqls` | SDL schema files |
| `schema.sdl` | Schema definition files |

## Breaking Change Detection

The analyzer identifies the following as breaking changes:

- **Removed Types:** `type User { ... }` removed
- **Removed Enums:** `enum Status { ... }` removed
- **Removed Interfaces:** `interface Node { ... }` removed
- **Removed Input Types:** `input CreateUserInput { ... }` removed

## Example Output

### Breaking Change Detected

```json
{
  "type": "graphql-change",
  "kind": "graphql-change",
  "category": "api",
  "confidence": "high",
  "file": "schema.graphql",
  "status": "modified",
  "isBreaking": true,
  "breakingChanges": [
    "Removed type: OldUser",
    "Removed enum: LegacyStatus"
  ],
  "addedElements": []
}
```

### Non-Breaking Addition

```json
{
  "type": "graphql-change",
  "kind": "graphql-change",
  "category": "api",
  "confidence": "low",
  "file": "schema.graphql",
  "status": "modified",
  "isBreaking": false,
  "breakingChanges": [],
  "addedElements": [
    "Added type: NewFeature",
    "Added enum: NewStatus"
  ]
}
```

## Confidence Levels

- **high**: Breaking changes detected (removals)
- **medium**: Mixed changes (additions and deletions)
- **low**: Additive-only changes (safe additions)

## Profiles

Included in:
- Default profile (auto)
- All framework-specific profiles
