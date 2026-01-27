# API Contracts Analyzer

**File:** `src/analyzers/api-contracts.ts`
**Finding Type:** `api-contract-change`

## Purpose

Detects changes to API specification files (OpenAPI, Swagger, Protobuf, and API JSON/YAML).

## Finding Type

```typescript
interface APIContractChangeFinding {
  type: "api-contract-change";
  files: string[];
}
```

## Detection Rules

| Trigger | Examples |
|---------|----------|
| File name includes `openapi` or `swagger` | `openapi.yaml`, `swagger.json` |
| Protobuf files | `*.proto` |
| API specs under `/api/` | `api/schema.yaml`, `api/routes.json` |

## Example Output

```json
{
  "type": "api-contract-change",
  "files": ["openapi.yaml", "api/schema.json"]
}
```

## Usage in Markdown

```markdown
### API Contracts

The following API specification files have changed:

- `openapi.yaml`
- `api/schema.json`
```
