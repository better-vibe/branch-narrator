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
  DbMigrationFinding,
  DependencyChangeFinding,
  EnvVarFinding,
  FactsOutput,
  Finding,
  RouteChangeFinding,
  CloudflareChangeFinding,
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

    default:
      // Other finding types are not mapped to SARIF rules in MVP
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
