/**
 * Markdown PR body renderer.
 * No emojis - plain text for clean PR descriptions.
 */

import type {
  AngularComponentChangeFinding,
  APIContractChangeFinding,
  CIWorkflowFinding,
  CloudflareChangeFinding,
  ConventionViolationFinding,
  DbMigrationFinding,
  DependencyChangeFinding,
  EnvVarFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  GraphQLChangeFinding,
  ImpactAnalysisFinding,
  InfraChangeFinding,
  LargeDiffFinding,
  LockfileFinding,
  MonorepoConfigFinding,
  PackageExportsFinding,
  PythonConfigFinding,
  PythonMigrationFinding,
  RenderContext,
  RouteChangeFinding,
  SecurityFileFinding,
  SQLRiskFinding,
  StencilComponentChangeFinding,
  StencilEventChangeFinding,
  StencilMethodChangeFinding,
  StencilPropChangeFinding,
  StencilSlotChangeFinding,
  TailwindConfigFinding,
  TestChangeFinding,
  TypeScriptConfigFinding,
  ViteConfigFinding,
} from "../core/types.js";
import { routeIdToUrlPath } from "../analyzers/route-detector.js";
import { getCategoryLabel } from "../analyzers/file-category.js";
import { getSecurityReasonLabel } from "../analyzers/security-files.js";
import {
  buildSummaryData,
  formatDiffstat,
  formatRiskLevel,
  type TopFinding,
} from "./summary.js";

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
 * Render the Summary section with diffstat and key highlights.
 */
function renderSummary(
  _context: RenderContext,
  summaryData: ReturnType<typeof buildSummaryData>
): string {
  const { diffstat, reviewAttention, topFindings, hasChangesets } = summaryData;
  const bullets: string[] = [];

  // Files line with diffstat
  bullets.push(`Files: ${formatDiffstat(diffstat)}`);

  // Review attention (blast radius based)
  if (reviewAttention === "HIGH" || reviewAttention === "MEDIUM") {
    bullets.push(`Review attention: ${reviewAttention} (blast radius)`);
  }

  // Key highlights from top findings (first 3)
  for (const finding of topFindings.slice(0, 3)) {
    bullets.push(finding.description);
  }

  // Changeset mention
  if (hasChangesets) {
    bullets.push("Changeset added");
  }

  return `## Summary\n\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n`;
}

/**
 * Render Top findings section.
 */
function renderTopFindings(topFindings: TopFinding[]): string {
  if (topFindings.length === 0) {
    return "";
  }

  let output = "## Top findings\n\n";

  let index = 1;
  for (const finding of topFindings) {
    output += `${index}) ${finding.description}`;

    if (finding.examples.length > 0) {
      const examplesStr = finding.examples
        .map((e) => `\`${e}\``)
        .join(", ");
      const moreStr = finding.moreCount > 0 ? ` (+${finding.moreCount} more)` : "";
      output += `\n   ${examplesStr}${moreStr}`;
    }

    output += "\n\n";
    index++;
  }

  return output;
}

/**
 * Render What Changed section (grouped by category with Changesets separated).
 */
function renderWhatChanged(
  categoryFinding: FileCategoryFinding | undefined,
  fileSummary: FileSummaryFinding | undefined,
  summaryData: ReturnType<typeof buildSummaryData>
): string {
  if (!categoryFinding || !fileSummary) {
    return "";
  }

  const { categories, summary } = categoryFinding;
  const { primaryFiles, changesetFiles } = summaryData;

  // Skip if no meaningful categorization
  const totalFiles = summary.reduce((sum, s) => sum + s.count, 0);
  if (totalFiles === 0) {
    return "";
  }

  let output = "## What changed\n\n";

  // Primary files block (for small changes)
  if (primaryFiles.length > 0) {
    output += "### Primary files\n\n";
    for (const file of primaryFiles) {
      const status = fileSummary.added.includes(file)
        ? " (new)"
        : fileSummary.modified.includes(file)
          ? " (modified)"
          : "";
      output += `- \`${file}\`${status}\n`;
    }
    output += "\n";
  }

  // Order categories by count (descending)
  const orderedCategories = summary
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  for (const { category } of orderedCategories) {
    let files = categories[category];
    const label = getCategoryLabel(category);

    // Handle docs category - separate changesets
    if (category === "docs") {
      const nonChangesetDocs = files.filter(
        (f) => !f.startsWith(".changeset/")
      );
      if (nonChangesetDocs.length === 0 && changesetFiles.length > 0) {
        // Only changesets, skip docs category, render changesets below
        continue;
      }
      files = nonChangesetDocs;
      if (files.length === 0) {
        continue;
      }
    }

    output += `### ${label} (${files.length})\n\n`;

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

  // Changesets section (separate from docs)
  if (changesetFiles.length > 0) {
    output += `### Changesets (${changesetFiles.length})\n\n`;
    for (const file of changesetFiles) {
      const status = fileSummary.added.includes(file) ? " *(new)*" : "";
      output += `- \`${file}\`${status}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Suggested test plan section with rationales.
 */
function renderTestPlan(
  context: RenderContext,
  groups: Map<string, Finding[]>
): string {
  const bullets: { cmd: string; rationale: string }[] = [];

  // Check if test files were changed
  const testChanges = groups.get("test-change") as
    | TestChangeFinding[]
    | undefined;
  if (testChanges && testChanges.length > 0) {
    const allTestFiles = testChanges.flatMap((t) => t.files);

    // Targeted test if only one file changed
    if (allTestFiles.length === 1) {
      bullets.push({
        cmd: `bun test ${allTestFiles[0]}`,
        rationale: "targeted",
      });
    } else {
      bullets.push({
        cmd: "bun test",
        rationale: `${allTestFiles.length} test files changed`,
      });
    }
  }

  // Profile-specific test commands
  const profileCommands: Record<string, { cmd: string; rationale: string }[]> = {
    sveltekit: [{ cmd: "bun run check", rationale: "SvelteKit profile" }],
    next: [{ cmd: "bun run build", rationale: "Next.js profile" }],
    vue: [{ cmd: "bun run build", rationale: "Vue profile" }],
    astro: [{ cmd: "bun run build", rationale: "Astro profile" }],
    stencil: [{ cmd: "bun run build", rationale: "Stencil profile" }],
    angular: [{ cmd: "ng build", rationale: "Angular profile" }],
    library: [{ cmd: "bun run build", rationale: "library profile" }],
    python: [{ cmd: "pytest", rationale: "Python profile" }],
    vite: [{ cmd: "bun run build", rationale: "Vite profile" }],
  };

  const cmds = profileCommands[context.profile] ?? [];
  for (const { cmd, rationale } of cmds) {
    bullets.push({ cmd, rationale });
  }

  // Route exercise suggestions
  const routes = groups.get("route-change") as RouteChangeFinding[] | undefined;
  if (routes) {
    const endpoints = routes.filter((r) => r.routeType === "endpoint");
    for (const endpoint of endpoints.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(endpoint.routeId);
      const methods = endpoint.methods?.join("/") || "GET";
      bullets.push({
        cmd: `Test \`${methods} ${urlPath}\` endpoint`,
        rationale: "route changed",
      });
    }

    const pages = routes.filter(
      (r) => r.routeType === "page" && r.change !== "deleted"
    );
    for (const page of pages.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(page.routeId);
      bullets.push({
        cmd: `Verify \`${urlPath}\` page renders correctly`,
        rationale: "page changed",
      });
    }
  }

  // Interactive test notes
  if (context.interactive?.testNotes) {
    bullets.push({
      cmd: context.interactive.testNotes,
      rationale: "user note",
    });
  }

  if (bullets.length === 0) {
    return "";
  }

  let output = "## Suggested test plan\n\n";
  for (const { cmd, rationale } of bullets) {
    output += `- [ ] \`${cmd}\` (${rationale})\n`;
  }
  output += "\n";

  return output;
}

/**
 * Render Notes section (risk summary + evidence).
 */
function renderNotes(context: RenderContext): string {
  const { riskScore } = context;

  let output = "## Notes\n\n";
  output += `- Risk: ${formatRiskLevel(riskScore)}\n`;

  const bullets = riskScore.evidenceBullets ?? [];
  if (bullets.length === 0 && riskScore.level === "low") {
    output += `- No elevated risks detected.\n`;
  } else {
    for (const bullet of bullets) {
      // Remove emoji prefixes if present
      const cleanBullet = bullet
        .replace(/^[⚠️⚡ℹ️✅]\s*/, "")
        .replace(/^[\u2600-\u27FF]\s*/, "");
      output += `- ${cleanBullet}\n`;
    }
  }
  output += "\n";

  return output;
}

// ============================================================================
// Details Section (Extended Information)
// ============================================================================

/**
 * Render Routes / API section.
 */
function renderRoutes(routes: RouteChangeFinding[]): string {
  if (routes.length === 0) {
    return "";
  }

  let output = "### Routes / API\n\n";
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
 * Render API Contract changes.
 */
function renderAPIContracts(contracts: APIContractChangeFinding[]): string {
  if (contracts.length === 0) {
    return "";
  }

  let output = "### API Contracts\n\n";
  output += "The following API specification files have changed:\n\n";

  for (const contract of contracts) {
    for (const file of contract.files) {
      output += `- \`${file}\`\n`;
    }
  }
  output += "\n";

  return output;
}

/**
 * Render Database (Supabase) section.
 */
function renderDatabase(migrations: DbMigrationFinding[]): string {
  if (migrations.length === 0) {
    return "";
  }

  let output = "### Database (Supabase)\n\n";

  for (const migration of migrations) {
    output += `**Risk Level:** ${migration.risk.toUpperCase()}\n\n`;
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

  let output = "### Config / Env\n\n";
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

  let output = "### Cloudflare\n\n";

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

  let output = "### Dependencies\n\n";

  if (prodDeps.length > 0) {
    output += "**Production**\n\n";
    output += "| Package | From | To | Impact |\n";
    output += "|---------|------|-----|--------|\n";
    for (const dep of prodDeps) {
      output += `| \`${dep.name}\` | ${dep.from ?? "-"} | ${dep.to ?? "-"} | ${dep.impact ?? "-"} |\n`;
    }
    output += "\n";
  }

  if (devDeps.length > 0) {
    output += "**Dev Dependencies**\n\n";
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
 * Render Security section showing security-sensitive files.
 */
function renderSecurityFiles(securityFiles: SecurityFileFinding[]): string {
  if (securityFiles.length === 0) {
    return "";
  }

  let output = "### Security-Sensitive Files\n\n";
  output +=
    "The following files touch authentication, authorization, or security-critical code:\n\n";

  // Collect all files with their reasons
  type SecurityFileReason = SecurityFileFinding["reasons"][number];
  const fileReasons = new Map<string, SecurityFileReason[]>();
  for (const sf of securityFiles) {
    for (const file of sf.files) {
      if (!fileReasons.has(file)) {
        fileReasons.set(file, []);
      }
      for (const reason of sf.reasons) {
        if (!fileReasons.get(file)!.includes(reason)) {
          fileReasons.get(file)!.push(reason);
        }
      }
    }
  }

  // Render file list with reasons
  const sortedFiles = [...fileReasons.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
  for (const [file, reasons] of sortedFiles.slice(0, 10)) {
    const reasonLabels = reasons
      .map((r) => getSecurityReasonLabel(r))
      .join(", ");
    output += `- \`${file}\` *(${reasonLabels})*\n`;
  }

  if (sortedFiles.length > 10) {
    output += `- ...and ${sortedFiles.length - 10} more\n`;
  }

  output += "\n";
  return output;
}

/**
 * Render GraphQL Schema section.
 */
function renderGraphQL(changes: GraphQLChangeFinding[]): string {
  if (changes.length === 0) {
    return "";
  }

  let output = "### GraphQL Schema\n\n";

  // Check for breaking changes
  const breakingChanges = changes.filter((c) => c.isBreaking);
  if (breakingChanges.length > 0) {
    output += "**Breaking Changes**\n\n";
    for (const change of breakingChanges) {
      output += `**File:** \`${change.file}\`\n`;
      if (change.breakingChanges.length > 0) {
        for (const bc of change.breakingChanges) {
          output += `- ${bc}\n`;
        }
      }
      output += "\n";
    }
  }

  // Show added elements
  const withAdditions = changes.filter((c) => c.addedElements.length > 0);
  if (withAdditions.length > 0) {
    output += "**Added Elements**\n\n";
    for (const change of withAdditions) {
      output += `**File:** \`${change.file}\`\n`;
      for (const elem of change.addedElements.slice(0, 10)) {
        output += `- ${elem}\n`;
      }
      if (change.addedElements.length > 10) {
        output += `- ...and ${change.addedElements.length - 10} more\n`;
      }
      output += "\n";
    }
  }

  // Summary table for all changes
  output += "**All Schema Changes**\n\n";
  output += "| File | Status | Breaking |\n";
  output += "|------|--------|----------|\n";
  for (const change of changes) {
    const breakingText = change.isBreaking ? "Yes" : "No";
    output += `| \`${change.file}\` | ${change.status} | ${breakingText} |\n`;
  }
  output += "\n";

  return output;
}

/**
 * Render TypeScript Config section.
 */
function renderTypeScriptConfig(configs: TypeScriptConfigFinding[]): string {
  if (configs.length === 0) {
    return "";
  }

  let output = "**TypeScript Configuration**\n\n";

  for (const config of configs) {
    const breakingText = config.isBreaking ? "(BREAKING)" : "";
    output += `**File:** \`${config.file}\` ${breakingText}\n\n`;

    // Strictness changes
    if (config.strictnessChanges.length > 0) {
      output += "Strictness Changes:\n";
      for (const change of config.strictnessChanges) {
        output += `- ${change}\n`;
      }
      output += "\n";
    }

    // Changed options
    const { added, removed, modified } = config.changedOptions;
    if (added.length > 0) {
      output += `**Added:** ${added.map((o) => `\`${o}\``).join(", ")}\n`;
    }
    if (removed.length > 0) {
      output += `**Removed:** ${removed.map((o) => `\`${o}\``).join(", ")}\n`;
    }
    if (modified.length > 0) {
      output += `**Modified:** ${modified.map((o) => `\`${o}\``).join(", ")}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Tailwind Config section.
 */
function renderTailwindConfig(configs: TailwindConfigFinding[]): string {
  if (configs.length === 0) {
    return "";
  }

  let output = "**Tailwind Configuration**\n\n";

  for (const config of configs) {
    const breakingText = config.isBreaking ? "(BREAKING)" : "";
    output += `**File:** \`${config.file}\` (${config.configType}) ${breakingText}\n\n`;

    if (config.affectedSections.length > 0) {
      output += "Affected Sections:\n";
      for (const section of config.affectedSections) {
        output += `- ${section}\n`;
      }
      output += "\n";
    }

    if (config.isBreaking && config.breakingReasons.length > 0) {
      output += "Breaking Changes:\n";
      for (const reason of config.breakingReasons) {
        output += `- ${reason}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Monorepo Config section.
 */
function renderMonorepoConfig(configs: MonorepoConfigFinding[]): string {
  if (configs.length === 0) {
    return "";
  }

  let output = "**Monorepo Configuration**\n\n";

  for (const config of configs) {
    output += `**Tool:** ${config.tool}\n`;
    output += `**File:** \`${config.file}\`\n\n`;

    if (config.affectedFields.length > 0) {
      output += "Changed Fields:\n";
      for (const field of config.affectedFields) {
        output += `- ${field}\n`;
      }
      output += "\n";
    }

    if (config.impacts.length > 0) {
      output += "Impacts:\n";
      for (const impact of config.impacts) {
        output += `- ${impact}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Vite Config section.
 */
function renderViteConfig(configs: ViteConfigFinding[]): string {
  if (configs.length === 0) {
    return "";
  }

  let output = "**Vite Configuration**\n\n";

  for (const config of configs) {
    const breakingText = config.isBreaking ? "(BREAKING)" : "";
    output += `**File:** \`${config.file}\` ${breakingText}\n\n`;

    // Show detected plugins
    if (config.pluginsDetected.length > 0) {
      output += `**Plugins:** ${config.pluginsDetected.map((p) => `\`${p}\``).join(", ")}\n`;
    }

    if (config.affectedSections.length > 0) {
      output += "Affected Sections:\n";
      for (const section of config.affectedSections.slice(0, 5)) {
        output += `- ${section}\n`;
      }
      if (config.affectedSections.length > 5) {
        output += `- ...and ${config.affectedSections.length - 5} more\n`;
      }
      output += "\n";
    }

    if (config.isBreaking && config.breakingReasons.length > 0) {
      output += "Breaking Changes:\n";
      for (const reason of config.breakingReasons) {
        output += `- ${reason}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render combined Configuration section.
 */
function renderConfiguration(
  tsConfigs: TypeScriptConfigFinding[],
  tailwindConfigs: TailwindConfigFinding[],
  monorepoConfigs: MonorepoConfigFinding[],
  viteConfigs: ViteConfigFinding[]
): string {
  const hasTsConfig = tsConfigs.length > 0;
  const hasTailwind = tailwindConfigs.length > 0;
  const hasMonorepo = monorepoConfigs.length > 0;
  const hasVite = viteConfigs.length > 0;

  if (!hasTsConfig && !hasTailwind && !hasMonorepo && !hasVite) {
    return "";
  }

  let output = "### Configuration Changes\n\n";

  if (hasTsConfig) {
    output += renderTypeScriptConfig(tsConfigs);
  }
  if (hasTailwind) {
    output += renderTailwindConfig(tailwindConfigs);
  }
  if (hasVite) {
    output += renderViteConfig(viteConfigs);
  }
  if (hasMonorepo) {
    output += renderMonorepoConfig(monorepoConfigs);
  }

  return output;
}

/**
 * Render Package Exports / API section.
 */
function renderPackageExports(exports: PackageExportsFinding[]): string {
  if (exports.length === 0) {
    return "";
  }

  let output = "### Package API\n\n";

  for (const exp of exports) {
    const breakingText = exp.isBreaking ? "Breaking" : "Non-breaking";
    output += `**Status:** ${breakingText}\n\n`;

    // Removed exports (breaking)
    if (exp.removedExports.length > 0) {
      output += "**Removed Exports**\n\n";
      for (const removed of exp.removedExports) {
        output += `- \`${removed}\`\n`;
      }
      output += "\n";
    }

    // Added exports
    if (exp.addedExports.length > 0) {
      output += "**Added Exports**\n\n";
      for (const added of exp.addedExports) {
        output += `- \`${added}\`\n`;
      }
      output += "\n";
    }

    // Legacy field changes
    if (exp.legacyFieldChanges.length > 0) {
      output += "**Entry Point Changes**\n\n";
      output += "| Field | From | To |\n";
      output += "|-------|------|----|\n";
      for (const change of exp.legacyFieldChanges) {
        output += `| \`${change.field}\` | ${change.from ?? "-"} | ${change.to ?? "-"} |\n`;
      }
      output += "\n";
    }

    // Bin changes
    if (exp.binChanges.added.length > 0 || exp.binChanges.removed.length > 0) {
      output += "**Binary Commands**\n\n";
      if (exp.binChanges.added.length > 0) {
        output += `**Added:** ${exp.binChanges.added.map((b) => `\`${b}\``).join(", ")}\n`;
      }
      if (exp.binChanges.removed.length > 0) {
        output += `**Removed:** ${exp.binChanges.removed.map((b) => `\`${b}\``).join(", ")}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Stencil Component API changes.
 */
function renderStencilChanges(groups: Map<string, Finding[]>): string {
  const componentChanges =
    (groups.get("stencil-component-change") as StencilComponentChangeFinding[]) ?? [];
  const propChanges =
    (groups.get("stencil-prop-change") as StencilPropChangeFinding[]) ?? [];
  const eventChanges =
    (groups.get("stencil-event-change") as StencilEventChangeFinding[]) ?? [];
  const methodChanges =
    (groups.get("stencil-method-change") as StencilMethodChangeFinding[]) ?? [];
  const slotChanges =
    (groups.get("stencil-slot-change") as StencilSlotChangeFinding[]) ?? [];

  const hasChanges =
    componentChanges.length > 0 ||
    propChanges.length > 0 ||
    eventChanges.length > 0 ||
    methodChanges.length > 0 ||
    slotChanges.length > 0;

  if (!hasChanges) {
    return "";
  }

  let output = "### Component API (Stencil)\n\n";

  // Group all changes by component tag
  const byTag = new Map<
    string,
    {
      component?: StencilComponentChangeFinding;
      props: StencilPropChangeFinding[];
      events: StencilEventChangeFinding[];
      methods: StencilMethodChangeFinding[];
      slots: StencilSlotChangeFinding[];
    }
  >();

  // Initialize groups for all tags
  const initTag = (tag: string) => {
    if (!byTag.has(tag)) {
      byTag.set(tag, { props: [], events: [], methods: [], slots: [] });
    }
  };

  for (const c of componentChanges) {
    initTag(c.tag);
    byTag.get(c.tag)!.component = c;
  }
  for (const p of propChanges) {
    initTag(p.tag);
    byTag.get(p.tag)!.props.push(p);
  }
  for (const e of eventChanges) {
    initTag(e.tag);
    byTag.get(e.tag)!.events.push(e);
  }
  for (const m of methodChanges) {
    initTag(m.tag);
    byTag.get(m.tag)!.methods.push(m);
  }
  for (const s of slotChanges) {
    initTag(s.tag);
    byTag.get(s.tag)!.slots.push(s);
  }

  // Render each component
  for (const [tag, changes] of byTag) {
    output += `**\`<${tag}>\`**\n\n`;

    // Component-level changes
    if (changes.component) {
      const c = changes.component;
      output += `**Component:** ${c.change}`;
      if (c.change === "tag-changed") {
        output += ` (${c.fromTag} → ${c.toTag})`;
      }
      if (c.change === "shadow-changed") {
        output += ` (shadow: ${c.fromShadow} → ${c.toShadow})`;
      }
      output += `\n`;
      output += `**File:** \`${c.file}\`\n\n`;
    }

    // Props
    if (changes.props.length > 0) {
      output += "**Props:**\n";
      for (const p of changes.props) {
        let detail = "";
        if (p.details?.typeText) {
          detail = `: ${p.details.typeText}`;
        }
        output += `- \`${p.propName}\`${detail} (${p.change})\n`;
      }
      output += "\n";
    }

    // Events
    if (changes.events.length > 0) {
      output += "**Events:**\n";
      for (const e of changes.events) {
        output += `- \`${e.eventName}\` (${e.change})\n`;
      }
      output += "\n";
    }

    // Methods
    if (changes.methods.length > 0) {
      output += "**Methods:**\n";
      for (const m of changes.methods) {
        const sig = m.signature ? `: ${m.signature}` : "";
        output += `- \`${m.methodName}\`${sig} (${m.change})\n`;
      }
      output += "\n";
    }

    // Slots
    if (changes.slots.length > 0) {
      output += "**Slots:**\n";
      for (const s of changes.slots) {
        const slotName = s.slotName === "default" ? "(default)" : `"${s.slotName}"`;
        output += `- ${slotName} (${s.change})\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Angular Component changes.
 */
function renderAngularChanges(groups: Map<string, Finding[]>): string {
  const componentChanges =
    (groups.get("angular-component-change") as AngularComponentChangeFinding[]) ?? [];

  if (componentChanges.length === 0) {
    return "";
  }

  let output = "### Angular Components\n\n";

  // Group by component type
  const byType = new Map<string, AngularComponentChangeFinding[]>();
  for (const change of componentChanges) {
    const type = change.componentType;
    if (!byType.has(type)) {
      byType.set(type, []);
    }
    byType.get(type)!.push(change);
  }

  // Render table for each type
  for (const [type, changes] of byType) {
    const typeLabel = type.charAt(0).toUpperCase() + type.slice(1) + "s";
    output += `**${typeLabel}**\n\n`;
    output += "| File | Change | Selector | Standalone |\n";
    output += "|------|--------|----------|------------|\n";

    for (const change of changes) {
      const selector = change.selector || "-";
      const standalone =
        change.standalone !== undefined
          ? change.standalone
            ? "Yes"
            : "No"
          : "-";
      output += `| \`${change.file}\` | ${change.change} | \`${selector}\` | ${standalone} |\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render CI Workflow findings.
 */
function renderCIWorkflow(findings: CIWorkflowFinding[]): string {
  if (findings.length === 0) {
    return "";
  }

  let output = "### CI Workflows\n\n";

  for (const finding of findings) {
    const riskLabel = finding.riskType.replace(/_/g, " ");
    output += `**${riskLabel}**\n`;
    output += `- File: \`${finding.file}\`\n`;
    output += `- ${finding.details}\n\n`;
  }

  return output;
}

/**
 * Render SQL Risk findings.
 */
function renderSQLRisk(findings: SQLRiskFinding[]): string {
  if (findings.length === 0) {
    return "";
  }

  let output = "### SQL Risk\n\n";

  for (const finding of findings) {
    const riskLabel = finding.riskType.replace(/_/g, " ");
    output += `**${riskLabel}**\n`;
    output += `- File: \`${finding.file}\`\n`;
    output += `- ${finding.details}\n\n`;
  }

  return output;
}

/**
 * Render Infrastructure changes.
 */
function renderInfraChanges(findings: InfraChangeFinding[]): string {
  if (findings.length === 0) {
    return "";
  }

  let output = "### Infrastructure\n\n";

  // Group by infra type
  const byType = new Map<string, InfraChangeFinding[]>();
  for (const finding of findings) {
    if (!byType.has(finding.infraType)) {
      byType.set(finding.infraType, []);
    }
    byType.get(finding.infraType)!.push(finding);
  }

  for (const [infraType, typeFindings] of byType) {
    const label =
      infraType === "dockerfile"
        ? "Docker"
        : infraType === "terraform"
          ? "Terraform"
          : infraType === "k8s"
            ? "Kubernetes"
            : infraType;

    output += `**${label}:**\n`;
    const allFiles = typeFindings.flatMap((f) => f.files);
    for (const file of allFiles) {
      output += `- \`${file}\`\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render combined CI / Infrastructure section.
 */
function renderCIInfrastructure(
  ciFindings: CIWorkflowFinding[],
  infraFindings: InfraChangeFinding[]
): string {
  if (ciFindings.length === 0 && infraFindings.length === 0) {
    return "";
  }

  let output = "";
  output += renderCIWorkflow(ciFindings);
  output += renderInfraChanges(infraFindings);

  return output;
}

/**
 * Render Python migrations section.
 */
function renderPythonMigrations(migrations: PythonMigrationFinding[]): string {
  if (migrations.length === 0) {
    return "";
  }

  let output = "### Database (Python)\n\n";

  for (const migration of migrations) {
    const toolLabel = migration.tool === "alembic" ? "Alembic" : "Django";
    output += `**Tool:** ${toolLabel}\n`;
    output += `**Risk Level:** ${migration.risk.toUpperCase()}\n\n`;
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
 * Render Python configuration section.
 */
function renderPythonConfig(configs: PythonConfigFinding[]): string {
  if (configs.length === 0) {
    return "";
  }

  let output = "**Python Configuration**\n\n";

  for (const config of configs) {
    const breakingText = config.isBreaking ? "(BREAKING)" : "";
    output += `**File:** \`${config.file}\` (${config.configType}) ${breakingText}\n\n`;

    if (config.affectedSections.length > 0) {
      output += "Affected Sections:\n";
      for (const section of config.affectedSections.slice(0, 5)) {
        output += `- ${section}\n`;
      }
      if (config.affectedSections.length > 5) {
        output += `- ...and ${config.affectedSections.length - 5} more\n`;
      }
      output += "\n";
    }

    if (config.isBreaking && config.breakingReasons.length > 0) {
      output += "Breaking Changes:\n";
      for (const reason of config.breakingReasons) {
        output += `- ${reason}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Warnings section (large-diff, lockfile-mismatch).
 */
function renderWarnings(groups: Map<string, Finding[]>): string {
  const largeDiff = (groups.get("large-diff") as LargeDiffFinding[]) ?? [];
  const lockfileMismatch =
    (groups.get("lockfile-mismatch") as LockfileFinding[]) ?? [];

  const hasWarnings =
    largeDiff.length > 0 || lockfileMismatch.length > 0;

  if (!hasWarnings) {
    return "";
  }

  let output = "### Warnings\n\n";

  // Large diff warning
  for (const ld of largeDiff) {
    output += `- **Large diff detected:** ${ld.filesChanged} files changed, ${ld.linesChanged} lines modified\n`;
  }

  // Lockfile mismatch warning
  for (const lm of lockfileMismatch) {
    if (lm.manifestChanged && !lm.lockfileChanged) {
      output += `- **Lockfile mismatch:** package.json changed but lockfile not updated\n`;
    } else if (!lm.manifestChanged && lm.lockfileChanged) {
      output += `- **Lockfile mismatch:** lockfile changed but package.json not updated\n`;
    }
  }

  output += "\n";
  return output;
}

/**
 * Render Impact Analysis section.
 */
function renderImpactAnalysis(
  impacts: ImpactAnalysisFinding[]
): string {
  if (impacts.length === 0) {
    return "";
  }

  // Sort by blast radius priority: high first, medium second, low last
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sortedImpacts = [...impacts].sort(
    (a, b) => priorityOrder[a.blastRadius] - priorityOrder[b.blastRadius]
  );

  let output = "### Impact Analysis\n\n";
  for (const impact of sortedImpacts) {
    output += `**\`${impact.sourceFile}\`** - Blast Radius: ${impact.blastRadius.toUpperCase()} (${impact.affectedFiles.length} files)\n\n`;
    output += "Affected files:\n";
    for (const f of impact.affectedFiles.slice(0, 5)) {
      output += `- \`${f}\`\n`;
    }
    if (impact.affectedFiles.length > 5) {
      output += `- ...and ${impact.affectedFiles.length - 5} more\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Convention Violations.
 */
function renderConventionViolations(
  violations: ConventionViolationFinding[]
): string {
  if (violations.length === 0) {
    return "";
  }

  let output = "### Conventions\n\n";
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

  return output;
}

/**
 * Render the Details section (collapsible extended information).
 */
function renderDetails(
  _context: RenderContext,
  groups: Map<string, Finding[]>
): string {
  let detailsContent = "";

  // Impact Analysis
  const impacts =
    (groups.get("impact-analysis") as ImpactAnalysisFinding[]) ?? [];
  detailsContent += renderImpactAnalysis(impacts);

  // Routes / API
  const routes = (groups.get("route-change") as RouteChangeFinding[]) ?? [];
  detailsContent += renderRoutes(routes);

  // API Contracts
  const apiContracts =
    (groups.get("api-contract-change") as APIContractChangeFinding[]) ?? [];
  detailsContent += renderAPIContracts(apiContracts);

  // GraphQL Schema
  const graphqlChanges =
    (groups.get("graphql-change") as GraphQLChangeFinding[]) ?? [];
  detailsContent += renderGraphQL(graphqlChanges);

  // Database (Supabase)
  const migrations =
    (groups.get("db-migration") as DbMigrationFinding[]) ?? [];
  detailsContent += renderDatabase(migrations);

  // Database (Python - Alembic/Django)
  const pythonMigrations =
    (groups.get("python-migration") as PythonMigrationFinding[]) ?? [];
  detailsContent += renderPythonMigrations(pythonMigrations);

  // SQL Risk
  const sqlRisks = (groups.get("sql-risk") as SQLRiskFinding[]) ?? [];
  detailsContent += renderSQLRisk(sqlRisks);

  // Config / Env
  const envVars = (groups.get("env-var") as EnvVarFinding[]) ?? [];
  detailsContent += renderEnvVars(envVars);

  // Configuration Changes (TypeScript, Tailwind, Vite, Monorepo, Python)
  const tsConfigs =
    (groups.get("typescript-config") as TypeScriptConfigFinding[]) ?? [];
  const tailwindConfigs =
    (groups.get("tailwind-config") as TailwindConfigFinding[]) ?? [];
  const monorepoConfigs =
    (groups.get("monorepo-config") as MonorepoConfigFinding[]) ?? [];
  const viteConfigs =
    (groups.get("vite-config") as ViteConfigFinding[]) ?? [];
  const pythonConfigs =
    (groups.get("python-config") as PythonConfigFinding[]) ?? [];
  detailsContent += renderConfiguration(
    tsConfigs,
    tailwindConfigs,
    monorepoConfigs,
    viteConfigs
  );
  detailsContent += renderPythonConfig(pythonConfigs);

  // Cloudflare
  const cloudflare =
    (groups.get("cloudflare-change") as CloudflareChangeFinding[]) ?? [];
  detailsContent += renderCloudflare(cloudflare);

  // Dependencies
  const deps =
    (groups.get("dependency-change") as DependencyChangeFinding[]) ?? [];
  detailsContent += renderDependencies(deps);

  // Package API (exports)
  const packageExports =
    (groups.get("package-exports") as PackageExportsFinding[]) ?? [];
  detailsContent += renderPackageExports(packageExports);

  // Component API (Stencil)
  detailsContent += renderStencilChanges(groups);

  // Angular Components
  detailsContent += renderAngularChanges(groups);

  // CI / Infrastructure
  const ciWorkflows =
    (groups.get("ci-workflow") as CIWorkflowFinding[]) ?? [];
  const infraChanges =
    (groups.get("infra-change") as InfraChangeFinding[]) ?? [];
  detailsContent += renderCIInfrastructure(ciWorkflows, infraChanges);

  // Security-Sensitive Files
  const securityFiles =
    (groups.get("security-file") as SecurityFileFinding[]) ?? [];
  detailsContent += renderSecurityFiles(securityFiles);

  // Convention Violations
  const violations =
    (groups.get("convention-violation") as ConventionViolationFinding[]) ?? [];
  detailsContent += renderConventionViolations(violations);

  // Warnings
  detailsContent += renderWarnings(groups);

  // If no details content, skip the section
  if (detailsContent.trim() === "") {
    return "";
  }

  return `<details>\n<summary>Details</summary>\n\n${detailsContent}</details>\n`;
}

/**
 * Render findings into a Markdown PR body.
 * No emojis, compact by default, extended info in details block.
 */
export function renderMarkdown(context: RenderContext): string {
  const groups = groupFindings(context.findings);
  const summaryData = buildSummaryData(context.findings);

  let output = "";

  // Hidden metadata comment
  output += `<!-- branch-narrator: profile=${context.profile} -->\n`;

  // Context (interactive only)
  output += renderContext(context);

  // Summary
  output += renderSummary(context, summaryData);

  // Top findings
  output += renderTopFindings(summaryData.topFindings);

  // What Changed (grouped by category with changesets separated)
  const categoryFinding = groups.get("file-category")?.[0] as
    | FileCategoryFinding
    | undefined;
  const fileSummary = groups.get("file-summary")?.[0] as
    | FileSummaryFinding
    | undefined;
  output += renderWhatChanged(categoryFinding, fileSummary, summaryData);

  // Suggested test plan
  output += renderTestPlan(context, groups);

  // Notes
  output += renderNotes(context);

  // Details (collapsible extended information)
  output += renderDetails(context, groups);

  return output.trim() + "\n";
}
