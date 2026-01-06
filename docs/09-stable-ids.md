# Stable IDs and Single Analysis Graph

## Overview

This document explains the stable ID system and single analysis graph architecture introduced in branch-narrator.

## Motivation

AI agent loops need stable references and consistent outputs. Previously, `facts` and `risk-report` ran independent analysis passes, which could lead to:
- Drift between findings and risk flags
- No traceable origin for risk flags
- Difficulty in saying "show me evidence for this exact issue" across runs

The single analysis graph enables:
- Deterministic references (findingId, flagId)
- Precise drill-down (flag -> findings -> evidence)
- Consistent analysis across all commands

## Architecture

### Single Analysis Pipeline

Both `facts` and `risk-report` now use the same analysis pipeline:

```typescript
// Both commands use the same analyzers
const findings = await runAnalyzers(changeSet, profile);

// facts: outputs findings with findingIds
const factsOutput = await buildFacts({ findings, ... });

// risk-report: converts findings to flags
const flags = findingsToFlags(findings);
const riskReport = computeRiskReport(flags, ...);
```

### Stable IDs

Every finding and flag has a deterministic ID:

**Finding IDs** (format: `finding.<type>#<hash>`)
- Hash is computed from canonical identity (stable attributes only)
- Path normalization (POSIX `/` format)
- Array sorting before hashing
- Examples:
  - `finding.env-var#b4f1e2c8d2a1`
  - `finding.dependency-change#8a3f9d1c2e4b`
  - `finding.ci-workflow#7c2e8f4a1d9b`

**Flag IDs** (format: `flag.<ruleKey>#<hash>`)
- Hash based on ruleKey + sorted relatedFindingIds
- Example: `flag.security.workflow_permissions_broadened#8f21c10d0aa4`

### Traceability

Every risk flag links back to findings:

```json
{
  "flagId": "flag.security.workflow_permissions_broadened#8f21c10d",
  "ruleKey": "security.workflow_permissions_broadened",
  "relatedFindingIds": [
    "finding.ci-workflow#1a2b3c4d"
  ],
  "evidence": [...]
}
```

Agents can traverse:
```
flagId -> relatedFindingIds -> findingId -> evidence
```

## ID Generation

### Fingerprinting Rules

Each finding type has a fingerprint function that includes only stable attributes:

```typescript
// env-var: type + varName + sorted(files)
fingerprint = `env-var:${finding.name}:${sortedFiles.join(",")}`;

// dependency-change: type + pkg + from + to + section  
fingerprint = `dependency-change:${finding.name}:${from}:${to}:${section}`;

// ci-workflow: type + file + riskType
fingerprint = `ci-workflow:${normalizedFile}:${finding.riskType}`;
```

Volatile data (like evidence excerpts) is NOT included in fingerprints.

### Hashing

```typescript
function stableHash(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 12); // 12-char hex
}
```

### Path Normalization

All paths are normalized to POSIX format before hashing:

```typescript
function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
```

## New Finding Types

To support all risk detection patterns, new finding types were added:

| Finding Type | Purpose |
|--------------|---------|
| `CIWorkflowFinding` | CI/CD security risks (permissions, pull_request_target, remote scripts) |
| `SQLRiskFinding` | SQL risks (destructive, schema changes, unscoped modifications) |
| `InfraChangeFinding` | Infrastructure changes (Dockerfile, Terraform, K8s) |
| `APIContractChangeFinding` | API contract/schema changes |
| `LargeDiffFinding` | High churn detection |
| `LockfileFinding` | Lockfile/manifest mismatches |
| `TestGapFinding` | Test coverage gaps |

## Finding-to-Flag Conversion

The `findingsToFlags()` function converts findings to risk flags using rules:

```typescript
// CI workflow findings -> security/ci flags
ciWorkflowFindings.forEach(finding => {
  if (finding.riskType === "permissions_broadened") {
    flags.push({
      id: "security.workflow_permissions_broadened",
      ruleKey: "security.workflow_permissions_broadened",
      flagId: buildFlagId(ruleKey, [finding.findingId]),
      relatedFindingIds: [finding.findingId],
      score: 35,
      confidence: 0.9,
      // ... evidence, suggested checks, etc.
    });
  }
});
```

## Breaking Changes

### API Changes

1. **`generateRiskReport` is now async**
   ```typescript
   // Before
   const report = generateRiskReport(changeSet, options);
   
   // After
   const report = await generateRiskReport(changeSet, options);
   ```

2. **Finding types now have optional `findingId` field**
   ```typescript
   interface EnvVarFinding {
     // ... existing fields
     findingId?: string; // NEW
   }
   ```

3. **RiskFlag type has new fields**
   ```typescript
   interface RiskFlag {
     id: string; // legacy - now duplicated as ruleKey
     ruleKey?: string; // NEW
     flagId?: string; // NEW
     relatedFindingIds?: string[]; // NEW
     // ... existing fields
   }
   ```

### Behavioral Changes

1. **risk-report no longer runs independent detectors**
   - It now uses the same analysis pipeline as `facts`
   - Derives flags from findings using conversion rules

2. **All profiles include new analyzers**
   - 7 new analyzers added to default and SvelteKit profiles
   - More comprehensive risk detection out of the box

## Testing

### Determinism Tests

```typescript
it("should generate stable findingIds", () => {
  const finding1 = { type: "env-var", name: "DB_URL", ... };
  const finding2 = { type: "env-var", name: "DB_URL", ... };
  
  const id1 = buildFindingId(finding1);
  const id2 = buildFindingId(finding2);
  
  expect(id1).toBe(id2); // Same input => same ID
});
```

### Order Invariance Tests

```typescript
it("should be order-invariant", () => {
  const finding1 = { ..., evidenceFiles: ["a.ts", "b.ts"] };
  const finding2 = { ..., evidenceFiles: ["b.ts", "a.ts"] }; // Different order
  
  const id1 = buildFindingId(finding1);
  const id2 = buildFindingId(finding2);
  
  expect(id1).toBe(id2); // Order doesn't matter
});
```

### Link Integrity

```typescript
it("should link flags to findings", () => {
  const findings = [...];
  const flags = findingsToFlags(findings);
  
  const findingIds = new Set(findings.map(f => f.findingId));
  
  for (const flag of flags) {
    for (const relatedId of flag.relatedFindingIds) {
      expect(findingIds.has(relatedId)).toBe(true);
    }
  }
});
```

## Usage Examples

### Traversing Flag to Evidence

```typescript
// Get a risk flag
const flag = report.flags.find(f => f.ruleKey === "db.destructive_sql");

// Get related findings
const relatedFindings = facts.findings.filter(f => 
  flag.relatedFindingIds.includes(f.findingId)
);

// Get evidence
const evidence = relatedFindings.flatMap(f => f.evidence);
```

### Comparing Across Runs

```typescript
// Run 1
const facts1 = await buildFacts(...);
const finding1 = facts1.findings[0];
console.log(finding1.findingId); // "finding.env-var#b4f1e2c8"

// Run 2 (same input)
const facts2 = await buildFacts(...);
const finding2 = facts2.findings[0];
console.log(finding2.findingId); // "finding.env-var#b4f1e2c8" (same!)
```

## Migration Guide

### For CLI Users

No changes required! All existing CLI options still work:
```bash
# Still works exactly the same
branch-narrator risk-report --fail-on-score 50
branch-narrator risk-report --only security,ci
branch-narrator facts --redact
```

### For Library Users

If you're using `generateRiskReport()` programmatically, add `await`:

```typescript
// Before
const report = generateRiskReport(changeSet, options);

// After  
const report = await generateRiskReport(changeSet, options);
```

### For Custom Integrations

If you parse `facts` or `risk-report` JSON output:

1. **Findings now have `findingId`**
   - Check for presence before using
   - Use for stable references

2. **Flags now have `flagId`, `ruleKey`, `relatedFindingIds`**
   - `ruleKey` replaces `id` (though `id` is still present)
   - Use `relatedFindingIds` to link back to findings

## Future Enhancements

The stable ID system enables future features:

1. **`zoom` command**: Deep-dive into specific flags or findings
2. **`--since` flag**: Show only changes since last run
3. **`loop` command**: Persistent state across multiple runs
4. **Diff/delta reports**: Compare findings between two runs

All of these rely on stable IDs to track entities across time.
