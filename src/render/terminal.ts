/**
 * Terminal renderer with colors, tables, and visual formatting.
 */

import chalk from "chalk";
import boxen from "boxen";
import Table from "cli-table3";
import type {
  CloudflareChangeFinding,
  DbMigrationFinding,
  DependencyChangeFinding,
  EnvVarFinding,
  FileCategoryFinding,
  FileSummaryFinding,
  Finding,
  RenderContext,
  RouteChangeFinding,
  SecurityFileFinding,
  TestChangeFinding,
} from "../core/types.js";
import { routeIdToUrlPath } from "../analyzers/route-detector.js";
import { getCategoryLabel } from "../analyzers/file-category.js";

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
 */
function renderSummary(
  groups: Map<string, Finding[]>,
  riskScore: RenderContext["riskScore"]
): string {
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

    bullets.push(`${colors.value(String(total))} file(s) changed`);

    if (fileSummary.added.length > 0) {
      bullets.push(
        `${colors.fileAdded(`+${fileSummary.added.length}`)} file(s) added`
      );
    }
    if (fileSummary.deleted.length > 0) {
      bullets.push(
        `${colors.fileDeleted(`-${fileSummary.deleted.length}`)} file(s) deleted`
      );
    }
    if (fileSummary.modified.length > 0) {
      bullets.push(
        `${colors.fileModified(`~${fileSummary.modified.length}`)} file(s) modified`
      );
    }
  }

  const routeChanges = groups.get("route-change") as
    | RouteChangeFinding[]
    | undefined;
  if (routeChanges && routeChanges.length > 0) {
    const newRoutes = routeChanges.filter((r) => r.change === "added");
    if (newRoutes.length > 0) {
      bullets.push(
        `${colors.success(String(newRoutes.length))} new route(s)`
      );
    }
  }

  const migrations = groups.get("db-migration") as
    | DbMigrationFinding[]
    | undefined;
  if (migrations && migrations.length > 0) {
    bullets.push(`${icons.database} Database migrations detected`);
  }

  const deps = groups.get("dependency-change") as
    | DependencyChangeFinding[]
    | undefined;
  if (deps && deps.length > 0) {
    const majorBumps = deps.filter((d) => d.impact === "major");
    if (majorBumps.length > 0) {
      bullets.push(
        `${colors.warning(String(majorBumps.length))} major dependency update(s)`
      );
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
    bullets.push(
      `${icons.security} ${totalFiles} security-sensitive file(s)`
    );
  }

  if (bullets.length === 0) {
    bullets.push("Minor changes detected");
  }

  // Risk line
  const riskLine = `\n${colors.label("Risk:")} ${getRiskBadge(riskScore.level)} ${colors.muted(`(score: ${riskScore.score}/100)`)}`;

  const content =
    bullets.map((b) => `  ${icons.bullet} ${b}`).join("\n") + riskLine;

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

  if (context.profile === "sveltekit") {
    bullets.push(`${colors.accent("bun run check")} - Run SvelteKit type check`);
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

  // Summary box
  output += renderSummary(groups, context.riskScore);
  output += "\n";

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

  // Suggested test plan
  output += renderTestPlan(context, groups);

  // Risks / Notes
  output += renderRisks(context);

  return output;
}

