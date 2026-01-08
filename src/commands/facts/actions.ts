/**
 * Action derivation from findings and risk.
 *
 * Actions provide context about what needs attention and why,
 * without prescribing specific commands. AI agents have more
 * context about the project's setup (package manager, CI system,
 * deployment target) to determine the appropriate commands.
 */

import type {
  Action,
  DbMigrationFinding,
  DependencyChangeFinding,
  EnvVarFinding,
  Finding,
  ProfileName,
} from "../../core/types.js";

/**
 * Derive actionable recommendations from findings and risk.
 *
 * Each action provides:
 * - `id`: Unique identifier
 * - `category`: Grouping category
 * - `blocking`: Whether this blocks PR merge
 * - `reason`: What needs attention and why
 * - `triggers`: Context about what triggered this action
 */
export function deriveActions(
  findings: Finding[],
  profile: ProfileName
): Action[] {
  const actions: Action[] = [];

  // SvelteKit type checking
  if (profile === "sveltekit" || profile === "auto") {
    const hasRouteChanges = findings.some(f => f.type === "route-change");
    if (hasRouteChanges || findings.length > 0) {
      const triggers: string[] = [];
      if (hasRouteChanges) {
        triggers.push("Route files changed");
      }
      if (findings.length > 0 && !hasRouteChanges) {
        triggers.push("Source files changed");
      }

      actions.push({
        id: "sveltekit-check",
        category: "types",
        blocking: true,
        reason: "Run SvelteKit type checker to verify no type errors were introduced",
        triggers,
      });
    }
  }

  // Test execution
  const testFindings = findings.filter(f => f.type === "test-change");
  const hasTestChanges = testFindings.length > 0;
  if (hasTestChanges || findings.length > 0) {
    const triggers: string[] = [];
    if (hasTestChanges) {
      triggers.push(`${testFindings.length} test file(s) changed`);
    }
    if (findings.length > 0 && !hasTestChanges) {
      triggers.push("Source files changed without corresponding test changes");
    }

    actions.push({
      id: "run-tests",
      category: "tests",
      blocking: true,
      reason: "Run test suite to verify functionality and catch regressions",
      triggers,
    });
  }

  // Database migrations
  const dbMigrations = findings.filter(
    (f): f is DbMigrationFinding => f.type === "db-migration"
  );
  if (dbMigrations.length > 0) {
    const hasDangerousSQL = dbMigrations.some(m => m.risk === "high");
    const migrationFiles = dbMigrations.flatMap(m => m.files);
    const reasons = [...new Set(dbMigrations.flatMap(m => m.reasons))];

    const triggers: string[] = [
      `${migrationFiles.length} migration file(s) changed`,
      ...reasons,
    ];

    if (hasDangerousSQL) {
      triggers.push("DANGEROUS SQL DETECTED (DROP, TRUNCATE, or destructive operations)");
    }

    actions.push({
      id: "apply-migrations",
      category: "database",
      blocking: hasDangerousSQL,
      reason: hasDangerousSQL
        ? "Apply database migrations in a safe environment and verify data integrity before production"
        : "Apply and test database migrations in development environment",
      triggers,
    });

    if (hasDangerousSQL) {
      actions.push({
        id: "backup-db",
        category: "database",
        blocking: true,
        reason: "Create database backup before applying destructive migrations",
        triggers: ["High-risk SQL operations detected in migrations"],
      });
    }
  }

  // Cloudflare changes
  const cloudflareChanges = findings.filter(
    f => f.type === "cloudflare-change"
  );
  if (cloudflareChanges.length > 0) {
    const areas = [...new Set(cloudflareChanges.map(f => f.area))];
    const files = cloudflareChanges.flatMap(f => f.files);

    actions.push({
      id: "verify-cloudflare-config",
      category: "cloudflare",
      blocking: false,
      reason: "Verify Cloudflare configuration and bindings match across environments",
      triggers: [
        `Cloudflare ${areas.join(", ")} configuration changed`,
        `Files: ${files.join(", ")}`,
      ],
    });
  }

  // Environment variables
  const envVarChanges = findings.filter(
    (f): f is EnvVarFinding => f.type === "env-var"
  );
  if (envVarChanges.length > 0) {
    const varNames = envVarChanges.map(f => f.name);
    const addedVars = envVarChanges.filter(f => f.change === "added");

    const triggers: string[] = [];
    if (addedVars.length > 0) {
      triggers.push(`New environment variable(s): ${addedVars.map(f => f.name).join(", ")}`);
    }
    if (envVarChanges.length > addedVars.length) {
      triggers.push(`Modified environment variable(s): ${varNames.filter(n => !addedVars.some(a => a.name === n)).join(", ")}`);
    }

    actions.push({
      id: "update-env-docs",
      category: "environment",
      blocking: false,
      reason: "Update .env.example and documentation with new or changed environment variables",
      triggers,
    });
  }

  // Dependency changes with high risk
  const majorDependencyChanges = findings.filter(
    (f): f is DependencyChangeFinding =>
      f.type === "dependency-change" && f.impact === "major"
  );
  if (majorDependencyChanges.length > 0) {
    const deps = majorDependencyChanges.map(f => {
      const from = f.from || "new";
      const to = f.to || "removed";
      return `${f.name} (${from} → ${to})`;
    });

    actions.push({
      id: "review-dependencies",
      category: "dependencies",
      blocking: false,
      reason: "Review major dependency changes for breaking changes and update migration guides if needed",
      triggers: [
        `Major version changes: ${deps.join(", ")}`,
        "Check CHANGELOG and migration guides for breaking changes",
      ],
    });
  }

  // Sort actions deterministically (blocking first, then by id)
  actions.sort((a, b) => {
    if (a.blocking !== b.blocking) {
      return a.blocking ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return actions;
}
