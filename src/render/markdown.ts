/**
 * Markdown PR body renderer.
 */

import type {
  CloudflareChangeFinding,
  ConventionViolationFinding,
  DbMigrationFinding,
  DependencyChangeFinding,
  EnvVarFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  ImpactAnalysisFinding,
  RenderContext,
  RouteChangeFinding,
  SecurityFileFinding,
  TestChangeFinding,
  TestParityViolationFinding,
} from "../core/types.js";
import { routeIdToUrlPath } from "../analyzers/route-detector.js";
import { getCategoryLabel } from "../analyzers/file-category.js";

/**
 * Group findings by type.
 */
function groupFindings(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const finding of findings) {
    if (!groups.has(finding.type)) {
      groups.set(finding.type, []);
    }
    groups.get(finding.type)!.push(finding);
  }
  return groups;
}

/**
 * Render the Context section (interactive mode only).
 */
function renderContext(context: RenderContext): string {
  if (!context.interactive?.context) {
    return "";
  }
  return `## Context\n\n${context.interactive.context}\n\n`;
}

/**
 * Render the Summary section.
 */
function renderSummary(groups: Map<string, Finding[]>): string {
  const bullets: string[] = [];

  const fileSummary = groups.get("file-summary")?.[0] as
    | FileSummaryFinding
    | undefined;
  if (fileSummary) {
    const total =
      fileSummary.added.length +
      fileSummary.modified.length +
      fileSummary.deleted.length +
      fileSummary.renamed.length;
    bullets.push(`${total} file(s) changed`);

    if (fileSummary.added.length > 0) {
      bullets.push(`${fileSummary.added.length} file(s) added`);
    }
    if (fileSummary.deleted.length > 0) {
      bullets.push(`${fileSummary.deleted.length} file(s) deleted`);
    }
  }

  const routeChanges = groups.get("route-change") as
    | RouteChangeFinding[]
    | undefined;
  if (routeChanges && routeChanges.length > 0) {
    const newRoutes = routeChanges.filter((r) => r.change === "added");
    if (newRoutes.length > 0) {
      bullets.push(`${newRoutes.length} new route(s)`);
    }
  }

  const migrations = groups.get("db-migration") as
    | DbMigrationFinding[]
    | undefined;
  if (migrations && migrations.length > 0) {
    bullets.push(`Database migrations detected`);
  }

  const deps = groups.get("dependency-change") as
    | DependencyChangeFinding[]
    | undefined;
  if (deps && deps.length > 0) {
    const majorBumps = deps.filter((d) => d.impact === "major");
    if (majorBumps.length > 0) {
      bullets.push(`${majorBumps.length} major dependency update(s)`);
    }
  }

  const securityFiles = groups.get("security-file") as
    | SecurityFileFinding[]
    | undefined;
  if (securityFiles && securityFiles.length > 0) {
    const totalFiles = securityFiles.reduce(
      (acc, sf) => acc + sf.files.length,
      0
    );
    bullets.push(`${totalFiles} security-sensitive file(s) changed`);
  }

  if (bullets.length === 0) {
    bullets.push("Minor changes detected");
  }

  // Limit to 6 bullets
  const limitedBullets = bullets.slice(0, 6);

  return (
    `## Summary\n\n` +
    limitedBullets.map((b) => `- ${b}`).join("\n") +
    "\n\n"
  );
}

/**
 * Render What Changed section (grouped by category).
 */
function renderWhatChanged(
  categoryFinding: FileCategoryFinding | undefined,
  fileSummary: FileSummaryFinding | undefined
): string {
  if (!categoryFinding || !fileSummary) {
    return "";
  }

  const { categories, summary } = categoryFinding;

  // Skip if no meaningful categorization
  if (summary.length <= 1) {
    return "";
  }

  let output = "## What Changed\n\n";

  // Order categories by count (descending)
  const orderedCategories = summary
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  for (const { category, count } of orderedCategories) {
    const label = getCategoryLabel(category);
    const files = categories[category];

    output += `### ${label} (${count})\n\n`;

    // Show up to 10 files per category
    const displayFiles = files.slice(0, 10);
    for (const file of displayFiles) {
      // Determine if added, modified, or deleted
      let status = "";
      if (fileSummary.added.includes(file)) {
        status = " *(new)*";
      } else if (fileSummary.deleted.includes(file)) {
        status = " *(deleted)*";
      }
      output += `- \`${file}\`${status}\n`;
    }

    if (files.length > 10) {
      output += `- *...and ${files.length - 10} more*\n`;
    }

    output += "\n";
  }

  return output;
}

/**
 * Render Routes / API section.
 */
function renderRoutes(routes: RouteChangeFinding[]): string {
  if (routes.length === 0) {
    return "";
  }

  let output = "## Routes / API\n\n";
  output += "| Route | Type | Change | Methods |\n";
  output += "|-------|------|--------|--------|\n";

  for (const route of routes) {
    const urlPath = routeIdToUrlPath(route.routeId);
    const methods = route.methods?.join(", ") || "-";
    output += `| \`${urlPath}\` | ${route.routeType} | ${route.change} | ${methods} |\n`;
  }

  return output + "\n";
}

/**
 * Render Database (Supabase) section.
 */
function renderDatabase(migrations: DbMigrationFinding[]): string {
  if (migrations.length === 0) {
    return "";
  }

  let output = "## Database (Supabase)\n\n";

  for (const migration of migrations) {
    const riskEmoji =
      migration.risk === "high"
        ? "🔴"
        : migration.risk === "medium"
          ? "🟡"
          : "🟢";
    output += `**Risk Level:** ${riskEmoji} ${migration.risk.toUpperCase()}\n\n`;
    output += "**Files:**\n";
    for (const file of migration.files) {
      output += `- \`${file}\`\n`;
    }
    output += "\n";

    if (migration.reasons.length > 0) {
      output += "**Detected patterns:**\n";
      for (const reason of migration.reasons) {
        output += `- ${reason}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Config / Env section.
 */
function renderEnvVars(envVars: EnvVarFinding[]): string {
  if (envVars.length === 0) {
    return "";
  }

  let output = "## Config / Env\n\n";
  output += "| Variable | Status | Evidence |\n";
  output += "|----------|--------|----------|\n";

  for (const envVar of envVars) {
    const files = envVar.evidenceFiles.slice(0, 2).join(", ");
    output += `| \`${envVar.name}\` | ${envVar.change} | ${files} |\n`;
  }

  return output + "\n";
}

/**
 * Render Cloudflare section.
 */
function renderCloudflare(changes: CloudflareChangeFinding[]): string {
  if (changes.length === 0) {
    return "";
  }

  let output = "## Cloudflare\n\n";

  for (const change of changes) {
    output += `**Area:** ${change.area}\n`;
    output += "**Files:**\n";
    for (const file of change.files) {
      output += `- \`${file}\`\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Dependencies section.
 */
function renderDependencies(deps: DependencyChangeFinding[]): string {
  if (deps.length === 0) {
    return "";
  }

  const prodDeps = deps.filter((d) => d.section === "dependencies");
  const devDeps = deps.filter((d) => d.section === "devDependencies");

  let output = "## Dependencies\n\n";

  if (prodDeps.length > 0) {
    output += "### Production\n\n";
    output += "| Package | From | To | Impact |\n";
    output += "|---------|------|-----|--------|\n";
    for (const dep of prodDeps) {
      output += `| \`${dep.name}\` | ${dep.from ?? "-"} | ${dep.to ?? "-"} | ${dep.impact ?? "-"} |\n`;
    }
    output += "\n";
  }

  if (devDeps.length > 0) {
    output += "### Dev Dependencies\n\n";
    output += "| Package | From | To | Impact |\n";
    output += "|---------|------|-----|--------|\n";
    for (const dep of devDeps) {
      output += `| \`${dep.name}\` | ${dep.from ?? "-"} | ${dep.to ?? "-"} | ${dep.impact ?? "-"} |\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Suggested test plan section.
 */
function renderTestPlan(
  context: RenderContext,
  groups: Map<string, Finding[]>
): string {
  const bullets: string[] = [];

  // Check if vitest tests exist
  const testChanges = groups.get("test-change") as
    | TestChangeFinding[]
    | undefined;
  if (testChanges && testChanges.length > 0) {
    bullets.push("`bun test` - Run test suite");
  }

  // SvelteKit check
  if (context.profile === "sveltekit") {
    bullets.push("`bun run check` - Run SvelteKit type check");
  }

  // Route exercise suggestions
  const routes = groups.get("route-change") as RouteChangeFinding[] | undefined;
  if (routes) {
    const endpoints = routes.filter((r) => r.routeType === "endpoint");
    for (const endpoint of endpoints.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(endpoint.routeId);
      const methods = endpoint.methods?.join("/") || "GET";
      bullets.push(`Test \`${methods} ${urlPath}\` endpoint`);
    }

    const pages = routes.filter(
      (r) => r.routeType === "page" && r.change !== "deleted"
    );
    for (const page of pages.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(page.routeId);
      bullets.push(`Verify \`${urlPath}\` page renders correctly`);
    }
  }

  // Interactive test notes
  if (context.interactive?.testNotes) {
    bullets.push(context.interactive.testNotes);
  }

  if (bullets.length === 0) {
    bullets.push("No specific test suggestions");
  }

  let output = "## Suggested Test Plan\n\n";
  output += bullets.map((b) => `- [ ] ${b}`).join("\n") + "\n\n";

  return output;
}

/**
 * Render Risks / Notes section.
 */
function renderRisks(context: RenderContext): string {
  const { riskScore } = context;

  const levelEmoji =
    riskScore.level === "high"
      ? "🔴"
      : riskScore.level === "medium"
        ? "🟡"
        : "🟢";

  let output = "## Risks / Notes\n\n";
  output += `**Overall Risk:** ${levelEmoji} ${riskScore.level.toUpperCase()} (score: ${riskScore.score}/100)\n\n`;

  const bullets = riskScore.evidenceBullets ?? [];
  if (bullets.length > 0) {
    for (const bullet of bullets) {
      output += `- ${bullet}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render findings into a Markdown PR body.
 */
export function renderMarkdown(context: RenderContext): string {
  const groups = groupFindings(context.findings);

  let output = "";

  // Context (interactive only)
  output += renderContext(context);

  // Summary
  output += renderSummary(groups);

  // What Changed (grouped by category)
  const categoryFinding = groups.get("file-category")?.[0] as
    | FileCategoryFinding
    | undefined;
  const fileSummary = groups.get("file-summary")?.[0] as
    | FileSummaryFinding
    | undefined;
  output += renderWhatChanged(categoryFinding, fileSummary);

  // Routes / API
  const routes = (groups.get("route-change") as RouteChangeFinding[]) ?? [];
  output += renderRoutes(routes);

  // Database (Supabase)
  const migrations =
    (groups.get("db-migration") as DbMigrationFinding[]) ?? [];
  output += renderDatabase(migrations);

  // Config / Env
  const envVars = (groups.get("env-var") as EnvVarFinding[]) ?? [];
  output += renderEnvVars(envVars);

  // Cloudflare
  const cloudflare =
    (groups.get("cloudflare-change") as CloudflareChangeFinding[]) ?? [];
  output += renderCloudflare(cloudflare);

  // Dependencies
  const deps =
    (groups.get("dependency-change") as DependencyChangeFinding[]) ?? [];
  output += renderDependencies(deps);

  // Convention Violations
  const violations =
    (groups.get("convention-violation") as ConventionViolationFinding[]) ?? [];
  if (violations.length > 0) {
    output += "## ⚠️ Conventions\n\n";
    for (const v of violations) {
      output += `- **${v.message}**\n`;
      for (const file of v.files.slice(0, 5)) {
        output += `  - \`${file}\`\n`;
      }
      if (v.files.length > 5) {
        output += `  - ...and ${v.files.length - 5} more\n`;
      }
    }
    output += "\n";
  }

  // Test Parity Violations
  const testParityViolations =
    (groups.get("test-parity-violation") as TestParityViolationFinding[]) ?? [];
  if (testParityViolations.length > 0) {
    output += "## 🧪 Test Coverage Gaps\n\n";
    output += `Found ${testParityViolations.length} source file(s) without corresponding tests:\n\n`;
    for (const v of testParityViolations.slice(0, 10)) {
      const confidenceLabel = v.confidence === "high" ? "🔴" : v.confidence === "medium" ? "🟡" : "⚪";
      output += `- ${confidenceLabel} \`${v.sourceFile}\`\n`;
    }
    if (testParityViolations.length > 10) {
      output += `- ...and ${testParityViolations.length - 10} more\n`;
    }
    output += "\n";
  }

  // Impact Analysis
  const impacts =
    (groups.get("impact-analysis") as ImpactAnalysisFinding[]) ?? [];
  if (impacts.length > 0) {
    output += "## 🧨 Impact Analysis\n\n";
    for (const impact of impacts) {
      const radiusEmoji = impact.blastRadius === "high" ? "🔴" : impact.blastRadius === "medium" ? "🟡" : "🟢";
      output += `### \`${impact.sourceFile}\` ${radiusEmoji}\n\n`;
      output += `**Blast Radius:** ${impact.blastRadius.toUpperCase()} (${impact.affectedFiles.length} files)\n\n`;
      output += "Affected files:\n";
      for (const f of impact.affectedFiles.slice(0, 5)) {
        output += `- \`${f}\`\n`;
      }
      if (impact.affectedFiles.length > 5) {
        output += `- ...and ${impact.affectedFiles.length - 5} more\n`;
      }
      output += "\n";
    }
  }

  // Suggested test plan
  output += renderTestPlan(context, groups);

  // Risks / Notes
  output += renderRisks(context);

  return output.trim() + "\n";
}

