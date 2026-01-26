/**
 * Python migrations analyzer - detects database migration changes.
 *
 * Supports:
 * - Alembic migrations (versions/ directory, alembic/ directory)
 * - Django migrations (app_name/migrations/0001_name.py pattern)
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  MigrationRisk,
  PythonMigrationFinding,
  RiskFlagFinding,
} from "../core/types.js";

// Alembic migration patterns
const ALEMBIC_PATTERNS = [
  /alembic\/versions\/.*\.py$/,
  /migrations\/versions\/.*\.py$/,
  /db\/versions\/.*\.py$/,
];

// Django migration patterns
const DJANGO_MIGRATION_PATTERN = /\/migrations\/\d{4}_.*\.py$/;

// Destructive patterns in Python migration files
const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /op\.drop_table\s*\(/i, description: "drop_table" },
  { pattern: /op\.drop_column\s*\(/i, description: "drop_column" },
  { pattern: /op\.drop_index\s*\(/i, description: "drop_index" },
  { pattern: /op\.drop_constraint\s*\(/i, description: "drop_constraint" },
  { pattern: /op\.execute\s*\(\s*["'].*DROP/i, description: "raw DROP SQL" },
  { pattern: /op\.execute\s*\(\s*["'].*TRUNCATE/i, description: "raw TRUNCATE SQL" },
  { pattern: /op\.execute\s*\(\s*["'].*DELETE\s+FROM\s+\w+\s*["']\s*\)/i, description: "raw DELETE without WHERE" },
  { pattern: /DeleteModel\s*\(/i, description: "Django DeleteModel" },
  { pattern: /RemoveField\s*\(/i, description: "Django RemoveField" },
  { pattern: /AlterField.*null\s*=\s*False/i, description: "Django make field non-nullable" },
  { pattern: /migrations\.RunSQL\s*\(.*DROP/i, description: "Django raw DROP SQL" },
  { pattern: /migrations\.RunSQL\s*\(.*TRUNCATE/i, description: "Django raw TRUNCATE SQL" },
];

// Schema change patterns (medium risk)
const SCHEMA_CHANGE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /op\.alter_column\s*\(/i, description: "alter_column" },
  { pattern: /op\.create_table\s*\(/i, description: "create_table" },
  { pattern: /op\.add_column\s*\(/i, description: "add_column" },
  { pattern: /op\.create_index\s*\(/i, description: "create_index" },
  { pattern: /op\.create_foreign_key\s*\(/i, description: "create_foreign_key" },
  { pattern: /op\.create_unique_constraint\s*\(/i, description: "create_unique_constraint" },
  { pattern: /CreateModel\s*\(/i, description: "Django CreateModel" },
  { pattern: /AddField\s*\(/i, description: "Django AddField" },
  { pattern: /AlterField\s*\(/i, description: "Django AlterField" },
  { pattern: /RenameField\s*\(/i, description: "Django RenameField" },
  { pattern: /RenameModel\s*\(/i, description: "Django RenameModel" },
  { pattern: /AddIndex\s*\(/i, description: "Django AddIndex" },
  { pattern: /AddConstraint\s*\(/i, description: "Django AddConstraint" },
];

/**
 * Check if a path is an Alembic migration file.
 */
export function isAlembicMigration(path: string): boolean {
  return ALEMBIC_PATTERNS.some(pattern => pattern.test(path));
}

/**
 * Check if a path is a Django migration file.
 */
export function isDjangoMigration(path: string): boolean {
  return DJANGO_MIGRATION_PATTERN.test(path);
}

/**
 * Check if a path is any Python migration file.
 */
export function isPythonMigrationFile(path: string): boolean {
  return isAlembicMigration(path) || isDjangoMigration(path);
}

/**
 * Detect migration tool from path.
 */
export function detectMigrationTool(path: string): "alembic" | "django" | null {
  if (isAlembicMigration(path)) return "alembic";
  if (isDjangoMigration(path)) return "django";
  return null;
}

/**
 * Scan content for destructive patterns.
 */
function scanForDestructivePatterns(content: string): Array<{ description: string }> {
  const matches: Array<{ description: string }> = [];

  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(content)) {
      matches.push({ description });
    }
  }

  return matches;
}

/**
 * Scan content for schema change patterns.
 */
function scanForSchemaChanges(content: string): Array<{ description: string }> {
  const matches: Array<{ description: string }> = [];

  for (const { pattern, description } of SCHEMA_CHANGE_PATTERNS) {
    if (pattern.test(content)) {
      matches.push({ description });
    }
  }

  return matches;
}

/**
 * Determine migration risk level based on content.
 */
function determineMigrationRisk(
  files: string[],
  changeSet: ChangeSet
): {
  risk: MigrationRisk;
  reasons: string[];
  evidence: Array<{ file: string; excerpt: string }>;
} {
  const reasons: string[] = [];
  const evidence: Array<{ file: string; excerpt: string }> = [];
  let hasDestructive = false;
  let hasSchemaChange = false;

  for (const file of files) {
    const diff = changeSet.diffs.find(d => d.path === file);
    if (!diff) continue;

    const additions = getAdditions(diff);
    const content = additions.join("\n");

    // Check for destructive patterns
    const destructive = scanForDestructivePatterns(content);
    for (const { description } of destructive) {
      hasDestructive = true;
      reasons.push(`${description} detected in ${file}`);

      // Find the line with the pattern
      const lineWithPattern = additions.find(line =>
        DESTRUCTIVE_PATTERNS.some(p => p.pattern.test(line))
      );
      if (lineWithPattern) {
        evidence.push({
          file,
          excerpt: lineWithPattern.trim(),
        });
      }
    }

    // Check for schema changes
    const schemaChanges = scanForSchemaChanges(content);
    for (const { description } of schemaChanges) {
      hasSchemaChange = true;
      if (!hasDestructive) {
        // Only add schema change reasons if no destructive patterns
        reasons.push(`${description} detected in ${file}`);
      }
    }
  }

  if (hasDestructive) {
    return { risk: "high", reasons, evidence };
  }

  if (hasSchemaChange) {
    return {
      risk: "medium",
      reasons: reasons.length > 0 ? reasons : ["Schema changes detected"],
      evidence,
    };
  }

  return {
    risk: "low",
    reasons: ["Migration files changed"],
    evidence,
  };
}

export const pythonMigrationsAnalyzer: Analyzer = {
  name: "python-migrations",
  cacheScope: "files",
  filePatterns: [
    "**/alembic/versions/*.py",
    "**/migrations/*.py",
    "**/migrations/**/[0-9]*_*.py",
  ],

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const alembicFiles: string[] = [];
    const djangoFiles: string[] = [];

    // Collect migration files
    for (const file of changeSet.files) {
      if (isAlembicMigration(file.path)) {
        alembicFiles.push(file.path);
      } else if (isDjangoMigration(file.path)) {
        djangoFiles.push(file.path);
      }
    }

    // Process Alembic migrations
    if (alembicFiles.length > 0) {
      const { risk, reasons, evidence: evidenceData } = determineMigrationRisk(
        alembicFiles,
        changeSet
      );

      const evidence = evidenceData.map(e => createEvidence(e.file, e.excerpt));

      const migrationFinding: PythonMigrationFinding = {
        type: "python-migration",
        kind: "python-migration",
        category: "database",
        confidence: "high",
        evidence,
        tool: "alembic",
        files: alembicFiles,
        risk,
        reasons,
      };

      findings.push(migrationFinding);

      // Add risk flag for high risk
      if (risk === "high") {
        const riskFinding: RiskFlagFinding = {
          type: "risk-flag",
          kind: "risk-flag",
          category: "database",
          confidence: "high",
          evidence,
          risk: "high",
          evidenceText: `Destructive migration detected: ${reasons.join(", ")}`,
        };
        findings.push(riskFinding);
      }
    }

    // Process Django migrations
    if (djangoFiles.length > 0) {
      const { risk, reasons, evidence: evidenceData } = determineMigrationRisk(
        djangoFiles,
        changeSet
      );

      const evidence = evidenceData.map(e => createEvidence(e.file, e.excerpt));

      const migrationFinding: PythonMigrationFinding = {
        type: "python-migration",
        kind: "python-migration",
        category: "database",
        confidence: "high",
        evidence,
        tool: "django",
        files: djangoFiles,
        risk,
        reasons,
      };

      findings.push(migrationFinding);

      // Add risk flag for high risk
      if (risk === "high") {
        const riskFinding: RiskFlagFinding = {
          type: "risk-flag",
          kind: "risk-flag",
          category: "database",
          confidence: "high",
          evidence,
          risk: "high",
          evidenceText: `Destructive migration detected: ${reasons.join(", ")}`,
        };
        findings.push(riskFinding);
      }
    }

    return findings;
  },
};
