/**
 * Markdown PR body renderer.
 */

import type {
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
  TestGapFinding,
  TestParityViolationFinding,
  TypeScriptConfigFinding,
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

  // GraphQL breaking changes
  const graphqlChanges = groups.get("graphql-change") as
    | GraphQLChangeFinding[]
    | undefined;
  if (graphqlChanges && graphqlChanges.length > 0) {
    const breakingCount = graphqlChanges.filter((g) => g.isBreaking).length;
    if (breakingCount > 0) {
      bullets.push(`${breakingCount} GraphQL breaking change(s)`);
    }
  }

  // CI workflow risks
  const ciWorkflows = groups.get("ci-workflow") as
    | CIWorkflowFinding[]
    | undefined;
  if (ciWorkflows && ciWorkflows.length > 0) {
    bullets.push(`${ciWorkflows.length} CI workflow change(s) detected`);
  }

  // Stencil component changes
  const stencilComponents = groups.get("stencil-component-change") as
    | StencilComponentChangeFinding[]
    | undefined;
  if (stencilComponents && stencilComponents.length > 0) {
    bullets.push(`${stencilComponents.length} component API change(s)`);
  }

  // Package exports breaking changes
  const packageExports = groups.get("package-exports") as
    | PackageExportsFinding[]
    | undefined;
  if (packageExports && packageExports.length > 0) {
    const breakingExports = packageExports.filter((p) => p.isBreaking);
    if (breakingExports.length > 0) {
      bullets.push(`Package API breaking changes detected`);
    }
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
 * Render API Contract changes.
 */
function renderAPIContracts(contracts: APIContractChangeFinding[]): string {
  if (contracts.length === 0) {
    return "";
  }

  let output = "## API Contracts\n\n";
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
 * Render GraphQL Schema section.
 */
function renderGraphQL(changes: GraphQLChangeFinding[]): string {
  if (changes.length === 0) {
    return "";
  }

  let output = "## GraphQL Schema\n\n";

  // Check for breaking changes
  const breakingChanges = changes.filter((c) => c.isBreaking);
  if (breakingChanges.length > 0) {
    output += "### 🔴 Breaking Changes\n\n";
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
    output += "### Added Elements\n\n";
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
  output += "### All Schema Changes\n\n";
  output += "| File | Status | Breaking |\n";
  output += "|------|--------|----------|\n";
  for (const change of changes) {
    const breakingEmoji = change.isBreaking ? "🔴 Yes" : "🟢 No";
    output += `| \`${change.file}\` | ${change.status} | ${breakingEmoji} |\n`;
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

  let output = "### TypeScript Configuration\n\n";

  for (const config of configs) {
    const breakingEmoji = config.isBreaking ? "🔴" : "🟢";
    output += `**File:** \`${config.file}\` ${breakingEmoji}\n\n`;

    // Strictness changes
    if (config.strictnessChanges.length > 0) {
      output += "**Strictness Changes:**\n";
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

  let output = "### Tailwind Configuration\n\n";

  for (const config of configs) {
    const breakingEmoji = config.isBreaking ? "🔴" : "🟢";
    output += `**File:** \`${config.file}\` (${config.configType}) ${breakingEmoji}\n\n`;

    if (config.affectedSections.length > 0) {
      output += "**Affected Sections:**\n";
      for (const section of config.affectedSections) {
        output += `- ${section}\n`;
      }
      output += "\n";
    }

    if (config.isBreaking && config.breakingReasons.length > 0) {
      output += "**Breaking Changes:**\n";
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

  let output = "### Monorepo Configuration\n\n";

  for (const config of configs) {
    output += `**Tool:** ${config.tool}\n`;
    output += `**File:** \`${config.file}\`\n\n`;

    if (config.affectedFields.length > 0) {
      output += "**Changed Fields:**\n";
      for (const field of config.affectedFields) {
        output += `- ${field}\n`;
      }
      output += "\n";
    }

    if (config.impacts.length > 0) {
      output += "**Impacts:**\n";
      for (const impact of config.impacts) {
        output += `- ${impact}\n`;
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
  monorepoConfigs: MonorepoConfigFinding[]
): string {
  const hasTsConfig = tsConfigs.length > 0;
  const hasTailwind = tailwindConfigs.length > 0;
  const hasMonorepo = monorepoConfigs.length > 0;

  if (!hasTsConfig && !hasTailwind && !hasMonorepo) {
    return "";
  }

  let output = "## Configuration Changes\n\n";

  if (hasTsConfig) {
    output += renderTypeScriptConfig(tsConfigs);
  }
  if (hasTailwind) {
    output += renderTailwindConfig(tailwindConfigs);
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

  let output = "## Package API\n\n";

  for (const exp of exports) {
    const breakingEmoji = exp.isBreaking ? "🔴 Breaking" : "🟢 Non-breaking";
    output += `**Status:** ${breakingEmoji}\n\n`;

    // Removed exports (breaking)
    if (exp.removedExports.length > 0) {
      output += "### Removed Exports\n\n";
      for (const removed of exp.removedExports) {
        output += `- 🔴 \`${removed}\`\n`;
      }
      output += "\n";
    }

    // Added exports
    if (exp.addedExports.length > 0) {
      output += "### Added Exports\n\n";
      for (const added of exp.addedExports) {
        output += `- 🟢 \`${added}\`\n`;
      }
      output += "\n";
    }

    // Legacy field changes
    if (exp.legacyFieldChanges.length > 0) {
      output += "### Entry Point Changes\n\n";
      output += "| Field | From | To |\n";
      output += "|-------|------|----|\n";
      for (const change of exp.legacyFieldChanges) {
        output += `| \`${change.field}\` | ${change.from ?? "-"} | ${change.to ?? "-"} |\n`;
      }
      output += "\n";
    }

    // Bin changes
    if (exp.binChanges.added.length > 0 || exp.binChanges.removed.length > 0) {
      output += "### Binary Commands\n\n";
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

  let output = "## Component API (Stencil)\n\n";

  // Group all changes by component tag
  const byTag = new Map<string, {
    component?: StencilComponentChangeFinding;
    props: StencilPropChangeFinding[];
    events: StencilEventChangeFinding[];
    methods: StencilMethodChangeFinding[];
    slots: StencilSlotChangeFinding[];
  }>();

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
    output += `### \`<${tag}>\`\n\n`;

    // Component-level changes
    if (changes.component) {
      const c = changes.component;
      const changeEmoji = c.change === "removed" ? "🔴" : c.change === "added" ? "🟢" : "🟡";
      output += `**Component:** ${changeEmoji} ${c.change}`;
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
        const emoji = p.change === "removed" ? "🔴" : p.change === "added" ? "🟢" : "🟡";
        let detail = "";
        if (p.details?.typeText) {
          detail = `: ${p.details.typeText}`;
        }
        output += `- ${emoji} \`${p.propName}\`${detail} (${p.change})\n`;
      }
      output += "\n";
    }

    // Events
    if (changes.events.length > 0) {
      output += "**Events:**\n";
      for (const e of changes.events) {
        const emoji = e.change === "removed" ? "🔴" : e.change === "added" ? "🟢" : "🟡";
        output += `- ${emoji} \`${e.eventName}\` (${e.change})\n`;
      }
      output += "\n";
    }

    // Methods
    if (changes.methods.length > 0) {
      output += "**Methods:**\n";
      for (const m of changes.methods) {
        const emoji = m.change === "removed" ? "🔴" : m.change === "added" ? "🟢" : "🟡";
        const sig = m.signature ? `: ${m.signature}` : "";
        output += `- ${emoji} \`${m.methodName}\`${sig} (${m.change})\n`;
      }
      output += "\n";
    }

    // Slots
    if (changes.slots.length > 0) {
      output += "**Slots:**\n";
      for (const s of changes.slots) {
        const emoji = s.change === "removed" ? "🔴" : "🟢";
        const slotName = s.slotName === "default" ? "(default)" : `"${s.slotName}"`;
        output += `- ${emoji} ${slotName} (${s.change})\n`;
      }
      output += "\n";
    }
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
    const riskEmoji =
      finding.riskType === "permissions_broadened" ||
      finding.riskType === "pull_request_target" ||
      finding.riskType === "remote_script_download"
        ? "🔴"
        : "🟡";

    const riskLabel = finding.riskType.replace(/_/g, " ");
    output += `${riskEmoji} **${riskLabel}**\n`;
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

  let output = "## SQL Risk\n\n";

  for (const finding of findings) {
    const riskEmoji =
      finding.riskType === "destructive"
        ? "🔴"
        : finding.riskType === "unscoped_modification"
          ? "🔴"
          : "🟡";

    const riskLabel = finding.riskType.replace(/_/g, " ");
    output += `${riskEmoji} **${riskLabel}**\n`;
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

  let output = "## CI / Infrastructure\n\n";
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

  let output = "## Database (Python)\n\n";

  for (const migration of migrations) {
    const riskEmoji =
      migration.risk === "high"
        ? "🔴"
        : migration.risk === "medium"
          ? "🟡"
          : "🟢";
    const toolLabel = migration.tool === "alembic" ? "Alembic" : "Django";
    output += `**Tool:** ${toolLabel}\n`;
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
 * Render Python configuration section.
 */
function renderPythonConfig(configs: PythonConfigFinding[]): string {
  if (configs.length === 0) {
    return "";
  }

  let output = "### Python Configuration\n\n";

  for (const config of configs) {
    const breakingEmoji = config.isBreaking ? "🔴" : "🟢";
    output += `**File:** \`${config.file}\` (${config.configType}) ${breakingEmoji}\n\n`;

    if (config.affectedSections.length > 0) {
      output += "**Affected Sections:**\n";
      for (const section of config.affectedSections.slice(0, 5)) {
        output += `- ${section}\n`;
      }
      if (config.affectedSections.length > 5) {
        output += `- ...and ${config.affectedSections.length - 5} more\n`;
      }
      output += "\n";
    }

    if (config.isBreaking && config.breakingReasons.length > 0) {
      output += "**Breaking Changes:**\n";
      for (const reason of config.breakingReasons) {
        output += `- ${reason}\n`;
      }
      output += "\n";
    }
  }

  return output;
}

/**
 * Render Warnings section (large-diff, lockfile-mismatch, test-gap).
 */
function renderWarnings(groups: Map<string, Finding[]>): string {
  const largeDiff =
    (groups.get("large-diff") as LargeDiffFinding[]) ?? [];
  const lockfileMismatch =
    (groups.get("lockfile-mismatch") as LockfileFinding[]) ?? [];
  const testGap =
    (groups.get("test-gap") as TestGapFinding[]) ?? [];

  const hasWarnings =
    largeDiff.length > 0 || lockfileMismatch.length > 0 || testGap.length > 0;

  if (!hasWarnings) {
    return "";
  }

  let output = "## ⚠️ Warnings\n\n";

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

  // Test gap warning
  for (const tg of testGap) {
    output += `- **Test coverage gap:** ${tg.prodFilesChanged} production files changed, only ${tg.testFilesChanged} test files changed\n`;
  }

  output += "\n";
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

  // API Contracts
  const apiContracts =
    (groups.get("api-contract-change") as APIContractChangeFinding[]) ?? [];
  output += renderAPIContracts(apiContracts);

  // GraphQL Schema
  const graphqlChanges =
    (groups.get("graphql-change") as GraphQLChangeFinding[]) ?? [];
  output += renderGraphQL(graphqlChanges);

  // Database (Supabase)
  const migrations =
    (groups.get("db-migration") as DbMigrationFinding[]) ?? [];
  output += renderDatabase(migrations);

  // Database (Python - Alembic/Django)
  const pythonMigrations =
    (groups.get("python-migration") as PythonMigrationFinding[]) ?? [];
  output += renderPythonMigrations(pythonMigrations);

  // SQL Risk
  const sqlRisks = (groups.get("sql-risk") as SQLRiskFinding[]) ?? [];
  output += renderSQLRisk(sqlRisks);

  // Config / Env
  const envVars = (groups.get("env-var") as EnvVarFinding[]) ?? [];
  output += renderEnvVars(envVars);

  // Configuration Changes (TypeScript, Tailwind, Monorepo, Python)
  const tsConfigs =
    (groups.get("typescript-config") as TypeScriptConfigFinding[]) ?? [];
  const tailwindConfigs =
    (groups.get("tailwind-config") as TailwindConfigFinding[]) ?? [];
  const monorepoConfigs =
    (groups.get("monorepo-config") as MonorepoConfigFinding[]) ?? [];
  const pythonConfigs =
    (groups.get("python-config") as PythonConfigFinding[]) ?? [];
  output += renderConfiguration(tsConfigs, tailwindConfigs, monorepoConfigs);
  output += renderPythonConfig(pythonConfigs);

  // Cloudflare
  const cloudflare =
    (groups.get("cloudflare-change") as CloudflareChangeFinding[]) ?? [];
  output += renderCloudflare(cloudflare);

  // Dependencies
  const deps =
    (groups.get("dependency-change") as DependencyChangeFinding[]) ?? [];
  output += renderDependencies(deps);

  // Package API (exports)
  const packageExports =
    (groups.get("package-exports") as PackageExportsFinding[]) ?? [];
  output += renderPackageExports(packageExports);

  // Component API (Stencil)
  output += renderStencilChanges(groups);

  // CI / Infrastructure
  const ciWorkflows =
    (groups.get("ci-workflow") as CIWorkflowFinding[]) ?? [];
  const infraChanges =
    (groups.get("infra-change") as InfraChangeFinding[]) ?? [];
  output += renderCIInfrastructure(ciWorkflows, infraChanges);

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

  // Warnings (large-diff, lockfile-mismatch, test-gap)
  output += renderWarnings(groups);

  // Suggested test plan
  output += renderTestPlan(context, groups);

  // Risks / Notes
  output += renderRisks(context);

  return output.trim() + "\n";
}

