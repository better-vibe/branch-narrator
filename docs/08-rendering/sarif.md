# SARIF Rendering

The SARIF renderer converts branch-narrator findings into SARIF 2.1.0 format for integration with GitHub Code Scanning and other static analysis platforms.

## Overview

SARIF (Static Analysis Results Interchange Format) is a standardized JSON format for sharing the results of static analysis tools. The branch-narrator SARIF renderer maps detected findings to stable SARIF rules with appropriate severity levels.

## Entry Point

```typescript
function renderSarif(facts: FactsOutput, changeSet: ChangeSet): SarifLog;
```

## SARIF Schema

The renderer outputs SARIF 2.1.0-compliant JSON with the following structure:

```typescript
interface SarifLog {
  version: "2.1.0";
  $schema: string;
  runs: SarifRun[];
}

interface SarifRun {
  tool: {
    driver: {
      name: "branch-narrator";
      version: string;
      informationUri: string;
      rules: SarifReportingDescriptor[];
    };
  };
  results: SarifResult[];
  originalUriBaseIds: {
    SRCROOT: {
      uri: string; // file:// URI to repository root
    };
  };
}
```

## Rule Mappings

The SARIF renderer maps branch-narrator findings to stable rule IDs:

### BNR001: Dangerous SQL in Migration

- **Level**: `error`
- **Category**: Database
- **Mapped from**: Database migration findings with `risk: "high"`
- **Detects**: DROP, TRUNCATE, ALTER TYPE, and other destructive SQL operations
- **Example**:
  ```sql
  DROP TABLE users;
  TRUNCATE TABLE sessions;
  ```

### BNR002: Non-destructive Migration

- **Level**: `warning`
- **Category**: Database
- **Mapped from**: Database migration findings with `risk: "medium"` or `risk: "low"`
- **Detects**: Schema changes like ADD COLUMN, CREATE TABLE, CREATE INDEX
- **Example**:
  ```sql
  ALTER TABLE users ADD COLUMN email TEXT;
  CREATE INDEX idx_email ON users(email);
  ```

### BNR003: Major Dependency Bump

- **Level**: `warning`
- **Category**: Dependencies
- **Mapped from**: Dependency change findings with `impact: "major"` in critical dependencies
- **Critical dependencies**:
  - `@sveltejs/kit`
  - `svelte`
  - `vite`
  - `react`
  - `react-dom`
  - `next`
- **Example**: `@sveltejs/kit: 1.20.0 → 2.0.0`

### BNR004: New Environment Variable

- **Level**: `warning`
- **Category**: Configuration
- **Mapped from**: Environment variable findings with `change: "added"`
- **Detects**: New `process.env.*` or `import.meta.env.*` references
- **Example**:
  ```typescript
  const apiKey = process.env.API_KEY;
  ```

### BNR005: Cloudflare Configuration Change

- **Level**: `note`
- **Category**: Infrastructure
- **Mapped from**: Cloudflare change findings
- **Detects**: Changes to `wrangler.toml` or Cloudflare Workers configuration
- **Example**: Modifications to worker bindings, routes, or environment settings

### BNR006: API Endpoint Change

- **Level**: `note`
- **Category**: Routes
- **Mapped from**: Route change findings of type `endpoint`
- **Detects**: Added, modified, or deleted API routes in SvelteKit
- **Example**: New `+server.ts` file with GET/POST handlers

## Line Number Tracking

The SARIF renderer includes precise source locations when possible:

1. **Direct line numbers**: If the finding's evidence includes a `line` property, it's used directly
2. **Computed line numbers**: For findings without direct line numbers (e.g., environment variables), the renderer searches diff hunks for matching excerpts
3. **No line number**: If location can't be determined, only the file path is included

### Example with Line Number

```json
{
  "ruleId": "BNR001",
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": {
          "uri": "supabase/migrations/001_drop.sql",
          "uriBaseId": "SRCROOT"
        },
        "region": {
          "startLine": 5
        }
      }
    }
  ]
}
```

### Example without Line Number

```json
{
  "ruleId": "BNR004",
  "locations": [
    {
      "physicalLocation": {
        "artifactLocation": {
          "uri": "src/config.ts",
          "uriBaseId": "SRCROOT"
        }
      }
    }
  ]
}
```

## File URI Construction

The renderer creates file URIs for the `SRCROOT` base ID to enable proper file navigation in GitHub Code Scanning:

- **Unix paths**: `/home/user/repo` → `file:///home/user/repo/`
- **Windows paths**: `C:\Users\user\repo` → `file:///C:/Users/user/repo/`

Backslashes are normalized to forward slashes for cross-platform compatibility.

## Deterministic Output

The SARIF renderer ensures reproducible output:

1. **Rule ordering**: Rules are sorted alphabetically by ID (BNR001, BNR002, etc.)
2. **Result ordering**: Results are sorted first by finding type, then by finding ID
3. **Stable fingerprints**: Each result includes `partialFingerprints.findingId` for tracking

## Limitations

### Findings Not Mapped

The following finding types are **not** mapped to SARIF rules in the current implementation:

- File summary findings
- File category findings
- Test file changes (Vitest)
- Security file changes
- Route changes of type `page` or `layout` (only `endpoint` routes are mapped)

### Line Number Accuracy

Line numbers are best-effort and may not always be accurate:

- Computed line numbers depend on exact string matching in diff hunks
- Multi-line excerpts may only match the first line
- Modified files may have line numbers that shift after the change

### No Delta Support

The SARIF renderer does **not** support delta mode (`--since` flag). It only works with full facts output. Attempting to use `--format sarif` with `--since` will result in a type error.

## Usage Examples

### Basic SARIF Output

```bash
branch-narrator facts --format sarif
```

### Pretty-printed SARIF

```bash
branch-narrator facts --format sarif --pretty
```

### Save to File

```bash
branch-narrator facts --format sarif --out results.sarif
```

### GitHub Actions Integration

```yaml
- name: Generate SARIF report
  run: branch-narrator facts --format sarif --out branch-narrator.sarif

- name: Upload SARIF to GitHub
  uses: github/codeql-action/upload-sarif@v2
  with:
    sarif_file: branch-narrator.sarif
```

## SARIF Specification

For complete details on the SARIF format, see:
- [SARIF 2.1.0 Specification](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [GitHub Code Scanning SARIF Support](https://docs.github.com/en/code-security/code-scanning/integrating-with-code-scanning/sarif-support-for-code-scanning)
