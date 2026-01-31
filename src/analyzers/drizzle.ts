/**
 * Drizzle ORM schema and migration change detector.
 *
 * Detects changes to Drizzle schema files (**.schema.ts, schema/**.ts)
 * and migration SQL files, identifying breaking changes like removed
 * tables, columns, or relationships.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  DrizzleSchemaFinding,
  Confidence,
} from "../core/types.js";

// Drizzle schema file patterns
const DRIZZLE_SCHEMA_PATTERNS = [
  /\.schema\.ts$/,              // *.schema.ts (e.g., users.schema.ts)
  /\.schema\.js$/,              // *.schema.js
  /[\/\\]schema[\/\\].+\.(ts|js)$/,  // */schema/*.ts or */schema/*.js
  /[\/\\]schema\.ts$/,         // */schema.ts (e.g., db/schema.ts)
];

// Drizzle migration file patterns
const DRIZZLE_MIGRATION_PATTERNS = [
  /drizzle[\/\\]migrations[\/\\].+\.sql$/,  // drizzle/migrations/*.sql
  /[\/\\]drizzle[\/\\].+\.sql$/,            // */drizzle/*.sql
];

// Drizzle config file
const DRIZZLE_CONFIG_PATTERN = /drizzle\.config\.(ts|js|mjs)$/;

/**
 * Check if a file is a Drizzle schema file.
 */
export function isDrizzleSchema(path: string): boolean {
  return DRIZZLE_SCHEMA_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a file is a Drizzle migration file.
 */
export function isDrizzleMigration(path: string): boolean {
  return DRIZZLE_MIGRATION_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if a file is a Drizzle config file.
 */
export function isDrizzleConfig(path: string): boolean {
  return DRIZZLE_CONFIG_PATTERN.test(path);
}

/**
 * Extract table names from Drizzle schema content.
 * Matches patterns like: export const users = pgTable("users", {...})
 */
function extractTables(content: string[]): string[] {
  const tables: string[] = [];
  const fullContent = content.join("\n");

  // Match export const tableName = pgTable|mysqlTable|sqliteTable("tableName", ...
  const tableMatches = fullContent.match(
    /export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(\s*["']([^"']+)["']/g
  );

  if (tableMatches) {
    for (const match of tableMatches) {
      // Extract the table name from the string literal
      const nameMatch = match.match(/["']([^"']+)["']/);
      if (nameMatch && nameMatch[1]) {
        tables.push(nameMatch[1]);
      }
    }
  }

  return [...new Set(tables)]; // Remove duplicates
}

/**
 * Detect breaking changes from schema deletions.
 */
function detectBreakingChanges(deletions: string[]): string[] {
  const breakingChanges: string[] = [];
  const content = deletions.join("\n");

  // Removed tables (export const ... = pgTable)
  const removedTables = content.match(
    /export\s+const\s+(\w+)\s*=\s*(?:pg|mysql|sqlite)Table\s*\(/g
  );
  if (removedTables) {
    for (const match of removedTables) {
      const nameMatch = match.match(/export\s+const\s+(\w+)/);
      if (nameMatch && nameMatch[1]) {
        breakingChanges.push(`Removed table: ${nameMatch[1]}`);
      }
    }
  }

  // Removed columns (detect column definitions in deletions)
  const columnMatches = content.match(/(\w+):\s*(?:serial|varchar|text|integer|bigint|boolean|timestamp|json|jsonb|uuid|real|doublePrecision|decimal)\s*\(/g);
  if (columnMatches && columnMatches.length > 0) {
    breakingChanges.push("Columns removed or modified");
  }

  // Removed indexes
  if (/\$onIndex\s*\(/.test(content)) {
    breakingChanges.push("Index removed");
  }

  // Removed unique constraints
  if (/\.unique\s*\(/.test(content) || /unique\s*:\s*true/.test(content)) {
    breakingChanges.push("Unique constraint removed");
  }

  // Removed foreign key relations
  if (/\.references\s*\(/.test(content)) {
    breakingChanges.push("Foreign key relation removed");
  }

  // Removed notNull constraints (can break existing code)
  if (/\.notNull\s*\(/.test(content) || /notNull\s*:\s*true/.test(content)) {
    breakingChanges.push("Not-null constraint removed (may allow nulls)");
  }

  return breakingChanges;
}

/**
 * Check if the project uses Drizzle based on package.json dependencies.
 */
function hasDrizzleDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(
    deps?.["drizzle-orm"] ||
    devDeps?.["drizzle-orm"] ||
    deps?.["drizzle-kit"] ||
    devDeps?.["drizzle-kit"]
  );
}

/**
 * Check if any Drizzle-related files are in the changeset.
 */
function hasDrizzleFiles(changeSet: ChangeSet): boolean {
  return changeSet.diffs.some(
    (d) => isDrizzleSchema(d.path) || isDrizzleMigration(d.path) || isDrizzleConfig(d.path)
  );
}

/**
 * Check if SQL migration contains destructive operations.
 */
function detectDestructiveMigration(content: string[]): string[] {
  const destructiveOps: string[] = [];
  const sql = content.join("\n").toLowerCase();

  if (/drop\s+table/i.test(sql)) {
    destructiveOps.push("DROP TABLE operation detected");
  }
  if (/drop\s+column/i.test(sql)) {
    destructiveOps.push("DROP COLUMN operation detected");
  }
  if (/alter\s+table.*drop/i.test(sql)) {
    destructiveOps.push("ALTER TABLE DROP operation detected");
  }
  if (/delete\s+from/i.test(sql) && !/where/i.test(sql)) {
    destructiveOps.push("DELETE without WHERE clause detected");
  }

  return destructiveOps;
}

export const drizzleAnalyzer: Analyzer = {
  name: "drizzle",
  cache: {
    includeGlobs: ["**/*.schema.ts", "**/schema/**/*.ts", "**/drizzle/migrations/**/*.sql", "**/drizzle.config.*"],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Drizzle and no Drizzle files changed
    if (!hasDrizzleDependency(changeSet) && !hasDrizzleFiles(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      // Handle Drizzle config files
      if (isDrizzleConfig(diff.path)) {
        const additions = getAdditions(diff);
        const deletions = getDeletions(diff);
        const excerpt = extractRepresentativeExcerpt(additions.length > 0 ? additions : deletions);

        const finding: DrizzleSchemaFinding = {
          type: "drizzle-schema",
          kind: "drizzle-schema",
          category: "database",
          confidence: "medium",
          evidence: [createEvidence(diff.path, excerpt)],
          file: diff.path,
          status: diff.status,
          isBreaking: false,
          breakingChanges: [],
          addedTables: [],
          removedTables: [],
          modifiedTables: [],
          tags: ["drizzle-config"],
        };

        findings.push(finding);
        continue;
      }

      // Handle migration SQL files
      if (isDrizzleMigration(diff.path)) {
        const additions = getAdditions(diff);
        const destructiveOps = detectDestructiveMigration(additions);

        if (destructiveOps.length > 0) {
          const excerpt = extractRepresentativeExcerpt(additions);

          const finding: DrizzleSchemaFinding = {
            type: "drizzle-schema",
            kind: "drizzle-schema",
            category: "database",
            confidence: "high",
            evidence: [
              createEvidence(diff.path, excerpt),
              ...destructiveOps.map((op) => createEvidence(diff.path, op)),
            ],
            file: diff.path,
            status: diff.status,
            isBreaking: true,
            breakingChanges: destructiveOps,
            addedTables: [],
            removedTables: [],
            modifiedTables: [],
            tags: ["drizzle-migration", "destructive"],
          };

          findings.push(finding);
        }
        continue;
      }

      // Handle schema files
      if (!isDrizzleSchema(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      const addedTables = extractTables(additions);
      const removedTables = extractTables(deletions);

      // Tables that appear in both are modified
      const modifiedTables = addedTables.filter((t) => removedTables.includes(t));
      const trulyAdded = addedTables.filter((t) => !removedTables.includes(t));
      const trulyRemoved = removedTables.filter((t) => !addedTables.includes(t));

      const breakingChanges = detectBreakingChanges(deletions);

      // Add table removals as breaking changes
      for (const table of trulyRemoved) {
        if (!breakingChanges.some((bc) => bc.includes(table))) {
          breakingChanges.push(`Removed table: ${table}`);
        }
      }

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

      const finding: DrizzleSchemaFinding = {
        type: "drizzle-schema",
        kind: "drizzle-schema",
        category: "database",
        confidence,
        evidence: [createEvidence(diff.path, excerpt)],
        file: diff.path,
        status: diff.status,
        isBreaking,
        breakingChanges: breakingChanges.slice(0, 5),
        addedTables: trulyAdded.slice(0, 10),
        removedTables: trulyRemoved.slice(0, 10),
        modifiedTables: modifiedTables.slice(0, 10),
        tags: isBreaking ? ["breaking"] : undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
