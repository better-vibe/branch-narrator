/**
 * Terminal renderer with colors, tables, and visual formatting.
 * No emojis - plain text with color highlighting.
 */

import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import type {
  CIWorkflowFinding,
  CloudflareChangeFinding,
  DbMigrationFinding,
  EnvVarFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  GraphQLChangeFinding,
  InfraChangeFinding,
  LargeDiffFinding,
  MonorepoConfigFinding,
  PackageExportsFinding,
  ProfileName,
  RenderContext,
  RouteChangeFinding,
  SQLRiskFinding,
  StencilComponentChangeFinding,
  StencilEventChangeFinding,
  StencilMethodChangeFinding,
  StencilPropChangeFinding,
  StencilSlotChangeFinding,
  TailwindConfigFinding,
  TestChangeFinding,
  TypeScriptConfigFinding,
} from "../core/types.js";
import { routeIdToUrlPath } from "../analyzers/route-detector.js";
import { getCategoryLabel } from "../analyzers/file-category.js";
import {
  buildSummaryData,
  buildDependencyOverview,
  formatDependencyOverviewBullets,
  formatDiffstat,
  formatFindingsByCategory,
  getFindings,
  groupFindingsByType,
  stripEmojiPrefix,
  type TopFinding,
} from "./summary.js";

/**
 * Color scheme for terminal output.
 */
const colors = {
  // Risk levels
  riskHigh: chalk.red.bold,
  riskMedium: chalk.yellow.bold,
  riskLow: chalk.green.bold,

  // File status
  fileAdded: chalk.green,
  fileDeleted: chalk.red,
  fileModified: chalk.cyan,
  fileRenamed: chalk.blue,

  // UI elements
  header: chalk.magenta.bold,
  subheader: chalk.cyan.bold,
  label: chalk.gray,
  value: chalk.white,
  muted: chalk.dim,
  accent: chalk.blue,
  warning: chalk.yellow,
  success: chalk.green,
  error: chalk.red,

  // Specific elements
  route: chalk.blue,
  packageName: chalk.cyan,
  version: chalk.yellow,
  envVar: chalk.magenta,
};

/**
 * Profile-specific test commands with rationales.
 */
const TEST_COMMANDS: Record<
  ProfileName,
  { cmd: string; label: string; rationale: string }[]
> = {
  sveltekit: [
    {
      cmd: "bun run check",
      label: "Run SvelteKit type check",
      rationale: "SvelteKit profile",
    },
  ],
  next: [
    { cmd: "bun run build", label: "Run Next.js build", rationale: "Next.js profile" },
  ],
  react: [],
  vue: [{ cmd: "bun run build", label: "Run Vue build", rationale: "Vue profile" }],
  astro: [
    { cmd: "bun run build", label: "Run Astro build", rationale: "Astro profile" },
  ],
  stencil: [
    { cmd: "bun run build", label: "Run Stencil build", rationale: "Stencil profile" },
  ],
  angular: [
    { cmd: "ng build", label: "Run Angular build", rationale: "Angular profile" },
  ],
  library: [
    { cmd: "bun run build", label: "Build library", rationale: "library profile" },
  ],
  python: [{ cmd: "pytest", label: "Run pytest", rationale: "Python profile" }],
  vite: [
    { cmd: "bun run build", label: "Run Vite build", rationale: "Vite profile" },
  ],
  auto: [],
};

/**
 * Unicode box-drawing characters for table rendering.
 */
const TABLE_CHARS = {
  top: "─",
  "top-mid": "┬",
  "top-left": "┌",
  "top-right": "┐",
  bottom: "─",
  "bottom-mid": "┴",
  "bottom-left": "└",
  "bottom-right": "┘",
  left: "│",
  "left-mid": "├",
  mid: "─",
  "mid-mid": "┼",
  right: "│",
  "right-mid": "┤",
  middle: "│",
};

/**
 * Get color function for risk/attention level.
 */
function getRiskColor(level: string): (text: string) => string {
  const normalized = level.toLowerCase();
  return normalized === "high"
    ? colors.riskHigh
    : normalized === "medium"
      ? colors.riskMedium
      : colors.riskLow;
}

/**
 * Get risk level text with color (no emoji).
 */
function getRiskText(level: "low" | "medium" | "high"): string {
  return getRiskColor(level)(level.toUpperCase());
}

/**
 * Get review attention text with color.
 */
function getReviewAttentionText(
  attention: "HIGH" | "MEDIUM" | "LOW"
): string {
  return getRiskColor(attention)(attention);
}

/**
 * Create a section header (no icon).
 */
function sectionHeader(title: string): string {
  return `\n${colors.header(title)}\n${"─".repeat(50)}\n`;
}

/**
 * Render the Summary section in a box.
 * Shows diffstat, profile, risk, review attention, and findings-by-category.
 */
function renderSummary(
  context: RenderContext,
  summaryData: ReturnType<typeof buildSummaryData>
): string {
  const { diffstat, reviewAttention, findingsByCategory } = summaryData;
  const { riskScore, profile } = context;

  const lines: string[] = [];

  // Files line with diffstat
  lines.push(
    `${colors.label("Files:")} ${formatDiffstat(diffstat)}`
  );

  // Profile line
  lines.push(`${colors.label("Profile:")} ${colors.accent(profile)}`);

  // Risk line
  lines.push(
    `${colors.label("Risk:")} ${getRiskText(riskScore.level)} ${colors.muted(`(${riskScore.score}/100)`)}`
  );

  // Review attention line
  lines.push(
    `${colors.label("Review attention:")} ${getReviewAttentionText(reviewAttention)} ${colors.muted("(blast radius)")}`
  );

  // Findings by category
  const categoryStr = formatFindingsByCategory(findingsByCategory);
  if (categoryStr !== "none") {
    lines.push(`${colors.label("Findings:")} ${colors.muted(categoryStr)}`);
  }

  const content = lines.map((l) => `  ${l}`).join("\n");

  return boxen(content, {
    title: "Summary",
    titleAlignment: "left",
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: "cyan",
    borderStyle: "round",
  });
}

/**
 * Render Top findings section (merged highlights + impact).
 */
function renderTopFindings(topFindings: TopFinding[]): string {
  if (topFindings.length === 0) {
    return "";
  }

  let output = sectionHeader("Top findings");

  let index = 1;
  for (const finding of topFindings) {
    output += `  ${index}) ${colors.value(finding.description)}\n`;

    // Show examples if available
    if (finding.examples.length > 0) {
      const examplesStr = finding.examples
        .map((e) => colors.muted(e))
        .join(", ");
      const moreStr =
        finding.moreCount > 0
          ? colors.muted(` (+${finding.moreCount} more)`)
          : "";
      output += `     ${examplesStr}${moreStr}\n`;
    }

    index++;
  }

  return output;
}

/**
 * Render What Changed section with Changesets separated from Documentation.
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

  let output = sectionHeader("What changed");

  // Primary files block (for small changes)
  if (primaryFiles.length > 0) {
    output += `${colors.subheader("Primary files")}\n`;
    for (const file of primaryFiles) {
      let statusIcon = "  ";
      let colorFn = colors.value;
      if (fileSummary.added.includes(file)) {
        statusIcon = colors.fileAdded("+ ");
        colorFn = colors.fileAdded;
      } else if (fileSummary.modified.includes(file)) {
        statusIcon = colors.fileModified("~ ");
        colorFn = colors.fileModified;
      }
      output += `  ${statusIcon}${colorFn(file)}\n`;
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

    output += `${colors.subheader(label)} ${colors.muted(`(${files.length})`)}\n`;

    const displayFiles = files.slice(0, 8);
    for (const file of displayFiles) {
      let statusIcon = "  ";
      let colorFn = colors.value;

      if (fileSummary.added.includes(file)) {
        statusIcon = colors.fileAdded("+ ");
        colorFn = colors.fileAdded;
      } else if (fileSummary.deleted.includes(file)) {
        statusIcon = colors.fileDeleted("- ");
        colorFn = colors.fileDeleted;
      } else if (fileSummary.modified.includes(file)) {
        statusIcon = colors.fileModified("~ ");
        colorFn = colors.fileModified;
      }

      output += `  ${statusIcon}${colorFn(file)}\n`;
    }

    if (files.length > 8) {
      output += `  ${colors.muted(`...and ${files.length - 8} more`)}\n`;
    }
    output += "\n";
  }

  // Changesets section (separate from docs)
  if (changesetFiles.length > 0) {
    output += `${colors.subheader("Changesets")} ${colors.muted(`(${changesetFiles.length})`)}\n`;
    for (const file of changesetFiles) {
      const statusIcon = fileSummary.added.includes(file)
        ? colors.fileAdded("+ ")
        : colors.fileModified("~ ");
      const colorFn = fileSummary.added.includes(file)
        ? colors.fileAdded
        : colors.fileModified;
      output += `  ${statusIcon}${colorFn(file)}\n`;
    }
    output += "\n";
  }

  return output;
}


/**
 * Render Routes / API table (no emoji).
 */
function renderRoutes(routes: RouteChangeFinding[]): string {
  if (routes.length === 0) {
    return "";
  }

  let output = sectionHeader("Routes / API");

  const table = new Table({
    head: [
      colors.label("Route"),
      colors.label("Type"),
      colors.label("Change"),
      colors.label("Methods"),
    ],
    style: {
      head: [],
      border: ["dim"],
    },
    chars: TABLE_CHARS,
  });

  for (const route of routes) {
    const urlPath = routeIdToUrlPath(route.routeId);
    const methods = route.methods?.join(", ") || "-";

    const changeColor =
      route.change === "added"
        ? colors.fileAdded
        : route.change === "deleted"
          ? colors.fileDeleted
          : colors.fileModified;

    table.push([
      colors.route(urlPath),
      route.routeType,
      changeColor(route.change),
      methods,
    ]);
  }

  output += table.toString() + "\n";
  return output;
}

/**
 * Render Database (Supabase) section.
 */
function renderDatabase(migrations: DbMigrationFinding[]): string {
  if (migrations.length === 0) {
    return "";
  }

  let output = sectionHeader("Database (Supabase)");

  for (const migration of migrations) {
    const riskText = getRiskText(migration.risk);
    output += `${colors.label("Risk Level:")} ${riskText}\n\n`;

    output += `${colors.label("Files:")}\n`;
    for (const file of migration.files) {
      output += `  - ${colors.value(file)}\n`;
    }

    if (migration.reasons.length > 0) {
      output += `\n${colors.label("Detected patterns:")}\n`;
      for (const reason of migration.reasons) {
        output += `  - ${colors.warning(reason)}\n`;
      }
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Config / Env table.
 */
function renderEnvVars(envVars: EnvVarFinding[]): string {
  if (envVars.length === 0) {
    return "";
  }

  let output = sectionHeader("Config / Env");

  const table = new Table({
    head: [
      colors.label("Variable"),
      colors.label("Status"),
      colors.label("Evidence"),
    ],
    style: {
      head: [],
      border: ["dim"],
    },
    chars: TABLE_CHARS,
  });

  for (const envVar of envVars) {
    const files = envVar.evidenceFiles.slice(0, 2).join(", ");
    const changeColor =
      envVar.change === "added" ? colors.fileAdded : colors.fileModified;

    table.push([
      colors.envVar(envVar.name),
      changeColor(envVar.change),
      colors.muted(files),
    ]);
  }

  output += table.toString() + "\n";
  return output;
}

/**
 * Render Cloudflare section.
 */
function renderCloudflare(changes: CloudflareChangeFinding[]): string {
  if (changes.length === 0) {
    return "";
  }

  let output = sectionHeader("Cloudflare");

  for (const change of changes) {
    output += `${colors.label("Area:")} ${colors.value(change.area)}\n`;
    output += `${colors.label("Files:")}\n`;
    for (const file of change.files) {
      output += `  - ${colors.value(file)}\n`;
    }
    output += "\n";
  }

  return output;
}

// Dependencies rendering has been promoted to renderDependencyOverview()
// which uses the shared buildDependencyOverview() from summary.ts

/**
 * Render Suggested test plan section with rationales.
 */
function renderTestPlan(
  context: RenderContext,
  groups: Map<string, Finding[]>
): string {
  const bullets: { cmd: string; rationale: string }[] = [];

  const testChanges = getFindings<TestChangeFinding>(groups, "test-change");

  // Test command with file count rationale
  if (testChanges.length > 0) {
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
  const profileCommands = TEST_COMMANDS[context.profile] ?? [];
  for (const { cmd, rationale } of profileCommands) {
    bullets.push({ cmd, rationale });
  }

  const routes = getFindings<RouteChangeFinding>(groups, "route-change");
  if (routes.length > 0) {
    const endpoints = routes.filter((r) => r.routeType === "endpoint");
    for (const endpoint of endpoints.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(endpoint.routeId);
      const methods = endpoint.methods?.join("/") || "GET";
      bullets.push({
        cmd: `Test ${methods} ${urlPath} endpoint`,
        rationale: "route changed",
      });
    }

    const pages = routes.filter(
      (r) => r.routeType === "page" && r.change !== "deleted"
    );
    for (const page of pages.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(page.routeId);
      bullets.push({
        cmd: `Verify ${urlPath} page renders correctly`,
        rationale: "page changed",
      });
    }
  }

  if (context.interactive?.testNotes) {
    bullets.push({
      cmd: context.interactive.testNotes,
      rationale: "user note",
    });
  }

  if (bullets.length === 0) {
    return "";
  }

  let output = sectionHeader("Suggested test plan");
  for (const { cmd, rationale } of bullets) {
    output += `  [ ] ${colors.accent(cmd)} ${colors.muted(`(${rationale})`)}\n`;
  }

  return output;
}

/**
 * Render Infrastructure changes section.
 */
function renderInfra(changes: InfraChangeFinding[]): string {
  if (changes.length === 0) {
    return "";
  }

  let output = sectionHeader("Infrastructure");

  // Group by infra type
  const byType = new Map<string, string[]>();
  for (const change of changes) {
    if (!byType.has(change.infraType)) {
      byType.set(change.infraType, []);
    }
    byType.get(change.infraType)!.push(...change.files);
  }

  for (const [infraType, files] of byType) {
    const label =
      infraType === "docker"
        ? "Docker"
        : infraType === "terraform"
          ? "Terraform"
          : infraType === "kubernetes"
            ? "Kubernetes"
            : infraType === "compose"
              ? "Docker Compose"
              : infraType.charAt(0).toUpperCase() + infraType.slice(1);

    output += `${colors.subheader(label)} ${colors.muted(`(${files.length})`)}\n`;
    for (const file of files.slice(0, 5)) {
      output += `  - ${colors.value(file)}\n`;
    }
    if (files.length > 5) {
      output += `  ${colors.muted(`...and ${files.length - 5} more`)}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render CI/CD Workflows section.
 */
function renderCIWorkflows(workflows: CIWorkflowFinding[]): string {
  if (workflows.length === 0) {
    return "";
  }

  // Separate security issues from general changes
  const securityIssues = workflows.filter(
    (w) =>
      w.riskType === "permissions_broadened" ||
      w.riskType === "pull_request_target"
  );
  const otherChanges = workflows.filter(
    (w) =>
      w.riskType !== "permissions_broadened" &&
      w.riskType !== "pull_request_target"
  );

  if (securityIssues.length === 0 && otherChanges.length === 0) {
    return "";
  }

  let output = sectionHeader("CI/CD Workflows");

  if (securityIssues.length > 0) {
    output += `${colors.riskHigh("SECURITY CONCERNS")}\n`;
    for (const issue of securityIssues) {
      const riskLabel =
        issue.riskType === "permissions_broadened"
          ? "Permissions broadened"
          : "pull_request_target trigger";
      output += `  - ${colors.warning(issue.file)}: ${colors.error(riskLabel)}\n`;
    }
    output += "\n";
  }

  if (otherChanges.length > 0) {
    output += `${colors.subheader("Modified Workflows")} ${colors.muted(`(${otherChanges.length})`)}\n`;
    for (const change of otherChanges.slice(0, 5)) {
      output += `  - ${colors.value(change.file)}`;
      if (change.riskType) {
        output += ` ${colors.muted(`(${change.riskType})`)}`;
      }
      output += "\n";
    }
    if (otherChanges.length > 5) {
      output += `  ${colors.muted(`...and ${otherChanges.length - 5} more`)}\n`;
    }
  }

  return output;
}

/**
 * Render SQL Risks section.
 */
function renderSQLRisks(risks: SQLRiskFinding[]): string {
  if (risks.length === 0) {
    return "";
  }

  let output = sectionHeader("SQL Risks");

  const destructive = risks.filter((r) => r.riskType === "destructive");
  const other = risks.filter((r) => r.riskType !== "destructive");

  if (destructive.length > 0) {
    output += `${colors.riskHigh("DESTRUCTIVE SQL DETECTED")}\n`;
    for (const risk of destructive) {
      output += `  - ${colors.error(risk.file)}`;
      if (risk.details) {
        output += `: ${colors.warning(risk.details)}`;
      }
      output += "\n";
    }
    output += "\n";
  }

  if (other.length > 0) {
    output += `${colors.subheader("Other SQL Changes")} ${colors.muted(`(${other.length})`)}\n`;
    for (const risk of other.slice(0, 5)) {
      output += `  - ${colors.value(risk.file)}`;
      if (risk.riskType) {
        output += ` ${colors.muted(`(${risk.riskType})`)}`;
      }
      output += "\n";
    }
    if (other.length > 5) {
      output += `  ${colors.muted(`...and ${other.length - 5} more`)}\n`;
    }
  }

  return output;
}

/**
 * Render Large Diff warning.
 */
function renderLargeDiff(findings: LargeDiffFinding[]): string {
  if (findings.length === 0) {
    return "";
  }

  const largeDiff = findings[0];
  if (!largeDiff || largeDiff.linesChanged < 500) {
    return "";
  }

  let output = sectionHeader("Large changes");

  output += `${colors.warning("Large change detected - review carefully")}\n\n`;
  output += `  - ${colors.value(`${largeDiff.filesChanged} file(s)`)} changed\n`;
  output += `  - ${colors.value(`${largeDiff.linesChanged} line(s)`)} modified\n`;

  return output;
}

/**
 * Render Stencil component API changes section.
 */
function renderStencil(groups: Map<string, Finding[]>): string {
  const componentChanges = (groups.get("stencil-component-change") ??
    []) as StencilComponentChangeFinding[];
  const propChanges = (groups.get("stencil-prop-change") ??
    []) as StencilPropChangeFinding[];
  const eventChanges = (groups.get("stencil-event-change") ??
    []) as StencilEventChangeFinding[];
  const methodChanges = (groups.get("stencil-method-change") ??
    []) as StencilMethodChangeFinding[];
  const slotChanges = (groups.get("stencil-slot-change") ??
    []) as StencilSlotChangeFinding[];

  const total =
    componentChanges.length +
    propChanges.length +
    eventChanges.length +
    methodChanges.length +
    slotChanges.length;

  if (total === 0) {
    return "";
  }

  let output = sectionHeader("Stencil Components");

  // Group by component tag
  const byTag = new Map<
    string,
    { props: string[]; events: string[]; methods: string[]; slots: string[] }
  >();

  const ensureTag = (tag: string) => {
    if (!byTag.has(tag)) {
      byTag.set(tag, { props: [], events: [], methods: [], slots: [] });
    }
    return byTag.get(tag)!;
  };

  for (const prop of propChanges) {
    const entry = ensureTag(prop.tag);
    entry.props.push(`${prop.propName} (${prop.change})`);
  }
  for (const event of eventChanges) {
    const entry = ensureTag(event.tag);
    entry.events.push(`${event.eventName} (${event.change})`);
  }
  for (const method of methodChanges) {
    const entry = ensureTag(method.tag);
    entry.methods.push(`${method.methodName} (${method.change})`);
  }
  for (const slot of slotChanges) {
    const entry = ensureTag(slot.tag);
    const slotLabel = slot.slotName || "(default)";
    entry.slots.push(`${slotLabel} (${slot.change})`);
  }

  for (const [tag, changes] of byTag) {
    output += `${colors.subheader(`<${tag}>`)}`;

    const parts: string[] = [];
    if (changes.props.length > 0) {
      parts.push(`${changes.props.length} prop(s)`);
    }
    if (changes.events.length > 0) {
      parts.push(`${changes.events.length} event(s)`);
    }
    if (changes.methods.length > 0) {
      parts.push(`${changes.methods.length} method(s)`);
    }
    if (changes.slots.length > 0) {
      parts.push(`${changes.slots.length} slot(s)`);
    }

    output += ` ${colors.muted(`(${parts.join(", ")})`)}\n`;

    // Show details (limited)
    const allChanges = [
      ...changes.props.map((p) => `@Prop ${p}`),
      ...changes.events.map((e) => `@Event ${e}`),
      ...changes.methods.map((m) => `@Method ${m}`),
      ...changes.slots.map((s) => `slot ${s}`),
    ];

    for (const change of allChanges.slice(0, 4)) {
      output += `  - ${colors.value(change)}\n`;
    }
    if (allChanges.length > 4) {
      output += `  ${colors.muted(`...and ${allChanges.length - 4} more`)}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Config Changes (TypeScript, Tailwind, GraphQL, Package Exports, Monorepo).
 */
function renderConfigChanges(groups: Map<string, Finding[]>): string {
  const tsConfig = (groups.get("typescript-config") ??
    []) as TypeScriptConfigFinding[];
  const tailwind = (groups.get("tailwind-config") ??
    []) as TailwindConfigFinding[];
  const graphql = (groups.get("graphql-change") ??
    []) as GraphQLChangeFinding[];
  const pkgExports = (groups.get("package-exports") ??
    []) as PackageExportsFinding[];
  const monorepo = (groups.get("monorepo-config") ??
    []) as MonorepoConfigFinding[];

  const total =
    tsConfig.length +
    tailwind.length +
    graphql.length +
    pkgExports.length +
    monorepo.length;

  if (total === 0) {
    return "";
  }

  let output = sectionHeader("Config Changes");

  // TypeScript config
  if (tsConfig.length > 0) {
    const breaking = tsConfig.some((c) => c.isBreaking);
    output += `${colors.subheader("TypeScript Config")}`;
    if (breaking) {
      output += ` ${colors.error("(BREAKING)")}`;
    }
    output += "\n";
    for (const config of tsConfig) {
      output += `  - ${colors.value(config.file)}`;
      const allChanges = [
        ...config.changedOptions.added,
        ...config.changedOptions.removed,
        ...config.changedOptions.modified,
      ];
      if (allChanges.length > 0) {
        output += `: ${colors.muted(allChanges.slice(0, 3).join(", "))}`;
        if (allChanges.length > 3) {
          output += colors.muted(` +${allChanges.length - 3}`);
        }
      }
      output += "\n";
    }
    output += "\n";
  }

  // Tailwind config
  if (tailwind.length > 0) {
    const breaking = tailwind.some((c) => c.isBreaking);
    output += `${colors.subheader("Tailwind Config")}`;
    if (breaking) {
      output += ` ${colors.error("(BREAKING)")}`;
    }
    output += "\n";
    for (const config of tailwind) {
      output += `  - ${colors.value(config.file)}\n`;
    }
    output += "\n";
  }

  // GraphQL schema
  if (graphql.length > 0) {
    const breaking = graphql.some((c) => c.isBreaking);
    output += `${colors.subheader("GraphQL Schema")}`;
    if (breaking) {
      output += ` ${colors.error("(BREAKING)")}`;
    }
    output += "\n";
    for (const schema of graphql) {
      output += `  - ${colors.value(schema.file)}`;
      const changes = [
        ...schema.breakingChanges.map((c) => `${c} (breaking)`),
        ...schema.addedElements,
      ];
      if (changes.length > 0) {
        output += `: ${colors.muted(changes.slice(0, 2).join(", "))}`;
        if (changes.length > 2) {
          output += colors.muted(` +${changes.length - 2}`);
        }
      }
      output += "\n";
    }
    output += "\n";
  }

  // Package exports
  if (pkgExports.length > 0) {
    const breaking = pkgExports.some((c) => c.isBreaking);
    output += `${colors.subheader("Package Exports")}`;
    if (breaking) {
      output += ` ${colors.error("(BREAKING)")}`;
    }
    output += "\n";
    for (const pkg of pkgExports) {
      const parts: string[] = [];
      if (pkg.addedExports && pkg.addedExports.length > 0) {
        parts.push(`+${pkg.addedExports.length} added`);
      }
      if (pkg.removedExports && pkg.removedExports.length > 0) {
        parts.push(`-${pkg.removedExports.length} removed`);
      }
      if (pkg.binChanges) {
        if (pkg.binChanges.added.length > 0) {
          parts.push(`+${pkg.binChanges.added.length} bin`);
        }
        if (pkg.binChanges.removed.length > 0) {
          parts.push(`-${pkg.binChanges.removed.length} bin`);
        }
      }
      output += `  - ${colors.value("package.json exports")}`;
      if (parts.length > 0) {
        output += `: ${colors.muted(parts.join(", "))}`;
      }
      output += "\n";
    }
    output += "\n";
  }

  // Monorepo config
  if (monorepo.length > 0) {
    output += `${colors.subheader("Monorepo Config")}\n`;
    for (const config of monorepo) {
      output += `  - ${colors.value(config.tool)}: ${colors.muted(config.file)}\n`;
    }
    output += "\n";
  }

  return output;
}

/**
 * Render Notes section (only new information).
 * Omitted entirely when risk is low and there are no evidence bullets.
 */
function renderNotes(context: RenderContext): string {
  const { riskScore } = context;

  const bullets = riskScore.evidenceBullets ?? [];

  // Skip the entire section when low risk with no evidence - reduces noise
  if (bullets.length === 0 && riskScore.level === "low") {
    return "";
  }

  // If there are evidence bullets, show them
  if (bullets.length > 0) {
    let output = sectionHeader("Notes");
    for (const bullet of bullets) {
      output += `  - ${stripEmojiPrefix(bullet)}\n`;
    }
    return output;
  }

  return "";
}

/**
 * Render the Context section (interactive mode only).
 */
function renderContext(context: RenderContext): string {
  if (!context.interactive?.context) {
    return "";
  }

  return (
    boxen(context.interactive.context, {
      title: "Context",
      titleAlignment: "left",
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      borderColor: "blue",
      borderStyle: "round",
    }) + "\n"
  );
}

/**
 * Render a concise dependency overview section (promoted to primary area).
 */
function renderDependencyOverview(findings: Finding[]): string {
  const overview = buildDependencyOverview(findings);
  if (overview.total === 0) {
    return "";
  }

  const bullets = formatDependencyOverviewBullets(overview);
  if (bullets.length === 0) {
    return "";
  }

  let output = sectionHeader("Dependencies");
  for (const bullet of bullets) {
    output += `  ${colors.value(bullet)}\n`;
  }

  return output;
}

/**
 * Render findings into a colorized terminal output.
 * No emojis, explicit diffstat, single Top findings section.
 */
export function renderTerminal(context: RenderContext): string {
  const groups = groupFindingsByType(context.findings);
  const summaryData = buildSummaryData(context.findings);

  // No-changes short-circuit: only when truly no findings at all
  if (summaryData.diffstat.total === 0 && context.findings.length === 0) {
    return "\n" + colors.muted("No changes detected.") + "\n";
  }

  let output = "\n";

  // Context (interactive only)
  output += renderContext(context);

  // Summary box
  output += renderSummary(context, summaryData);
  output += "\n";

  // Top findings (merged highlights + impact)
  output += renderTopFindings(summaryData.topFindings);

  // Large diff warning (show early if present)
  const largeDiff = getFindings<LargeDiffFinding>(groups, "large-diff");
  output += renderLargeDiff(largeDiff);

  // What Changed (grouped by category with changesets separated)
  const categoryFinding = getFindings<FileCategoryFinding>(groups, "file-category")[0];
  const fileSummary = getFindings<FileSummaryFinding>(groups, "file-summary")[0];
  output += renderWhatChanged(categoryFinding, fileSummary, summaryData);

  // Routes / API
  const routes = getFindings<RouteChangeFinding>(groups, "route-change");
  output += renderRoutes(routes);

  // Database (Supabase)
  const migrations = getFindings<DbMigrationFinding>(groups, "db-migration");
  output += renderDatabase(migrations);

  // SQL Risks
  const sqlRisks = getFindings<SQLRiskFinding>(groups, "sql-risk");
  output += renderSQLRisks(sqlRisks);

  // Config / Env
  const envVars = getFindings<EnvVarFinding>(groups, "env-var");
  output += renderEnvVars(envVars);

  // Config Changes (TypeScript, Tailwind, GraphQL, Package Exports, Monorepo)
  output += renderConfigChanges(groups);

  // Stencil Components
  output += renderStencil(groups);

  // Infrastructure
  const infra = getFindings<InfraChangeFinding>(groups, "infra-change");
  output += renderInfra(infra);

  // CI/CD Workflows
  const ciWorkflows = getFindings<CIWorkflowFinding>(groups, "ci-workflow");
  output += renderCIWorkflows(ciWorkflows);

  // Cloudflare
  const cloudflare = getFindings<CloudflareChangeFinding>(groups, "cloudflare-change");
  output += renderCloudflare(cloudflare);

  // Dependencies (promoted overview, before test plan)
  output += renderDependencyOverview(context.findings);

  // Suggested test plan
  output += renderTestPlan(context, groups);

  // Notes
  output += renderNotes(context);

  return output;
}
