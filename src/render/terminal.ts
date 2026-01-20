/**
 * Terminal renderer with colors, tables, and visual formatting.
 */

import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import type {
  CIWorkflowFinding,
  CloudflareChangeFinding,
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
  TestGapFinding,
  TypeScriptConfigFinding,
} from "../core/types.js";
import { routeIdToUrlPath } from "../analyzers/route-detector.js";
import { getCategoryLabel } from "../analyzers/file-category.js";
import { buildHighlights } from "../commands/facts/highlights.js";

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
 * Icons for visual enhancement.
 */
const icons = {
  file: "📄",
  folder: "📁",
  route: "🛤️",
  database: "🗄️",
  security: "🔒",
  dependency: "📦",
  test: "🧪",
  config: "⚙️",
  warning: "⚠️",
  check: "✓",
  cross: "✗",
  arrow: "→",
  bullet: "•",
  riskHigh: "🔴",
  riskMedium: "🟡",
  riskLow: "🟢",
  impact: "💥",
  infra: "🏗️",
  ci: "🔄",
  sql: "📊",
  lock: "🔐",
  component: "🧩",
  large: "📏",
  python: "🐍",
};

/**
 * Profile-specific test commands.
 */
const TEST_COMMANDS: Record<ProfileName, { cmd: string; label: string }[]> = {
  sveltekit: [{ cmd: "bun run check", label: "Run SvelteKit type check" }],
  next: [{ cmd: "bun run build", label: "Run Next.js build" }],
  react: [],
  vue: [{ cmd: "bun run build", label: "Run Vue build" }],
  astro: [{ cmd: "bun run build", label: "Run Astro build" }],
  stencil: [{ cmd: "bun run build", label: "Run Stencil build" }],
  library: [{ cmd: "bun run build", label: "Build library" }],
  python: [{ cmd: "pytest", label: "Run pytest" }],
  auto: [],
};

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
 * Get risk badge with color and icon.
 */
function getRiskBadge(level: "low" | "medium" | "high"): string {
  const colorFn =
    level === "high"
      ? colors.riskHigh
      : level === "medium"
        ? colors.riskMedium
        : colors.riskLow;

  const icon =
    level === "high"
      ? icons.riskHigh
      : level === "medium"
        ? icons.riskMedium
        : icons.riskLow;

  return `${icon} ${colorFn(level.toUpperCase())}`;
}

/**
 * Create a section header.
 */
function sectionHeader(title: string, icon?: string): string {
  const prefix = icon ? `${icon}  ` : "";
  return `\n${colors.header(prefix + title)}\n${"─".repeat(50)}\n`;
}

/**
 * Render the Summary section in a box.
 * Uses buildHighlights() for consistent, prioritized summaries.
 */
function renderSummary(
  findings: Finding[],
  riskScore: RenderContext["riskScore"],
  profile: ProfileName
): string {
  // Use highlights for prioritized, consistent bullets
  const highlights = buildHighlights(findings);

  // Get file counts for the header
  const fileSummary = findings.find((f) => f.type === "file-summary") as
    | FileSummaryFinding
    | undefined;

  let fileCountLine = "";
  if (fileSummary) {
    const total =
      fileSummary.added.length +
      fileSummary.modified.length +
      fileSummary.deleted.length +
      fileSummary.renamed.length;

    const parts: string[] = [];
    if (fileSummary.added.length > 0) {
      parts.push(colors.fileAdded(`+${fileSummary.added.length}`));
    }
    if (fileSummary.modified.length > 0) {
      parts.push(colors.fileModified(`~${fileSummary.modified.length}`));
    }
    if (fileSummary.deleted.length > 0) {
      parts.push(colors.fileDeleted(`-${fileSummary.deleted.length}`));
    }
    if (fileSummary.renamed.length > 0) {
      parts.push(colors.fileRenamed(`→${fileSummary.renamed.length}`));
    }

    fileCountLine = `${colors.value(String(total))} file(s) changed ${parts.length > 0 ? `(${parts.join(", ")})` : ""}`;
  }

  // Build the content
  const bullets: string[] = [];

  // File count first
  if (fileCountLine) {
    bullets.push(fileCountLine);
  }

  // Add highlights (limit to 8 for readability)
  for (const highlight of highlights.slice(0, 8)) {
    bullets.push(highlight);
  }

  // Fallback if no bullets
  if (bullets.length === 0) {
    bullets.push("Minor changes detected");
  }

  // Profile line
  const profileLine = `${colors.label("Profile:")} ${colors.accent(profile)}`;

  // Risk line
  const riskLine = `${colors.label("Risk:")} ${getRiskBadge(riskScore.level)} ${colors.muted(`(score: ${riskScore.score}/100)`)}`;

  const content =
    bullets.map((b) => `  ${icons.bullet} ${b}`).join("\n") +
    `\n\n${profileLine}\n${riskLine}`;

  return boxen(content, {
    title: "SUMMARY",
    titleAlignment: "left",
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: "cyan",
    borderStyle: "round",
  });
}

/**
 * Render What Changed section.
 */
function renderWhatChanged(
  categoryFinding: FileCategoryFinding | undefined,
  fileSummary: FileSummaryFinding | undefined
): string {
  if (!categoryFinding || !fileSummary) {
    return "";
  }

  const { categories, summary } = categoryFinding;

  if (summary.length <= 1) {
    return "";
  }

  let output = sectionHeader("WHAT CHANGED", icons.file);

  const orderedCategories = summary
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  for (const { category, count } of orderedCategories) {
    const label = getCategoryLabel(category);
    output += `\n${colors.subheader(label)} ${colors.muted(`(${count})`)}\n`;

    const files = categories[category];
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
  }

  return output;
}

/**
 * Render Routes / API table.
 */
function renderRoutes(routes: RouteChangeFinding[]): string {
  if (routes.length === 0) {
    return "";
  }

  let output = sectionHeader("ROUTES / API", icons.route);

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
    chars: {
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
    },
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

  let output = sectionHeader("DATABASE (SUPABASE)", icons.database);

  for (const migration of migrations) {
    output += `${colors.label("Risk Level:")} ${getRiskBadge(migration.risk)}\n\n`;

    output += `${colors.label("Files:")}\n`;
    for (const file of migration.files) {
      output += `  ${icons.bullet} ${colors.value(file)}\n`;
    }

    if (migration.reasons.length > 0) {
      output += `\n${colors.label("Detected patterns:")}\n`;
      for (const reason of migration.reasons) {
        output += `  ${icons.warning} ${colors.warning(reason)}\n`;
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

  let output = sectionHeader("CONFIG / ENV", icons.config);

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
    chars: {
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
    },
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

  let output = sectionHeader("CLOUDFLARE", "☁️");

  for (const change of changes) {
    output += `${colors.label("Area:")} ${colors.value(change.area)}\n`;
    output += `${colors.label("Files:")}\n`;
    for (const file of change.files) {
      output += `  ${icons.bullet} ${colors.value(file)}\n`;
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

  let output = sectionHeader("DEPENDENCIES", icons.dependency);

  const renderDepTable = (
    depList: DependencyChangeFinding[],
    title: string
  ): string => {
    if (depList.length === 0) return "";

    let result = `${colors.subheader(title)}\n`;

    const table = new Table({
      head: [
        colors.label("Package"),
        colors.label("From"),
        colors.label("To"),
        colors.label("Impact"),
      ],
      style: {
        head: [],
        border: ["dim"],
      },
      chars: {
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
      },
    });

    for (const dep of depList) {
      const impactColor =
        dep.impact === "major"
          ? colors.error
          : dep.impact === "minor"
            ? colors.warning
            : colors.muted;

      table.push([
        colors.packageName(dep.name),
        colors.muted(dep.from ?? "-"),
        colors.version(dep.to ?? "-"),
        impactColor(dep.impact ?? "-"),
      ]);
    }

    result += table.toString() + "\n";
    return result;
  };

  if (prodDeps.length > 0) {
    output += renderDepTable(prodDeps, "Production");
  }
  if (devDeps.length > 0) {
    output += renderDepTable(devDeps, "Dev Dependencies");
  }

  return output;
}

/**
 * Render Suggested test plan section.
 * Uses profile-aware test commands instead of hardcoded framework checks.
 */
function renderTestPlan(
  context: RenderContext,
  groups: Map<string, Finding[]>
): string {
  const bullets: string[] = [];

  const testChanges = groups.get("test-change") as
    | TestChangeFinding[]
    | undefined;
  if (testChanges && testChanges.length > 0) {
    bullets.push(`${colors.accent("bun test")} - Run test suite`);
  }

  // Profile-specific test commands
  const profileCommands = TEST_COMMANDS[context.profile] ?? [];
  for (const { cmd, label } of profileCommands) {
    bullets.push(`${colors.accent(cmd)} - ${label}`);
  }

  const routes = groups.get("route-change") as RouteChangeFinding[] | undefined;
  if (routes) {
    const endpoints = routes.filter((r) => r.routeType === "endpoint");
    for (const endpoint of endpoints.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(endpoint.routeId);
      const methods = endpoint.methods?.join("/") || "GET";
      bullets.push(`Test ${colors.route(`${methods} ${urlPath}`)} endpoint`);
    }

    const pages = routes.filter(
      (r) => r.routeType === "page" && r.change !== "deleted"
    );
    for (const page of pages.slice(0, 3)) {
      const urlPath = routeIdToUrlPath(page.routeId);
      bullets.push(`Verify ${colors.route(urlPath)} page renders correctly`);
    }
  }

  // Test gaps warning
  const testGaps = groups.get("test-gap") as TestGapFinding[] | undefined;
  if (testGaps && testGaps.length > 0) {
    const totalUntested = testGaps.reduce(
      (sum, t) => sum + t.prodFilesChanged,
      0
    );
    bullets.push(
      `${colors.warning(`${totalUntested} modified file(s) lack test coverage`)}`
    );
  }

  if (context.interactive?.testNotes) {
    bullets.push(context.interactive.testNotes);
  }

  if (bullets.length === 0) {
    bullets.push("No specific test suggestions");
  }

  let output = sectionHeader("SUGGESTED TEST PLAN", icons.test);
  for (const bullet of bullets) {
    output += `  ${colors.muted("[ ]")} ${bullet}\n`;
  }

  return output;
}

/**
 * Render Impact Analysis (blast radius) section.
 */
function renderImpact(impacts: ImpactAnalysisFinding[]): string {
  if (impacts.length === 0) {
    return "";
  }

  // Only show high and medium blast radius
  const significant = impacts.filter(
    (i) => i.blastRadius === "high" || i.blastRadius === "medium"
  );

  if (significant.length === 0) {
    return "";
  }

  let output = sectionHeader("IMPACT ANALYSIS", icons.impact);

  const high = significant.filter((i) => i.blastRadius === "high");
  const medium = significant.filter((i) => i.blastRadius === "medium");

  if (high.length > 0) {
    output += `${colors.riskHigh("HIGH BLAST RADIUS")} ${colors.muted(`(${high.length} file(s))`)}\n`;
    for (const impact of high.slice(0, 5)) {
      output += `  ${icons.bullet} ${colors.value(impact.sourceFile)}`;
      if (impact.affectedFiles.length > 0) {
        output += ` ${colors.muted(`→ affects ${impact.affectedFiles.length} file(s)`)}`;
      }
      output += "\n";
    }
    if (high.length > 5) {
      output += `  ${colors.muted(`...and ${high.length - 5} more`)}\n`;
    }
    output += "\n";
  }

  if (medium.length > 0) {
    output += `${colors.riskMedium("MEDIUM BLAST RADIUS")} ${colors.muted(`(${medium.length} file(s))`)}\n`;
    for (const impact of medium.slice(0, 3)) {
      output += `  ${icons.bullet} ${colors.value(impact.sourceFile)}`;
      if (impact.affectedFiles.length > 0) {
        output += ` ${colors.muted(`→ affects ${impact.affectedFiles.length} file(s)`)}`;
      }
      output += "\n";
    }
    if (medium.length > 3) {
      output += `  ${colors.muted(`...and ${medium.length - 3} more`)}\n`;
    }
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

  let output = sectionHeader("INFRASTRUCTURE", icons.infra);

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
      output += `  ${icons.bullet} ${colors.value(file)}\n`;
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

  let output = sectionHeader("CI/CD WORKFLOWS", icons.ci);

  if (securityIssues.length > 0) {
    output += `${colors.riskHigh("⚠️  SECURITY CONCERNS")}\n`;
    for (const issue of securityIssues) {
      const riskLabel =
        issue.riskType === "permissions_broadened"
          ? "Permissions broadened"
          : "pull_request_target trigger";
      output += `  ${icons.bullet} ${colors.warning(issue.file)}: ${colors.error(riskLabel)}\n`;
    }
    output += "\n";
  }

  if (otherChanges.length > 0) {
    output += `${colors.subheader("Modified Workflows")} ${colors.muted(`(${otherChanges.length})`)}\n`;
    for (const change of otherChanges.slice(0, 5)) {
      output += `  ${icons.bullet} ${colors.value(change.file)}`;
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

  let output = sectionHeader("SQL RISKS", icons.sql);

  const destructive = risks.filter((r) => r.riskType === "destructive");
  const other = risks.filter((r) => r.riskType !== "destructive");

  if (destructive.length > 0) {
    output += `${colors.riskHigh("⚠️  DESTRUCTIVE SQL DETECTED")}\n`;
    for (const risk of destructive) {
      output += `  ${icons.bullet} ${colors.error(risk.file)}`;
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
      output += `  ${icons.bullet} ${colors.value(risk.file)}`;
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
 * Render Lockfile Mismatch warning.
 */
function renderLockfileMismatch(findings: LockfileFinding[]): string {
  const mismatch = findings.find((f) => f.type === "lockfile-mismatch");
  if (!mismatch) {
    return "";
  }

  // Only show if there's a mismatch situation
  if (mismatch.manifestChanged === mismatch.lockfileChanged) {
    return "";
  }

  let output = sectionHeader("LOCKFILE WARNING", icons.lock);

  if (mismatch.manifestChanged && !mismatch.lockfileChanged) {
    output += `${colors.warning("⚠️  package.json changed but lockfile not updated")}\n`;
    output += `${colors.muted("Run your package manager to update the lockfile.")}\n`;
  } else if (!mismatch.manifestChanged && mismatch.lockfileChanged) {
    output += `${colors.warning("⚠️  Lockfile changed but package.json not updated")}\n`;
    output += `${colors.muted("This may indicate inconsistent dependency resolution.")}\n`;
  }

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

  let output = sectionHeader("STENCIL COMPONENTS", icons.component);

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
      output += `  ${icons.bullet} ${colors.value(change)}\n`;
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

  let output = sectionHeader("CONFIG CHANGES", icons.config);

  // TypeScript config
  if (tsConfig.length > 0) {
    const breaking = tsConfig.some((c) => c.isBreaking);
    output += `${colors.subheader("TypeScript Config")}`;
    if (breaking) {
      output += ` ${colors.error("(BREAKING)")}`;
    }
    output += "\n";
    for (const config of tsConfig) {
      output += `  ${icons.bullet} ${colors.value(config.file)}`;
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
      output += `  ${icons.bullet} ${colors.value(config.file)}\n`;
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
      output += `  ${icons.bullet} ${colors.value(schema.file)}`;
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
      output += `  ${icons.bullet} ${colors.value("package.json exports")}`;
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
      output += `  ${icons.bullet} ${colors.value(config.tool)}: ${colors.muted(config.file)}\n`;
    }
    output += "\n";
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

  // LargeDiffFinding is a summary finding with filesChanged and linesChanged
  const largeDiff = findings[0];
  if (!largeDiff || largeDiff.linesChanged < 500) {
    return "";
  }

  let output = sectionHeader("LARGE CHANGES", icons.large);

  output += `${colors.warning("⚠️  Large change detected - review carefully")}\n\n`;
  output += `  ${icons.bullet} ${colors.value(`${largeDiff.filesChanged} file(s)`)} changed\n`;
  output += `  ${icons.bullet} ${colors.value(`${largeDiff.linesChanged} line(s)`)} modified\n`;

  return output;
}

/**
 * Render Risks / Notes section.
 */
function renderRisks(context: RenderContext): string {
  const { riskScore } = context;

  let output = sectionHeader("RISKS / NOTES", icons.warning);

  output += `${colors.label("Overall Risk:")} ${getRiskBadge(riskScore.level)} ${colors.muted(`(score: ${riskScore.score}/100)`)}\n\n`;

  const bullets = riskScore.evidenceBullets ?? [];
  if (bullets.length > 0) {
    for (const bullet of bullets) {
      output += `  ${icons.bullet} ${bullet}\n`;
    }
  }

  return output;
}

/**
 * Render the Context section (interactive mode only).
 */
function renderContext(context: RenderContext): string {
  if (!context.interactive?.context) {
    return "";
  }

  return boxen(context.interactive.context, {
    title: "CONTEXT",
    titleAlignment: "left",
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderColor: "blue",
    borderStyle: "round",
  }) + "\n";
}

/**
 * Render findings into a colorized terminal output.
 */
export function renderTerminal(context: RenderContext): string {
  const groups = groupFindings(context.findings);

  let output = "\n";

  // Context (interactive only)
  output += renderContext(context);

  // Summary box (now uses highlights and shows profile)
  output += renderSummary(context.findings, context.riskScore, context.profile);
  output += "\n";

  // Large diff warning (show early if present)
  const largeDiff = (groups.get("large-diff") as LargeDiffFinding[]) ?? [];
  output += renderLargeDiff(largeDiff);

  // Lockfile mismatch warning
  const lockfile = (groups.get("lockfile-mismatch") as LockfileFinding[]) ?? [];
  output += renderLockfileMismatch(lockfile);

  // Impact analysis (blast radius)
  const impacts =
    (groups.get("impact-analysis") as ImpactAnalysisFinding[]) ?? [];
  output += renderImpact(impacts);

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

  // SQL Risks
  const sqlRisks = (groups.get("sql-risk") as SQLRiskFinding[]) ?? [];
  output += renderSQLRisks(sqlRisks);

  // Config / Env
  const envVars = (groups.get("env-var") as EnvVarFinding[]) ?? [];
  output += renderEnvVars(envVars);

  // Config Changes (TypeScript, Tailwind, GraphQL, Package Exports, Monorepo)
  output += renderConfigChanges(groups);

  // Stencil Components
  output += renderStencil(groups);

  // Infrastructure
  const infra = (groups.get("infra-change") as InfraChangeFinding[]) ?? [];
  output += renderInfra(infra);

  // CI/CD Workflows
  const ciWorkflows = (groups.get("ci-workflow") as CIWorkflowFinding[]) ?? [];
  output += renderCIWorkflows(ciWorkflows);

  // Cloudflare
  const cloudflare =
    (groups.get("cloudflare-change") as CloudflareChangeFinding[]) ?? [];
  output += renderCloudflare(cloudflare);

  // Dependencies
  const deps =
    (groups.get("dependency-change") as DependencyChangeFinding[]) ?? [];
  output += renderDependencies(deps);

  // Suggested test plan
  output += renderTestPlan(context, groups);

  // Risks / Notes
  output += renderRisks(context);

  return output;
}

