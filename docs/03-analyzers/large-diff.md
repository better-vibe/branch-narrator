# Large Diff Analyzer

**File:** `src/analyzers/large-diff.ts`
**Finding Type:** `large-diff`

## Purpose

Flags high-churn changesets to alert reviewers.

## Finding Type

```typescript
interface LargeDiffFinding {
  type: "large-diff";
  filesChanged: number;
  linesChanged: number;
}
```

## Detection Rules

Triggers when **either** threshold is exceeded:
- More than **30 files** changed
- More than **1000 lines** changed

## Example Output

```json
{
  "type": "large-diff",
  "filesChanged": 42,
  "linesChanged": 3120
}
```

## Usage in Markdown

```markdown
### Warnings

- **Large diff detected:** 42 files changed, 3120 lines modified
```
