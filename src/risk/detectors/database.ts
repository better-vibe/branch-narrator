/**
 * Database and migration detectors.
 */

import type { RiskFlag, RiskFlagEvidence } from "../../core/types.js";
import type { Detector } from "./types.js";

/**
 * Extract evidence lines from hunks, limited by maxLines.
 */
function extractEvidenceLines(
  content: string,
  maxLines: number = 5
): string[] {
  const lines = content.split("\n")
    .filter(line => line.startsWith("+") || line.startsWith("-"))
    .map(line => line.substring(1).trim())
    .filter(Boolean);
  return lines.slice(0, maxLines);
}

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
 * Detect migrations changed.
 */
export const detectMigrationsChanged: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const migrationFiles = changeSet.files.filter(f => isMigrationFile(f.path));

  if (migrationFiles.length > 0) {
    const evidence: RiskFlagEvidence[] = migrationFiles.slice(0, 3).map(f => ({
      file: f.path,
      lines: [`File ${f.status}`],
    }));

    flags.push({
      id: "db.migrations_changed",
      category: "db",
      score: 12,
      confidence: 0.8,
      title: "Database migrations changed",
      summary: `${migrationFiles.length} migration/SQL ${migrationFiles.length === 1 ? "file" : "files"} changed`,
      evidence,
      suggestedChecks: [
        "Test migrations on a staging database",
        "Ensure migrations are reversible",
        "Check for data loss or downtime impact",
      ],
      effectiveScore: Math.round(12 * 0.8),
    });
  }

  return flags;
};

/**
 * Detect destructive SQL operations.
 */
export const detectDestructiveSQL: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const destructivePatterns = /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE)\b/gi;

  for (const diff of changeSet.diffs) {
    if (!isMigrationFile(diff.path)) continue;

    for (const hunk of diff.hunks) {
      const addedLines = hunk.additions.join("\n");
      if (destructivePatterns.test(addedLines)) {
        const evidence: RiskFlagEvidence[] = [{
          file: diff.path,
          hunk: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          lines: extractEvidenceLines(hunk.content),
        }];

        flags.push({
          id: "db.destructive_sql",
          category: "db",
          score: 45,
          confidence: 0.9,
          title: "Destructive SQL detected",
          summary: `Migration ${diff.path} contains DROP TABLE/COLUMN or TRUNCATE`,
          evidence,
          suggestedChecks: [
            "Backup data before running migration",
            "Verify this is intentional data deletion",
            "Test migration rollback procedure",
            "Consider making column nullable instead of dropping",
          ],
          effectiveScore: Math.round(45 * 0.9),
        });
        break; // One flag per file
      }
    }
  }

  return flags;
};

/**
 * Detect risky schema changes.
 */
export const detectRiskySchemaChange: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];
  const riskyPatterns = /ALTER\s+TABLE[^;]+\b(ALTER\s+COLUMN|TYPE)\b/gi;

  for (const diff of changeSet.diffs) {
    if (!isMigrationFile(diff.path)) continue;

    for (const hunk of diff.hunks) {
      const addedLines = hunk.additions.join("\n");
      if (riskyPatterns.test(addedLines)) {
        const evidence: RiskFlagEvidence[] = [{
          file: diff.path,
          hunk: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
          lines: extractEvidenceLines(hunk.content),
        }];

        flags.push({
          id: "db.schema_change_risky",
          category: "db",
          score: 30,
          confidence: 0.85,
          title: "Risky schema change detected",
          summary: `Migration ${diff.path} contains ALTER COLUMN or TYPE change`,
          evidence,
          suggestedChecks: [
            "Test schema changes on production-like data",
            "Check for data type compatibility",
            "Monitor migration execution time (may lock table)",
          ],
          effectiveScore: Math.round(30 * 0.85),
        });
        break;
      }
    }
  }

  return flags;
};

/**
 * Detect unscoped data modifications.
 */
export const detectUnscopedDataModification: Detector = (changeSet) => {
  const flags: RiskFlag[] = [];

  for (const diff of changeSet.diffs) {
    if (!isMigrationFile(diff.path)) continue;

    for (const hunk of diff.hunks) {
      const addedLines = hunk.additions;

      for (const line of addedLines) {
        // Check for DELETE or UPDATE without WHERE on the same line
        const deleteMatch = /DELETE\s+FROM\s+\w+/i.test(line);
        const updateMatch = /UPDATE\s+\w+\s+SET/i.test(line);
        const hasWhere = /WHERE/i.test(line);

        if ((deleteMatch || updateMatch) && !hasWhere) {
          const evidence: RiskFlagEvidence[] = [{
            file: diff.path,
            hunk: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
            lines: extractEvidenceLines(hunk.content),
          }];

          flags.push({
            id: "db.data_modification_unscoped",
            category: "db",
            score: 35,
            confidence: 0.7,
            title: "Unscoped data modification detected",
            summary: `Migration ${diff.path} has DELETE/UPDATE without WHERE clause (may affect all rows)`,
            evidence,
            suggestedChecks: [
              "Verify this is intentional (affects all rows)",
              "Add WHERE clause to scope the operation",
              "Test on a subset of data first",
            ],
            effectiveScore: Math.round(35 * 0.7),
          });
          break; // One flag per file
        }
      }
    }
  }

  return flags;
};
