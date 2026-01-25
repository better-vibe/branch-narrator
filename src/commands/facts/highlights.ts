/**
 * Highlights builder - generates prioritized summary bullets from findings.
 *
 * Highlights are ordered by impact (highest first):
 * - Blast radius (high > medium)
 * - Breaking changes (config/API surface)
 * - Risk/security warnings (high-risk flags, destructive SQL, DB migrations, CI security, security files)
 * - Lockfile mismatches
 * - General changes (infra, deps, routes, API contracts)
 * - API surface changes (Stencil, monorepo, env vars)
 * - Test coverage (test changes, gaps)
 * - Informational/fallback
 */

import type { Finding, LockfileFinding } from "../../core/types.js";

// ============================================================================
// Priority Constants (higher = more important, appears first)
// ============================================================================

/** Priority levels for highlight ordering */
export const HIGHLIGHT_PRIORITY = {
  // Highest: Blast radius / impact analysis
  HIGH_BLAST_RADIUS: 100,
  MEDIUM_BLAST_RADIUS: 95,

  // Breaking changes in config/API surface
  BREAKING_CONFIG: 90, // TS, Tailwind, GraphQL, Package exports (breaking variants)

  // Risk/security warnings
  HIGH_RISK_FLAGS: 85,
  DESTRUCTIVE_SQL: 85,
  HIGH_RISK_DB_MIGRATION: 85,
  CI_SECURITY: 85,
  SECURITY_FILES: 85,

  // Dependency warnings
  LOCKFILE_MISMATCH: 80,

  // General changes
  INFRA_CHANGES: 70,
  MAJOR_DEPS: 70,
  ROUTE_CHANGES: 70,
  API_CONTRACTS: 70,
  CLOUDFLARE: 70,

  // API surface / config (non-breaking)
  STENCIL_API: 60,
  MONOREPO_CONFIG: 60,
  ENV_VARS: 60,
  NEW_DEPS: 60,
  NON_BREAKING_CONFIG: 60, // TS, Tailwind, GraphQL, Package exports (non-breaking)

  // Database (non-high-risk)
  DB_MIGRATION: 55,
  CI_WORKFLOW: 55,

  // Test coverage
  TEST_CHANGES: 50,
  CONVENTION_VIOLATIONS: 50,

  // Fallback / informational
  FALLBACK: 10,
} as const;

// ============================================================================
// Internal Types
// ============================================================================

interface PrioritizedHighlight {
  text: string;
  priority: number;
  /** Insertion order for stable sorting within same priority */
  order: number;
}

// ============================================================================
// Highlight Builder
// ============================================================================

/**
 * Build highlights from findings with priority-based ordering.
 * Returns an array of human-readable summary bullets, ordered by impact.
 *
 * @param findings - Array of findings to generate highlights from
 * @returns Array of highlight strings, ordered by priority (highest first)
 */
export function buildHighlights(findings: Finding[]): string[] {
  const items: PrioritizedHighlight[] = [];
  let order = 0;

  const add = (text: string, priority: number) => {
    items.push({ text, priority, order: order++ });
  };

  // -------------------------------------------------------------------------
  // Impact analysis (blast radius) - HIGHEST PRIORITY
  // -------------------------------------------------------------------------
  const impactFindings = findings.filter(f => f.type === "impact-analysis");
  const highImpact = impactFindings.filter(i => i.blastRadius === "high");
  const mediumImpact = impactFindings.filter(i => i.blastRadius === "medium");

  if (highImpact.length > 0) {
    add(
      `${highImpact.length} file(s) with high blast radius`,
      HIGHLIGHT_PRIORITY.HIGH_BLAST_RADIUS
    );
  }
  if (mediumImpact.length > 0) {
    add(
      `${mediumImpact.length} file(s) with medium blast radius`,
      HIGHLIGHT_PRIORITY.MEDIUM_BLAST_RADIUS
    );
  }

  // -------------------------------------------------------------------------
  // Breaking config/API changes
  // -------------------------------------------------------------------------

  // TypeScript config changes
  const tsConfigChanges = findings.filter(f => f.type === "typescript-config");
  if (tsConfigChanges.length > 0) {
    const breaking = tsConfigChanges.some(c => c.isBreaking);
    add(
      breaking ? "TypeScript config changed (breaking)" : "TypeScript config modified",
      breaking ? HIGHLIGHT_PRIORITY.BREAKING_CONFIG : HIGHLIGHT_PRIORITY.NON_BREAKING_CONFIG
    );
  }

  // Tailwind config changes
  const tailwindChanges = findings.filter(f => f.type === "tailwind-config");
  if (tailwindChanges.length > 0) {
    const breaking = tailwindChanges.some(c => c.isBreaking);
    add(
      breaking ? "Tailwind config changed (breaking)" : "Tailwind config modified",
      breaking ? HIGHLIGHT_PRIORITY.BREAKING_CONFIG : HIGHLIGHT_PRIORITY.NON_BREAKING_CONFIG
    );
  }

  // GraphQL schema changes
  const graphqlChanges = findings.filter(f => f.type === "graphql-change");
  if (graphqlChanges.length > 0) {
    const breaking = graphqlChanges.some(g => g.isBreaking);
    add(
      breaking ? "GraphQL schema changed (breaking)" : "GraphQL schema modified",
      breaking ? HIGHLIGHT_PRIORITY.BREAKING_CONFIG : HIGHLIGHT_PRIORITY.NON_BREAKING_CONFIG
    );
  }

  // Package exports changes
  const packageExports = findings.filter(f => f.type === "package-exports");
  if (packageExports.length > 0) {
    const breaking = packageExports.some(p => p.isBreaking);
    if (breaking) {
      add("Package exports changed (breaking)", HIGHLIGHT_PRIORITY.BREAKING_CONFIG);
    } else {
      const binChanges = packageExports.filter(p =>
        p.binChanges && (p.binChanges.added.length > 0 || p.binChanges.removed.length > 0)
      );
      if (binChanges.length > 0) {
        add("Package bin/exports modified", HIGHLIGHT_PRIORITY.NON_BREAKING_CONFIG);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Risk/security warnings
  // -------------------------------------------------------------------------

  // High-risk flags
  const riskFlags = findings.filter(f => f.type === "risk-flag");
  const highRiskFlags = riskFlags.filter(r => r.risk === "high");
  if (highRiskFlags.length > 0) {
    add(
      `${highRiskFlags.length} high-risk condition(s) detected`,
      HIGHLIGHT_PRIORITY.HIGH_RISK_FLAGS
    );
  }

  // Destructive SQL
  const sqlRisks = findings.filter(f => f.type === "sql-risk");
  const destructiveSql = sqlRisks.filter(s => s.riskType === "destructive");
  if (destructiveSql.length > 0) {
    add(
      `Destructive SQL detected in ${destructiveSql.length} file(s)`,
      HIGHLIGHT_PRIORITY.DESTRUCTIVE_SQL
    );
  }

  // Database migrations (high risk variant gets higher priority)
  const dbMigrations = findings.filter(f => f.type === "db-migration");
  if (dbMigrations.length > 0) {
    const highRisk = dbMigrations.some(m => m.risk === "high");
    add(
      highRisk ? "Database migrations (HIGH RISK)" : "Database migrations",
      highRisk ? HIGHLIGHT_PRIORITY.HIGH_RISK_DB_MIGRATION : HIGHLIGHT_PRIORITY.DB_MIGRATION
    );
  }

  // CI/CD workflows (security issues get higher priority)
  const ciWorkflows = findings.filter(f => f.type === "ci-workflow");
  if (ciWorkflows.length > 0) {
    const securityIssues = ciWorkflows.filter(c =>
      c.riskType === "permissions_broadened" || c.riskType === "pull_request_target"
    );
    if (securityIssues.length > 0) {
      add("CI workflow security changes detected", HIGHLIGHT_PRIORITY.CI_SECURITY);
    } else {
      add(`${ciWorkflows.length} CI workflow(s) modified`, HIGHLIGHT_PRIORITY.CI_WORKFLOW);
    }
  }

  // Security-sensitive files
  const securityFiles = findings.filter(f => f.type === "security-file");
  if (securityFiles.length > 0) {
    add("Security-sensitive files changed", HIGHLIGHT_PRIORITY.SECURITY_FILES);
  }

  // -------------------------------------------------------------------------
  // Lockfile mismatch (dependency warning)
  // -------------------------------------------------------------------------
  const lockfileMismatch = findings.find(f => f.type === "lockfile-mismatch") as LockfileFinding | undefined;
  if (lockfileMismatch) {
    if (lockfileMismatch.manifestChanged && !lockfileMismatch.lockfileChanged) {
      add(
        "Lockfile mismatch: package.json changed but lockfile not updated",
        HIGHLIGHT_PRIORITY.LOCKFILE_MISMATCH
      );
    } else if (!lockfileMismatch.manifestChanged && lockfileMismatch.lockfileChanged) {
      add(
        "Lockfile mismatch: lockfile changed but package.json not updated",
        HIGHLIGHT_PRIORITY.LOCKFILE_MISMATCH
      );
    }
  }

  // -------------------------------------------------------------------------
  // General changes (infra, deps, routes, API contracts, cloudflare)
  // -------------------------------------------------------------------------

  // Infrastructure changes
  const infraChanges = findings.filter(f => f.type === "infra-change");
  if (infraChanges.length > 0) {
    const types = [...new Set(infraChanges.map(i => i.infraType))];
    add(`Infrastructure changes: ${types.join(", ")}`, HIGHLIGHT_PRIORITY.INFRA_CHANGES);
  }

  // Major dependency changes
  const depChanges = findings.filter(f => f.type === "dependency-change");
  const majorChanges = depChanges.filter(d => d.impact === "major");
  if (majorChanges.length > 0) {
    add(`${majorChanges.length} major dependency update(s)`, HIGHLIGHT_PRIORITY.MAJOR_DEPS);
  }

  // Route changes
  const routeChanges = findings.filter(f => f.type === "route-change");
  if (routeChanges.length > 0) {
    add(`${routeChanges.length} route(s) changed`, HIGHLIGHT_PRIORITY.ROUTE_CHANGES);
  }

  // API contract changes
  const apiChanges = findings.filter(f => f.type === "api-contract-change");
  if (apiChanges.length > 0) {
    add(`${apiChanges.length} API contract(s) modified`, HIGHLIGHT_PRIORITY.API_CONTRACTS);
  }

  // Cloudflare changes
  const cfChanges = findings.filter(f => f.type === "cloudflare-change");
  if (cfChanges.length > 0) {
    const areas = [...new Set(cfChanges.map(c => c.area))];
    add(`Cloudflare ${areas.join("/")} configuration changed`, HIGHLIGHT_PRIORITY.CLOUDFLARE);
  }

  // -------------------------------------------------------------------------
  // API surface / config (non-breaking) / env vars
  // -------------------------------------------------------------------------

  // Stencil component changes (group all Stencil findings)
  const stencilFindings = findings.filter(f =>
    f.type === "stencil-component-change" ||
    f.type === "stencil-prop-change" ||
    f.type === "stencil-event-change" ||
    f.type === "stencil-method-change" ||
    f.type === "stencil-slot-change"
  );
  if (stencilFindings.length > 0) {
    const components = new Set(stencilFindings.map(s => s.tag));
    add(`${components.size} Stencil component(s) with API changes`, HIGHLIGHT_PRIORITY.STENCIL_API);
  }

  // Monorepo config changes
  const monorepoChanges = findings.filter(f => f.type === "monorepo-config");
  if (monorepoChanges.length > 0) {
    const tools = [...new Set(monorepoChanges.map(m => m.tool))];
    add(`Monorepo config changed: ${tools.join(", ")}`, HIGHLIGHT_PRIORITY.MONOREPO_CONFIG);
  }

  // Environment variables
  const envVars = findings.filter(f => f.type === "env-var");
  if (envVars.length > 0) {
    const added = envVars.filter(e => e.change === "added");
    add(
      added.length > 0
        ? `${added.length} new environment variable(s)`
        : `${envVars.length} environment variable(s) touched`,
      HIGHLIGHT_PRIORITY.ENV_VARS
    );
  }

  // New dependencies
  const newDeps = depChanges.filter(d => d.impact === "new");
  if (newDeps.length > 0) {
    add(`${newDeps.length} new dependency(ies) added`, HIGHLIGHT_PRIORITY.NEW_DEPS);
  }

  // -------------------------------------------------------------------------
  // Test coverage
  // -------------------------------------------------------------------------

  // Test changes
  const testChanges = findings.filter(f => f.type === "test-change");
  if (testChanges.length > 0) {
    const addedCount = testChanges.reduce((sum, t) => sum + t.added.length, 0);
    const modifiedCount = testChanges.reduce((sum, t) => sum + t.modified.length, 0);
    const deletedCount = testChanges.reduce((sum, t) => sum + t.deleted.length, 0);

    const parts: string[] = [];
    if (addedCount > 0) parts.push(`${addedCount} added`);
    if (modifiedCount > 0) parts.push(`${modifiedCount} modified`);
    if (deletedCount > 0) parts.push(`${deletedCount} deleted`);

    if (parts.length > 0) {
      add(`Test files: ${parts.join(", ")}`, HIGHLIGHT_PRIORITY.TEST_CHANGES);
    } else {
      // Fallback for edge cases
      const totalFiles = testChanges.flatMap(t => t.files).length;
      add(`${totalFiles} test file(s) changed`, HIGHLIGHT_PRIORITY.TEST_CHANGES);
    }
  }

  // Convention violations (test gaps)
  const violations = findings.filter(f => f.type === "convention-violation");
  if (violations.length > 0) {
    const totalFiles = violations.reduce((sum, v) => sum + v.files.length, 0);
    add(
      `${totalFiles} source file(s) missing corresponding tests`,
      HIGHLIGHT_PRIORITY.CONVENTION_VIOLATIONS
    );
  }

  // -------------------------------------------------------------------------
  // Fallback: if we have findings but no highlights, show a generic summary
  // -------------------------------------------------------------------------
  if (items.length === 0 && findings.length > 0) {
    // Check for file summary findings to get file counts
    const fileSummary = findings.find(f => f.type === "file-summary");
    if (fileSummary) {
      const total =
        fileSummary.added.length +
        fileSummary.modified.length +
        fileSummary.deleted.length +
        fileSummary.renamed.length;
      if (total > 0) {
        add(`${total} ${fileSummary.category} file(s) changed`, HIGHLIGHT_PRIORITY.FALLBACK);
      }
    }

    // If still empty and we have impact findings, mention them
    if (items.length === 0 && impactFindings.length > 0) {
      const totalAffected = impactFindings.reduce((sum, f) => sum + f.affectedFiles.length, 0);
      add(
        `${impactFindings.length} file(s) analyzed, ${totalAffected} dependent file(s)`,
        HIGHLIGHT_PRIORITY.FALLBACK
      );
    }

    // Last resort: mention the number of findings
    if (items.length === 0) {
      add(`${findings.length} finding(s) detected`, HIGHLIGHT_PRIORITY.FALLBACK);
    }
  }

  // -------------------------------------------------------------------------
  // Sort by priority (descending), then by insertion order (ascending) for stability
  // -------------------------------------------------------------------------
  items.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return a.order - b.order;
  });

  return items.map(item => item.text);
}
