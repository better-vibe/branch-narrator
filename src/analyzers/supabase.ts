/**
 * Supabase migration detector with dangerous SQL scanning.
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  DbMigrationFinding,
  Finding,
  MigrationRisk,
  RiskFlagFinding,
} from "../core/types.js";

// Migration file pattern
const MIGRATION_PATTERN = /^supabase\/migrations\/.*\.sql$/;

// Seed/config patterns (lower risk)
const SEED_PATTERN = /^supabase\/(seed|config)/;

// Destructive SQL patterns
const DESTRUCTIVE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /DROP\s+TABLE/i, description: "DROP TABLE" },
  { pattern: /DROP\s+COLUMN/i, description: "DROP COLUMN" },
  { pattern: /TRUNCATE/i, description: "TRUNCATE" },
  { pattern: /ALTER\s+COLUMN/i, description: "ALTER COLUMN" },
  { pattern: /ALTER\s+TABLE\s+\w+\s+.*\s+TYPE/i, description: "ALTER TYPE" },
  {
    pattern: /DELETE\s+FROM\s+\w+\s*(?:;|$)/i,
    description: "DELETE without WHERE",
  },
];

/**
 * Check if a path is a Supabase migration file.
 */
export function isMigrationFile(path: string): boolean {
  return MIGRATION_PATTERN.test(path);
}

/**
 * Check if a path is a seed or config file.
 */
export function isSeedOrConfig(path: string): boolean {
  return SEED_PATTERN.test(path);
}

/**
 * Scan SQL content for destructive patterns.
 */
export function scanForDestructivePatterns(
  content: string
): Array<{ pattern: string; description: string }> {
  const matches: Array<{ pattern: string; description: string }> = [];

  for (const { pattern, description } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(content)) {
      matches.push({ pattern: pattern.source, description });
    }
  }

  return matches;
}

/**
 * Determine migration risk level based on content.
 * Returns risk level, reasons, and evidence.
 */
export function determineMigrationRisk(
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

  for (const file of files) {
    const diff = changeSet.diffs.find((d) => d.path === file);
    if (!diff) continue;

    const additions = getAdditions(diff);
    const additionsText = additions.join("\n");
    const destructive = scanForDestructivePatterns(additionsText);

    for (const { description } of destructive) {
      hasDestructive = true;
      reasons.push(`${description} detected in ${file}`);

      // Find the line with the destructive pattern
      const lineWithPattern = additions.find((line) =>
        DESTRUCTIVE_PATTERNS.some((p) => p.pattern.test(line))
      );
      if (lineWithPattern) {
        evidence.push({
          file,
          excerpt: lineWithPattern.trim(),
        });
      }
    }
  }

  if (hasDestructive) {
    return { risk: "high", reasons, evidence };
  }

  // Check if only seeds/config
  const onlySeedsOrConfig = files.every((f) => isSeedOrConfig(f));
  if (onlySeedsOrConfig) {
    return {
      risk: "low",
      reasons: ["Only seed/config files changed"],
      evidence,
    };
  }

  return {
    risk: "medium",
    reasons: ["Migration files changed"],
    evidence,
  };
}

export const supabaseAnalyzer: Analyzer = {
  name: "supabase",
  cache: {
    includeGlobs: ["supabase/**/*.sql", "supabase/migrations/**/*"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];
    const migrationFiles: string[] = [];
    const supabaseFiles: string[] = [];

    // Collect migration and Supabase files
    for (const file of changeSet.files) {
      if (file.path.startsWith("supabase/")) {
        supabaseFiles.push(file.path);
        if (isMigrationFile(file.path)) {
          migrationFiles.push(file.path);
        }
      }
    }

    // If no Supabase files, skip
    if (supabaseFiles.length === 0) {
      return [];
    }

    // Determine risk
    const { risk, reasons, evidence: evidenceData } = determineMigrationRisk(
      migrationFiles.length > 0 ? migrationFiles : supabaseFiles,
      changeSet
    );

    // Convert evidence data to Evidence type
    const evidence = evidenceData.map((e) =>
      createEvidence(e.file, e.excerpt)
    );

    const migrationFinding: DbMigrationFinding = {
      type: "db-migration",
      kind: "db-migration",
      category: "database",
      confidence: "high",
      evidence,
      tool: "supabase",
      files: migrationFiles.length > 0 ? migrationFiles : supabaseFiles,
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
        evidenceText: `Destructive SQL detected: ${reasons.join(", ")}`,
      };
      findings.push(riskFinding);
    }

    return findings;
  },
};

