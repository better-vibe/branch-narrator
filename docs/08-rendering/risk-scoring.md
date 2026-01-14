# Risk Scoring (risk-report)

This document describes the `risk-report` scoring model and its relationship to the findings system.

## Single analysis pipeline

`risk-report` does **not** run its own detection pass. It derives flags from analyzer findings:

```typescript
// 1) profile analyzers
const findings = runAnalyzers(changeSet, profile).map(assignFindingId);

// 2) findings -> flags
const flags = findingsToFlags(findings);

// 3) flags -> report (score + level + breakdown)
const report = computeRiskReport(base, head, flags, skippedFiles, options);
```

## RiskReport schema version

Current `risk-report` output uses **`schemaVersion: "2.0"`** (see `src/core/types.ts`).

## Flags and traceability

Every emitted flag is traceable back to the finding(s) that produced it:

- **ruleKey**: Stable rule identifier (e.g. `db.destructive_sql`)
- **flagId**: Stable instance ID computed from `ruleKey` + sorted `relatedFindingIds`
- **relatedFindingIds**: Finding IDs that triggered the flag

This enables drill-down and deterministic deltas:

```
flagId -> relatedFindingIds -> findingId -> evidence
```

## Category scores

Each flag has:

- `score` (0..100): base severity
- `confidence` (0..1): confidence multiplier
- `effectiveScore = round(score * confidence)`

Category totals are computed by summing `effectiveScore` for each category and capping at 100:

```typescript
categoryScores[flag.category] += flag.effectiveScore;
categoryScores[category] = Math.min(100, categoryScores[category]);
```

## Overall risk score

The overall `riskScore` (0..100) is computed from category scores:

- `maxCat = max(categoryScores)`
- `top3Avg = average(top 3 category scores, padded with zeros)`

```typescript
riskScore = round(0.6 * maxCat + 0.4 * top3Avg);
```

## Risk level thresholds

Risk levels are derived from `riskScore`:

- `critical`: 81..100
- `high`: 61..80
- `elevated`: 41..60
- `moderate`: 21..40
- `low`: 0..20

## Determinism requirements

`risk-report` output is deterministic across runs, except for `generatedAt`, which is omitted with `--no-timestamp`.

Determinism includes:

- Stable `findingId` and `flagId` generation
- Sorted flag output (see `sortRiskFlags()`)
- Sorted evidence entries per flag (see `sortRiskFlagEvidence()`)

