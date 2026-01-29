/**
 * Prisma schema and migration change detector.
 *
 * Detects changes to Prisma schema files and migration directories,
 * identifying potentially breaking changes such as removed models or fields.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  PrismaSchemaFinding,
  Confidence,
} from "../core/types.js";

// Prisma schema file patterns
const PRISMA_SCHEMA_PATTERNS = [
  /schema\.prisma$/,
  /\.prisma$/,
];

// Prisma migration file patterns
const PRISMA_MIGRATION_PATTERNS = [
  /prisma\/migrations\/.*\/migration\.sql$/,
  /prisma\/migrations\/.*\.sql$/,
];

/**
 * Check if a file is a Prisma schema file.
 */
export function isPrismaSchema(path: string): boolean {
  return PRISMA_SCHEMA_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a file is a Prisma migration file.
 */
export function isPrismaMigration(path: string): boolean {
  return PRISMA_MIGRATION_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Extract model names from Prisma schema content lines.
 */
function extractModels(lines: string[]): string[] {
  const models: string[] = [];
  const content = lines.join("\n");
  const modelMatches = content.match(/model\s+(\w+)\s*\{/g);
  if (modelMatches) {
    for (const match of modelMatches) {
      const name = match.match(/model\s+(\w+)/)?.[1];
      if (name) {
        models.push(name);
      }
    }
  }
  return models;
}

/**
 * Detect breaking changes from schema deletions.
 */
function detectBreakingChanges(deletions: string[]): string[] {
  const breakingChanges: string[] = [];
  const content = deletions.join("\n");

  // Removed models
  const removedModels = content.match(/model\s+(\w+)\s*\{/g);
  if (removedModels) {
    for (const match of removedModels) {
      const name = match.match(/model\s+(\w+)/)?.[1];
      if (name) {
        breakingChanges.push(`Removed model: ${name}`);
      }
    }
  }

  // Removed enums
  const removedEnums = content.match(/enum\s+(\w+)\s*\{/g);
  if (removedEnums) {
    for (const match of removedEnums) {
      const name = match.match(/enum\s+(\w+)/)?.[1];
      if (name) {
        breakingChanges.push(`Removed enum: ${name}`);
      }
    }
  }

  // Removed @unique or @@unique constraints
  if (/@unique\b/.test(content) || /@@unique/.test(content)) {
    breakingChanges.push("Unique constraint removed");
  }

  // Removed @@index
  if (/@@index/.test(content)) {
    breakingChanges.push("Index removed");
  }

  return breakingChanges;
}

export const prismaAnalyzer: Analyzer = {
  name: "prisma",
  cache: {
    includeGlobs: ["**/*.prisma", "**/prisma/migrations/**/*.sql"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      if (!isPrismaSchema(diff.path) && !isPrismaMigration(diff.path)) {
        continue;
      }

      // For migration files, we just note the migration exists
      if (isPrismaMigration(diff.path)) {
        continue; // Handled by sql-risks analyzer for SQL content
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const addedModels = extractModels(additions);
      const removedModels = extractModels(deletions);

      // Models that appear in both additions and deletions are modified
      const modifiedModels = addedModels.filter((m) => removedModels.includes(m));
      const trulyAdded = addedModels.filter((m) => !removedModels.includes(m));
      const trulyRemoved = removedModels.filter((m) => !addedModels.includes(m));

      const breakingChanges = detectBreakingChanges(deletions);
      const isBreaking = trulyRemoved.length > 0 || breakingChanges.length > 0;

      const excerpt = isBreaking
        ? extractRepresentativeExcerpt(deletions)
        : extractRepresentativeExcerpt(additions);

      let confidence: Confidence = "medium";
      if (isBreaking) {
        confidence = "high";
      } else if (trulyAdded.length > 0 && deletions.length === 0) {
        confidence = "low";
      }

      const finding: PrismaSchemaFinding = {
        type: "prisma-schema",
        kind: "prisma-schema",
        category: "database",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        isBreaking,
        breakingChanges: breakingChanges.slice(0, 5),
        addedModels: trulyAdded.slice(0, 10),
        removedModels: trulyRemoved.slice(0, 10),
        modifiedModels: modifiedModels.slice(0, 10),
      };

      findings.push(finding);
    }

    return findings;
  },
};
