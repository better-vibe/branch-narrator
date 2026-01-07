/**
 * Action derivation from findings and risk.
 */

import type {
  Action,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  ProfileName,
} from "../../core/types.js";

/**
 * Detected package manager type.
 */
type PackageManager = "bun" | "pnpm" | "yarn" | "npm";

/**
 * Detect package manager from findings by looking at lockfiles.
 * Priority: bun > pnpm > yarn > npm
 */
function detectPackageManager(findings: Finding[]): PackageManager {
  // Get all file paths from findings
  const allFiles: string[] = [];

  for (const finding of findings) {
    if (finding.type === "file-summary") {
      const f = finding as FileSummaryFinding;
      allFiles.push(...f.added, ...f.modified, ...f.deleted);
      allFiles.push(...f.renamed.map(r => r.to));
    }
    if (finding.type === "file-category") {
      const f = finding as FileCategoryFinding;
      allFiles.push(...f.categories.dependencies);
    }
  }

  // Check for lockfiles in priority order
  if (allFiles.some(f => f === "bun.lock" || f === "bun.lockb")) {
    return "bun";
  }
  if (allFiles.some(f => f === "pnpm-lock.yaml")) {
    return "pnpm";
  }
  if (allFiles.some(f => f === "yarn.lock")) {
    return "yarn";
  }

  // Default to npm
  return "npm";
}

/**
 * Get run command prefix for package manager.
 */
function getRunCmd(pm: PackageManager): string {
  switch (pm) {
    case "bun":
      return "bun run";
    case "pnpm":
      return "pnpm";
    case "yarn":
      return "yarn";
    case "npm":
      return "npm run";
  }
}

/**
 * Derive actionable recommendations from findings and risk.
 */
export function deriveActions(
  findings: Finding[],
  profile: ProfileName
): Action[] {
  const actions: Action[] = [];
  const pm = detectPackageManager(findings);
  const runCmd = getRunCmd(pm);

  // SvelteKit check
  if (profile === "sveltekit" || profile === "auto") {
    // Check if there are route changes or any significant changes
    const hasRouteChanges = findings.some(f => f.type === "route-change");
    if (hasRouteChanges || findings.length > 0) {
      actions.push({
        id: "sveltekit-check",
        blocking: true,
        reason: "Run SvelteKit type checker to verify no type errors",
        commands: [
          { cmd: `${runCmd} check`, when: "local-or-ci" },
        ],
      });
    }
  }

  // Test execution
  const hasTestChanges = findings.some(f => f.type === "test-change");
  if (hasTestChanges || findings.length > 0) {
    actions.push({
      id: "run-tests",
      blocking: true,
      reason: "Run tests to verify functionality",
      commands: [
        { cmd: `${runCmd} test`, when: "local-or-ci" },
      ],
    });
  }

  // Database migrations
  const dbMigrations = findings.filter(f => f.type === "db-migration");
  if (dbMigrations.length > 0) {
    const hasDangerousSQL = dbMigrations.some(
      m => m.risk === "high"
    );

    actions.push({
      id: "apply-migrations",
      blocking: hasDangerousSQL,
      reason: hasDangerousSQL
        ? "Apply database migrations locally and verify (DANGEROUS SQL DETECTED)"
        : "Apply and test database migrations in development environment",
      commands: [
        { cmd: "supabase db reset --local", when: "local" },
        { cmd: "supabase db push --preview", when: "ci" },
      ],
    });

    if (hasDangerousSQL) {
      actions.push({
        id: "backup-db",
        blocking: true,
        reason: "Create database backup before applying destructive migrations",
        commands: [
          { cmd: "# Ensure database backups are current", when: "local-or-ci" },
        ],
      });
    }
  }

  // Cloudflare changes
  const cloudflareChanges = findings.filter(
    f => f.type === "cloudflare-change"
  );
  if (cloudflareChanges.length > 0) {
    actions.push({
      id: "verify-cloudflare-config",
      blocking: false,
      reason: "Verify Cloudflare configuration and bindings match across environments",
      commands: [
        { cmd: "wrangler whoami", when: "local" },
        { cmd: "# Check bindings in wrangler.toml match remote config", when: "local-or-ci" },
      ],
    });
  }

  // Environment variables
  const envVarChanges = findings.filter(f => f.type === "env-var");
  if (envVarChanges.length > 0) {
    actions.push({
      id: "update-env-docs",
      blocking: false,
      reason: "Update .env.example and documentation with new environment variables",
      commands: [
        { cmd: "# Update .env.example with new variables", when: "local" },
        { cmd: "# Document new environment variables in README", when: "local" },
      ],
    });
  }

  // Dependency changes with high risk
  const majorDependencyChanges = findings.filter(
    f => f.type === "dependency-change" && f.impact === "major"
  );
  if (majorDependencyChanges.length > 0) {
    actions.push({
      id: "review-dependencies",
      blocking: false,
      reason: "Review major dependency changes and update migration guides",
      commands: [
        { cmd: "# Review CHANGELOG for breaking changes", when: "local" },
        { cmd: "# Update dependency documentation", when: "local" },
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
