/**
 * SQL risk analyzer - detects risky SQL patterns in migrations.
 */

import type {
  Analyzer,
  ChangeSet,
  Finding,
  SQLRiskFinding,
} from "../core/types.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";

/**
 * Check if a file is a migration or SQL file.
 */
function isMigrationFile(path: string): boolean {
  return (
    path.includes("/migrations/") ||
    path.includes("/migrate/") ||
    path.endsWith(".sql")
  );
}

/**
 * Analyze SQL files for risky patterns.
 */
export const analyzeSQLRisks: Analyzer = {
  name: "sql-risks",
  cacheScope: "files",
  filePatterns: [
    "*.sql",
    "**/*.sql",
    "**/migrations/**",
    "**/migrate/**",
  ],
  analyze(changeSet: ChangeSet): Finding[] {
    const findings: SQLRiskFinding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isMigrationFile(diff.path)) continue;

      for (const hunk of diff.hunks) {
        const addedLines = hunk.additions.join("\n");

        // Check for destructive SQL
        const destructivePatterns = /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE)\b/gi;
        if (destructivePatterns.test(addedLines)) {
          const excerpt = extractRepresentativeExcerpt(hunk.additions, 200);
          findings.push({
            type: "sql-risk",
            kind: "sql-risk",
            category: "database",
            confidence: "high",
            evidence: [
              createEvidence(diff.path, excerpt, { hunk }),
            ],
            file: diff.path,
            riskType: "destructive",
            details: "Contains DROP TABLE/COLUMN or TRUNCATE",
          });
          continue; // One finding per hunk
        }

        // Check for risky schema changes
        const riskySchemaPatterns = /ALTER\s+TABLE[^;]+\b(ALTER\s+COLUMN|TYPE)\b/gi;
        if (riskySchemaPatterns.test(addedLines)) {
          const excerpt = extractRepresentativeExcerpt(hunk.additions, 200);
          findings.push({
            type: "sql-risk",
            kind: "sql-risk",
            category: "database",
            confidence: "high",
            evidence: [
              createEvidence(diff.path, excerpt, { hunk }),
            ],
            file: diff.path,
            riskType: "schema_change",
            details: "Contains ALTER COLUMN or TYPE change",
          });
          continue;
        }

        // Check for unscoped data modification
        const unscopedPatterns = /(UPDATE|DELETE)\s+(?![^;\n]*\bWHERE\b)/gi;
        if (unscopedPatterns.test(addedLines)) {
          const excerpt = extractRepresentativeExcerpt(hunk.additions, 200);
          findings.push({
            type: "sql-risk",
            kind: "sql-risk",
            category: "database",
            confidence: "medium",
            evidence: [
              createEvidence(diff.path, excerpt, { hunk }),
            ],
            file: diff.path,
            riskType: "unscoped_modification",
            details: "Contains UPDATE/DELETE without WHERE clause",
          });
        }
      }
    }

    return findings;
  },
};
