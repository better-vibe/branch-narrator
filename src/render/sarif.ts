/**
 * SARIF 2.1.0 renderer for branch-narrator facts output.
 *
 * This module converts findings from branch-narrator into SARIF format
 * for GitHub Code Scanning and other static analysis tool integrations.
 *
 * SARIF spec: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import type {
  ChangeSet,
  CIWorkflowFinding,
  DbMigrationFinding,
  DependencyChangeFinding,
  EnvVarFinding,
  FactsOutput,
  Finding,
  GraphQLChangeFinding,
  InfraChangeFinding,
  LargeDiffFinding,
  PackageExportsFinding,
  RouteChangeFinding,
  CloudflareChangeFinding,
  SecurityFileFinding,
  SQLRiskFinding,
  StencilComponentChangeFinding,
  StencilEventChangeFinding,
  StencilMethodChangeFinding,
  StencilPropChangeFinding,
  StencilSlotChangeFinding,
  TypeScriptConfigFinding,
} from "../core/types.js";
import { getAdditionsWithLineNumbers } from "../git/parser.js";
import { getVersionSync } from "../core/version.js";

// ============================================================================
// SARIF 2.1.0 Types (subset needed for our use case)
// ============================================================================

export interface SarifLog {
  version: "2.1.0";
  $schema: string;
  runs: SarifRun[];
}

export interface SarifRun {
  tool: SarifTool;
  results: SarifResult[];
  originalUriBaseIds?: Record<string, SarifArtifactLocation>;
}

export interface SarifTool {
  driver: SarifToolComponent;
}

export interface SarifToolComponent {
  name: string;
  version?: string;
  informationUri?: string;
  rules?: SarifReportingDescriptor[];
}

export interface SarifReportingDescriptor {
  id: string;
  name?: string;
  shortDescription?: SarifMultiformatMessageString;
  fullDescription?: SarifMultiformatMessageString;
  help?: SarifMultiformatMessageString;
  defaultConfiguration?: SarifReportingConfiguration;
  properties?: Record<string, unknown>;
}

export interface SarifReportingConfiguration {
  level?: SarifLevel;
}

export interface SarifMultiformatMessageString {
  text: string;
  markdown?: string;
}

export type SarifLevel = "none" | "note" | "warning" | "error";

export interface SarifResult {
  ruleId: string;
  level?: SarifLevel;
  message: SarifMessage;
  locations?: SarifLocation[];
  partialFingerprints?: Record<string, string>;
  properties?: Record<string, unknown>;
}

export interface SarifMessage {
  text: string;
  markdown?: string;
}

export interface SarifLocation {
  physicalLocation?: SarifPhysicalLocation;
}

export interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

export interface SarifArtifactLocation {
  uri: string;
  uriBaseId?: string;
}

export interface SarifRegion {
  startLine?: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
}

// ============================================================================
// Rule Definitions
// ============================================================================

export interface RuleMapping {
  id: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  defaultLevel: SarifLevel;
  category?: string;
}

/**
 * Stable rule set for SARIF output.
 * These IDs are stable and should not change across versions.
 */
export const SARIF_RULES: Record<string, RuleMapping> = {
  BNR001: {
    id: "BNR001",
    name: "DangerousSqlInMigration",
    shortDescription: "Dangerous SQL detected in migration",
    fullDescription:
      "Database migration contains potentially destructive SQL operations (DROP, TRUNCATE, ALTER TYPE, etc.) that could cause data loss or service disruption.",
    defaultLevel: "error",
    category: "database",
  },
  BNR002: {
    id: "BNR002",
    name: "MigrationChanged",
    shortDescription: "Migration changed (non-destructive)",
    fullDescription:
      "Database migration file has been modified or added. Review schema changes for compatibility and rollback safety.",
    defaultLevel: "warning",
    category: "database",
  },
  BNR003: {
    id: "BNR003",
    name: "MajorDependencyBump",
    shortDescription: "Major bump in critical dependencies",
    fullDescription:
      "Major version bump detected in critical framework dependencies (e.g., @sveltejs/kit, svelte, vite, react, next). Major upgrades may introduce breaking changes.",
    defaultLevel: "warning",
    category: "dependencies",
  },
  BNR004: {
    id: "BNR004",
    name: "NewEnvVarReference",
    shortDescription: "New environment variable reference detected",
    fullDescription:
      "Code references a new environment variable. Ensure this variable is documented and configured in all deployment environments.",
    defaultLevel: "warning",
    category: "config_env",
  },
  BNR005: {
    id: "BNR005",
    name: "CloudflareConfigChanged",
    shortDescription: "Cloudflare configuration changed",
    fullDescription:
      "Cloudflare configuration files (wrangler.toml, Pages workflows) have been modified. Review deployment settings and worker configurations.",
    defaultLevel: "note",
    category: "infra",
  },
  BNR006: {
    id: "BNR006",
    name: "EndpointChanged",
    shortDescription: "API endpoint changed",
    fullDescription:
      "API endpoint file has been added, modified, or deleted. Verify API contract compatibility and update client code if needed.",
    defaultLevel: "note",
    category: "api",
  },
  BNR007: {
    id: "BNR007",
    name: "CIWorkflowPermissionsBroadened",
    shortDescription: "CI workflow permissions broadened",
    fullDescription:
      "GitHub Actions workflow has broadened permissions, which could allow unauthorized access to secrets or repository data. Review the permission changes carefully.",
    defaultLevel: "error",
    category: "security",
  },
  BNR008: {
    id: "BNR008",
    name: "CIWorkflowPullRequestTarget",
    shortDescription: "CI workflow uses pull_request_target",
    fullDescription:
      "GitHub Actions workflow uses pull_request_target trigger, which runs with write permissions on the base repository. This can be exploited if the workflow checks out or runs code from the PR.",
    defaultLevel: "error",
    category: "security",
  },
  BNR009: {
    id: "BNR009",
    name: "SecurityFileChanged",
    shortDescription: "Security-sensitive file changed",
    fullDescription:
      "A file related to authentication, authorization, or security configuration has been modified. Review these changes carefully for potential vulnerabilities.",
    defaultLevel: "warning",
    category: "security",
  },
  BNR010: {
    id: "BNR010",
    name: "GraphQLBreakingChange",
    shortDescription: "Breaking change in GraphQL schema",
    fullDescription:
      "GraphQL schema contains breaking changes such as removed types, fields, or arguments. This may break existing clients consuming the API.",
    defaultLevel: "error",
    category: "api",
  },
  BNR011: {
    id: "BNR011",
    name: "PackageExportsBreakingChange",
    shortDescription: "Breaking change in package exports",
    fullDescription:
      "Package exports have breaking changes such as removed exports or modified bin entries. This may break downstream consumers of this package.",
    defaultLevel: "error",
    category: "api",
  },
  BNR012: {
    id: "BNR012",
    name: "StencilAPIBreakingChange",
    shortDescription: "Breaking change in Stencil component API",
    fullDescription:
      "Stencil web component has breaking API changes such as removed props, events, methods, or slots. This may break consumers of the component library.",
    defaultLevel: "warning",
    category: "api",
  },
  BNR013: {
    id: "BNR013",
    name: "TypeScriptConfigBreaking",
    shortDescription: "Breaking TypeScript configuration change",
    fullDescription:
      "TypeScript configuration has breaking changes that may cause compilation errors in the codebase, such as stricter type checking options.",
    defaultLevel: "warning",
    category: "config_env",
  },
  BNR014: {
    id: "BNR014",
    name: "DestructiveSQL",
    shortDescription: "Destructive SQL operation detected",
    fullDescription:
      "SQL file contains destructive operations (DROP, TRUNCATE, DELETE without WHERE) that could cause data loss. Review carefully before execution.",
    defaultLevel: "error",
    category: "database",
  },
  BNR015: {
    id: "BNR015",
    name: "InfrastructureChanged",
    shortDescription: "Infrastructure configuration changed",
    fullDescription:
      "Infrastructure files (Dockerfile, Terraform, Kubernetes) have been modified. Review for security implications and deployment impact.",
    defaultLevel: "warning",
    category: "infra",
  },
  BNR017: {
    id: "BNR017",
    name: "LargeDiff",
    shortDescription: "Large diff detected",
    fullDescription:
      "This change has a large number of modified files or lines, which may indicate a refactoring or generated code. Consider breaking into smaller PRs for easier review.",
    defaultLevel: "note",
    category: "quality",
  },
};

/**
 * Critical framework dependencies that trigger BNR003.
 */
const CRITICAL_DEPENDENCIES = [
  "@sveltejs/kit",
  "svelte",
  "vite",
  "react",
  "react-dom",
  "next",
  "@stencil/core",
];



// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a proper file URI from a directory path for SARIF originalUriBaseIds.
 * Handles both Windows and Unix paths correctly per RFC 3986.
 * Always includes trailing slash as this represents a base directory.
 */
function buildFileUri(path: string): string {
  // Normalize backslashes to forward slashes for Windows
  const normalized = path.replace(/\\/g, "/");
  
  // RFC 3986: file URI scheme is file:/// followed by absolute path
  // Unix directory: /home/user → file:///home/user/
  // Windows directory: C:/path → file:///C:/path/
  
  // All file URIs have three slashes total (file:// + / + path)
  // Trailing slash indicates directory per SARIF spec
  return "file:///" + normalized + "/";
}

// ============================================================================
// Renderer
// ============================================================================

/**
 * Render facts output as SARIF 2.1.0.
 */
export function renderSarif(facts: FactsOutput, changeSet: ChangeSet): SarifLog {
  const results = findingsToSarifResults(facts.findings, changeSet);

  // Collect unique rule IDs used in results
  const usedRuleIds = new Set(results.map((r) => r.ruleId));
  const rules = Array.from(usedRuleIds)
    .sort() // Stable ordering
    .map((ruleId) => {
      const rule = SARIF_RULES[ruleId];
      if (!rule) {
        throw new Error(`Unknown SARIF rule ID: ${ruleId}`);
      }
      return ruleToDescriptor(rule);
    });

  return {
    version: "2.1.0",
    $schema: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "branch-narrator",
            version: getVersionSync(),
            informationUri: "https://github.com/better-vibe/branch-narrator",
            rules,
          },
        },
        results,
        originalUriBaseIds: {
          SRCROOT: {
            uri: buildFileUri(facts.git.repoRoot),
          },
        },
      },
    ],
  };
}

/**
 * Convert a rule mapping to a SARIF reporting descriptor.
 */
function ruleToDescriptor(rule: RuleMapping): SarifReportingDescriptor {
  return {
    id: rule.id,
    name: rule.name,
    shortDescription: { text: rule.shortDescription },
    fullDescription: { text: rule.fullDescription },
    defaultConfiguration: {
      level: rule.defaultLevel,
    },
    properties: {
      category: rule.category,
    },
  };
}

/**
 * Convert findings to SARIF results with stable ordering.
 */
function findingsToSarifResults(
  findings: Finding[],
  changeSet: ChangeSet
): SarifResult[] {
  const results: SarifResult[] = [];

  // Sort findings by type then by findingId for deterministic ordering
  const sortedFindings = [...findings].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type.localeCompare(b.type);
    }
    return (a.findingId || "").localeCompare(b.findingId || "");
  });

  for (const finding of sortedFindings) {
    const mapped = mapFindingToResult(finding, changeSet);
    if (mapped) {
      results.push(mapped);
    }
  }

  return results;
}

/**
 * Map a single finding to a SARIF result.
 * Returns null if the finding doesn't map to any SARIF rule.
 */
function mapFindingToResult(
  finding: Finding,
  changeSet: ChangeSet
): SarifResult | null {
  switch (finding.type) {
    case "db-migration":
      return mapDbMigrationFinding(finding as DbMigrationFinding);

    case "dependency-change":
      return mapDependencyChangeFinding(finding as DependencyChangeFinding);

    case "env-var":
      return mapEnvVarFinding(finding as EnvVarFinding, changeSet);

    case "cloudflare-change":
      return mapCloudflareChangeFinding(finding as CloudflareChangeFinding);

    case "route-change":
      return mapRouteChangeFinding(finding as RouteChangeFinding);

    case "ci-workflow":
      return mapCIWorkflowFinding(finding as CIWorkflowFinding);

    case "security-file":
      return mapSecurityFileFinding(finding as SecurityFileFinding);

    case "graphql-change":
      return mapGraphQLChangeFinding(finding as GraphQLChangeFinding);

    case "package-exports":
      return mapPackageExportsFinding(finding as PackageExportsFinding);

    case "stencil-component-change":
      return mapStencilComponentChangeFinding(
        finding as StencilComponentChangeFinding
      );

    case "stencil-prop-change":
      return mapStencilPropChangeFinding(finding as StencilPropChangeFinding);

    case "stencil-event-change":
      return mapStencilEventChangeFinding(finding as StencilEventChangeFinding);

    case "stencil-method-change":
      return mapStencilMethodChangeFinding(
        finding as StencilMethodChangeFinding
      );

    case "stencil-slot-change":
      return mapStencilSlotChangeFinding(finding as StencilSlotChangeFinding);

    case "typescript-config":
      return mapTypeScriptConfigFinding(finding as TypeScriptConfigFinding);

    case "sql-risk":
      return mapSQLRiskFinding(finding as SQLRiskFinding);

    case "infra-change":
      return mapInfraChangeFinding(finding as InfraChangeFinding);

    case "large-diff":
      return mapLargeDiffFinding(finding as LargeDiffFinding);

    default:
      // Other finding types are not mapped to SARIF rules
      return null;
  }
}

/**
 * Map database migration finding to SARIF result.
 */
function mapDbMigrationFinding(finding: DbMigrationFinding): SarifResult {
  const ruleId = finding.risk === "high" ? "BNR001" : "BNR002";
  const level = finding.risk === "high" ? "error" : "warning";

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const reasons = finding.reasons.join(", ");
  const message =
    finding.risk === "high"
      ? `Dangerous SQL migration detected: ${reasons}`
      : `Database migration changed: ${reasons}`;

  return {
    ruleId,
    level,
    message: { text: message },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      tool: finding.tool,
      files: finding.files,
      risk: finding.risk,
    },
  };
}

/**
 * Map dependency change finding to SARIF result.
 */
function mapDependencyChangeFinding(
  finding: DependencyChangeFinding
): SarifResult | null {
  // Only report major bumps in critical dependencies
  if (
    finding.impact !== "major" ||
    !CRITICAL_DEPENDENCIES.includes(finding.name)
  ) {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR003",
    level: "warning",
    message: {
      text: `Major version bump: ${finding.name} ${finding.from || "?"} → ${finding.to || "?"}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      dependency: finding.name,
      from: finding.from,
      to: finding.to,
      section: finding.section,
    },
  };
}

/**
 * Map environment variable finding to SARIF result.
 */
function mapEnvVarFinding(
  finding: EnvVarFinding,
  changeSet: ChangeSet
): SarifResult {
  // Try to find line numbers for evidence
  const locations: SarifLocation[] = [];

  for (const ev of finding.evidence) {
    // Use ev.line if already set, otherwise try to compute from diff
    let lineNumber = ev.line;
    
    if (lineNumber == null && ev.excerpt) {
      const diff = changeSet.diffs.find((d) => d.path === ev.file);
      if (diff) {
        // Try to find the line number by searching for the excerpt in additions
        const additionsWithLines = getAdditionsWithLineNumbers(diff);
        const match = additionsWithLines.find((add) =>
          add.line.includes(ev.excerpt)
        );
        if (match) {
          lineNumber = match.lineNumber;
        }
      }
    }

    locations.push({
      physicalLocation: {
        artifactLocation: {
          uri: ev.file,
          uriBaseId: "SRCROOT",
        },
        region: lineNumber != null
          ? {
              startLine: lineNumber,
            }
          : undefined,
      },
    });
  }

  return {
    ruleId: "BNR004",
    level: "warning",
    message: {
      text: `New environment variable referenced: ${finding.name}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      envVar: finding.name,
      change: finding.change,
      evidenceFiles: finding.evidenceFiles,
    },
  };
}

/**
 * Map Cloudflare change finding to SARIF result.
 */
function mapCloudflareChangeFinding(
  finding: CloudflareChangeFinding
): SarifResult {
  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR005",
    level: "note",
    message: {
      text: `Cloudflare configuration changed in ${finding.files.join(", ")}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      area: finding.area,
      files: finding.files,
    },
  };
}

/**
 * Map route change finding to SARIF result.
 */
function mapRouteChangeFinding(finding: RouteChangeFinding): SarifResult {
  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const methods = finding.methods ? ` (${finding.methods.join(", ")})` : "";
  const changeText =
    finding.change === "added"
      ? "added"
      : finding.change === "deleted"
        ? "deleted"
        : "modified";

  return {
    ruleId: "BNR006",
    level: "note",
    message: {
      text: `API endpoint ${changeText}: ${finding.routeId}${methods}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      routeId: finding.routeId,
      file: finding.file,
      change: finding.change,
      routeType: finding.routeType,
      methods: finding.methods,
    },
  };
}

/**
 * Map CI workflow finding to SARIF result.
 * Only maps high-risk workflow changes (permissions_broadened, pull_request_target).
 */
function mapCIWorkflowFinding(finding: CIWorkflowFinding): SarifResult | null {
  // Only map security-critical risk types
  if (
    finding.riskType !== "permissions_broadened" &&
    finding.riskType !== "pull_request_target"
  ) {
    return null;
  }

  const ruleId =
    finding.riskType === "permissions_broadened" ? "BNR007" : "BNR008";

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const message =
    finding.riskType === "permissions_broadened"
      ? `CI workflow permissions broadened in ${finding.file}: ${finding.details}`
      : `CI workflow uses pull_request_target in ${finding.file}: ${finding.details}`;

  return {
    ruleId,
    level: "error",
    message: { text: message },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      file: finding.file,
      riskType: finding.riskType,
      details: finding.details,
    },
  };
}

/**
 * Map security file finding to SARIF result.
 */
function mapSecurityFileFinding(finding: SecurityFileFinding): SarifResult {
  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR009",
    level: "warning",
    message: {
      text: `Security-sensitive files changed: ${finding.files.join(", ")}. Reasons: ${finding.reasons.join(", ")}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      files: finding.files,
      reasons: finding.reasons,
    },
  };
}

/**
 * Map GraphQL change finding to SARIF result.
 * Only maps breaking changes.
 */
function mapGraphQLChangeFinding(
  finding: GraphQLChangeFinding
): SarifResult | null {
  if (!finding.isBreaking) {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR010",
    level: "error",
    message: {
      text: `Breaking GraphQL schema changes in ${finding.file}: ${finding.breakingChanges.join(", ")}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      file: finding.file,
      breakingChanges: finding.breakingChanges,
      addedElements: finding.addedElements,
    },
  };
}

/**
 * Map package exports finding to SARIF result.
 * Only maps breaking changes.
 */
function mapPackageExportsFinding(
  finding: PackageExportsFinding
): SarifResult | null {
  if (!finding.isBreaking) {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const changes: string[] = [];
  if (finding.removedExports.length > 0) {
    changes.push(`removed exports: ${finding.removedExports.join(", ")}`);
  }
  if (finding.binChanges.removed.length > 0) {
    changes.push(`removed bins: ${finding.binChanges.removed.join(", ")}`);
  }

  return {
    ruleId: "BNR011",
    level: "error",
    message: {
      text: `Breaking package exports changes: ${changes.join("; ")}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      removedExports: finding.removedExports,
      addedExports: finding.addedExports,
      binChanges: finding.binChanges,
    },
  };
}

/**
 * Map Stencil component change finding to SARIF result.
 * Only maps breaking changes (removed components).
 */
function mapStencilComponentChangeFinding(
  finding: StencilComponentChangeFinding
): SarifResult | null {
  // Only "removed" is considered breaking for components
  if (finding.change !== "removed") {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR012",
    level: "warning",
    message: {
      text: `Stencil component removed: <${finding.tag}>`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      tag: finding.tag,
      change: finding.change,
      file: finding.file,
    },
  };
}

/**
 * Map Stencil prop change finding to SARIF result.
 * Only maps breaking changes (removed props).
 */
function mapStencilPropChangeFinding(
  finding: StencilPropChangeFinding
): SarifResult | null {
  // Only "removed" is considered breaking for props
  if (finding.change !== "removed") {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR012",
    level: "warning",
    message: {
      text: `Stencil prop removed: <${finding.tag}> @Prop() ${finding.propName}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      tag: finding.tag,
      propName: finding.propName,
      change: finding.change,
      file: finding.file,
    },
  };
}

/**
 * Map Stencil event change finding to SARIF result.
 * Only maps breaking changes (removed events).
 */
function mapStencilEventChangeFinding(
  finding: StencilEventChangeFinding
): SarifResult | null {
  // Only "removed" is considered breaking for events
  if (finding.change !== "removed") {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR012",
    level: "warning",
    message: {
      text: `Stencil event removed: <${finding.tag}> @Event() ${finding.eventName}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      tag: finding.tag,
      eventName: finding.eventName,
      change: finding.change,
      file: finding.file,
    },
  };
}

/**
 * Map Stencil method change finding to SARIF result.
 * Only maps breaking changes (removed methods).
 */
function mapStencilMethodChangeFinding(
  finding: StencilMethodChangeFinding
): SarifResult | null {
  // Only "removed" is considered breaking for methods
  if (finding.change !== "removed") {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR012",
    level: "warning",
    message: {
      text: `Stencil method removed: <${finding.tag}> @Method() ${finding.methodName}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      tag: finding.tag,
      methodName: finding.methodName,
      change: finding.change,
      file: finding.file,
    },
  };
}

/**
 * Map Stencil slot change finding to SARIF result.
 * Only maps breaking changes (removed slots).
 */
function mapStencilSlotChangeFinding(
  finding: StencilSlotChangeFinding
): SarifResult | null {
  // Only "removed" is considered breaking for slots
  if (finding.change !== "removed") {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const slotDisplay =
    finding.slotName === "default" ? "default slot" : `slot "${finding.slotName}"`;

  return {
    ruleId: "BNR012",
    level: "warning",
    message: {
      text: `Stencil ${slotDisplay} removed from <${finding.tag}>`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      tag: finding.tag,
      slotName: finding.slotName,
      change: finding.change,
      file: finding.file,
    },
  };
}

/**
 * Map TypeScript config finding to SARIF result.
 * Only maps breaking changes.
 */
function mapTypeScriptConfigFinding(
  finding: TypeScriptConfigFinding
): SarifResult | null {
  if (!finding.isBreaking) {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const changes: string[] = [];
  if (finding.strictnessChanges.length > 0) {
    changes.push(finding.strictnessChanges.join(", "));
  }
  if (finding.changedOptions.removed.length > 0) {
    changes.push(`removed: ${finding.changedOptions.removed.join(", ")}`);
  }

  return {
    ruleId: "BNR013",
    level: "warning",
    message: {
      text: `Breaking TypeScript config changes in ${finding.file}: ${changes.join("; ")}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      file: finding.file,
      changedOptions: finding.changedOptions,
      strictnessChanges: finding.strictnessChanges,
    },
  };
}

/**
 * Map SQL risk finding to SARIF result.
 * Only maps destructive operations.
 */
function mapSQLRiskFinding(finding: SQLRiskFinding): SarifResult | null {
  // Only map destructive SQL operations
  if (finding.riskType !== "destructive") {
    return null;
  }

  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR014",
    level: "error",
    message: {
      text: `Destructive SQL operation in ${finding.file}: ${finding.details}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      file: finding.file,
      riskType: finding.riskType,
      details: finding.details,
    },
  };
}

/**
 * Map infrastructure change finding to SARIF result.
 */
function mapInfraChangeFinding(finding: InfraChangeFinding): SarifResult {
  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  const infraTypeDisplay = {
    dockerfile: "Dockerfile",
    terraform: "Terraform",
    k8s: "Kubernetes",
  }[finding.infraType];

  return {
    ruleId: "BNR015",
    level: "warning",
    message: {
      text: `${infraTypeDisplay} configuration changed: ${finding.files.join(", ")}`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      infraType: finding.infraType,
      files: finding.files,
    },
  };
}

/**
 * Map large diff finding to SARIF result.
 */
function mapLargeDiffFinding(finding: LargeDiffFinding): SarifResult {
  const locations = finding.evidence.map((ev) => ({
    physicalLocation: {
      artifactLocation: {
        uri: ev.file,
        uriBaseId: "SRCROOT",
      },
      region: ev.line
        ? {
            startLine: ev.line,
          }
        : undefined,
    },
  }));

  return {
    ruleId: "BNR017",
    level: "note",
    message: {
      text: `Large diff detected: ${finding.filesChanged} files changed, ${finding.linesChanged} lines modified`,
    },
    locations,
    partialFingerprints: {
      findingId: finding.findingId || "",
    },
    properties: {
      filesChanged: finding.filesChanged,
      linesChanged: finding.linesChanged,
    },
  };
}
