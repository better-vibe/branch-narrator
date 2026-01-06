/**
 * Stable ID generation for findings and risk flags.
 * 
 * IDs are deterministic and based on canonical fingerprints of the underlying data.
 * This enables stable references across multiple analysis runs.
 */

import { createHash } from "node:crypto";
import type { Finding, RiskFlag } from "./types.js";

/**
 * Normalize a file path to POSIX format for deterministic hashing.
 * Converts backslashes to forward slashes.
 */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

/**
 * Create a stable hash from a string using SHA-256.
 * Returns the first 12 characters of the hex digest.
 */
export function stableHash(input: string): string {
  const hash = createHash("sha256").update(input).digest("hex");
  return hash.slice(0, 12);
}

/**
 * Sort an array deterministically for hashing.
 * Creates a copy to avoid mutating the original.
 */
function sortForHash<T>(arr: T[]): T[] {
  return [...arr].sort();
}

/**
 * Build a stable finding ID based on the finding's canonical identity.
 * 
 * The fingerprint includes:
 * - Finding type
 * - Stable identifying attributes (e.g., env var name, package name, route ID)
 * - Sorted file paths (normalized to POSIX)
 * 
 * Format: "finding.<type>#<hash>"
 */
export function buildFindingId(finding: Finding): string {
  let fingerprint: string;

  switch (finding.type) {
    case "env-var": {
      // Fingerprint: type + varName + sorted(files)
      const files = sortForHash(finding.evidenceFiles.map(normalizePath));
      fingerprint = `env-var:${finding.name}:${files.join(",")}`;
      break;
    }

    case "dependency-change": {
      // Fingerprint: type + package + from + to + section
      fingerprint = `dependency-change:${finding.name}:${finding.from || "null"}:${finding.to || "null"}:${finding.section}`;
      break;
    }

    case "route-change": {
      // Fingerprint: type + routeId + change + routeType
      const routeId = normalizePath(finding.routeId);
      fingerprint = `route-change:${routeId}:${finding.change}:${finding.routeType}`;
      break;
    }

    case "db-migration": {
      // Fingerprint: type + tool + sorted(files)
      const files = sortForHash(finding.files.map(normalizePath));
      fingerprint = `db-migration:${finding.tool}:${files.join(",")}`;
      break;
    }

    case "cloudflare-change": {
      // Fingerprint: type + area + sorted(files)
      const files = sortForHash(finding.files.map(normalizePath));
      fingerprint = `cloudflare-change:${finding.area}:${files.join(",")}`;
      break;
    }

    case "test-change": {
      // Fingerprint: type + framework + sorted(files)
      const files = sortForHash(finding.files.map(normalizePath));
      fingerprint = `test-change:${finding.framework}:${files.join(",")}`;
      break;
    }

    case "security-file": {
      // Fingerprint: type + sorted(files) + sorted(reasons)
      const files = sortForHash(finding.files.map(normalizePath));
      const reasons = sortForHash(finding.reasons);
      fingerprint = `security-file:${files.join(",")}:${reasons.join(",")}`;
      break;
    }

    case "file-category": {
      // Fingerprint: type + sorted category entries
      const entries = Object.entries(finding.categories)
        .map(([cat, files]) => `${cat}:${sortForHash(files.map(normalizePath)).join(",")}`)
        .sort();
      fingerprint = `file-category:${entries.join("|")}`;
      break;
    }

    case "file-summary": {
      // Fingerprint: type + category + sorted file lists
      const added = sortForHash(finding.added.map(normalizePath)).join(",");
      const modified = sortForHash(finding.modified.map(normalizePath)).join(",");
      const deleted = sortForHash(finding.deleted.map(normalizePath)).join(",");
      const renamed = sortForHash(
        finding.renamed.map(r => `${normalizePath(r.from)}->${normalizePath(r.to)}`)
      ).join(",");
      fingerprint = `file-summary:${finding.category}:a=${added}:m=${modified}:d=${deleted}:r=${renamed}`;
      break;
    }

    case "convention-violation": {
      // Fingerprint: type + message + sorted(files)
      const files = sortForHash(finding.files.map(normalizePath));
      fingerprint = `convention-violation:${finding.message}:${files.join(",")}`;
      break;
    }

    case "impact-analysis": {
      // Fingerprint: type + sourceFile + sorted(affectedFiles)
      const sourceFile = normalizePath(finding.sourceFile);
      const affected = sortForHash(finding.affectedFiles.map(normalizePath));
      fingerprint = `impact-analysis:${sourceFile}:${affected.join(",")}`;
      break;
    }

    case "ci-workflow": {
      // Fingerprint: type + file + riskType
      const file = normalizePath(finding.file);
      fingerprint = `ci-workflow:${file}:${finding.riskType}`;
      break;
    }

    case "sql-risk": {
      // Fingerprint: type + file + riskType
      const file = normalizePath(finding.file);
      fingerprint = `sql-risk:${file}:${finding.riskType}`;
      break;
    }

    case "infra-change": {
      // Fingerprint: type + infraType + sorted(files)
      const files = sortForHash(finding.files.map(normalizePath));
      fingerprint = `infra-change:${finding.infraType}:${files.join(",")}`;
      break;
    }

    case "api-contract-change": {
      // Fingerprint: type + sorted(files)
      const files = sortForHash(finding.files.map(normalizePath));
      fingerprint = `api-contract-change:${files.join(",")}`;
      break;
    }

    case "large-diff": {
      // Fingerprint: type + filesChanged + linesChanged
      fingerprint = `large-diff:${finding.filesChanged}:${finding.linesChanged}`;
      break;
    }

    case "lockfile-mismatch": {
      // Fingerprint: type + manifestChanged + lockfileChanged
      fingerprint = `lockfile-mismatch:${finding.manifestChanged}:${finding.lockfileChanged}`;
      break;
    }

    case "test-gap": {
      // Fingerprint: type + prodFilesChanged + testFilesChanged
      fingerprint = `test-gap:${finding.prodFilesChanged}:${finding.testFilesChanged}`;
      break;
    }

    case "risk-flag": {
      // Fingerprint: type + risk + evidenceText (legacy)
      // Note: risk-flag findings are being phased out in favor of derived flags
      fingerprint = `risk-flag:${finding.risk}:${finding.evidenceText}`;
      break;
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = finding;
      throw new Error(`Unknown finding type: ${(_exhaustive as Finding).type}`);
    }
  }

  const hash = stableHash(fingerprint);
  return `finding.${finding.type}#${hash}`;
}

/**
 * Build a stable flag ID based on the rule key and related findings.
 * 
 * Format: "flag.<ruleKey>#<hash>"
 * 
 * The hash is computed from:
 * - ruleKey
 * - sorted relatedFindingIds
 */
export function buildFlagId(ruleKey: string, relatedFindingIds: string[]): string {
  const sortedIds = sortForHash(relatedFindingIds);
  const fingerprint = `${ruleKey}:${sortedIds.join(",")}`;
  const hash = stableHash(fingerprint);
  return `flag.${ruleKey}#${hash}`;
}

/**
 * Assign findingId to a finding (immutable - returns new finding).
 */
export function assignFindingId<T extends Finding>(finding: T): T & { findingId: string } {
  const findingId = buildFindingId(finding);
  return { ...finding, findingId };
}

/**
 * Assign flagId to a risk flag (immutable - returns new flag).
 */
export function assignFlagId(flag: RiskFlag): RiskFlag & { flagId: string } {
  const ruleKey = flag.id; // Current 'id' becomes 'ruleKey'
  const relatedFindingIds = (flag as any).relatedFindingIds || [];
  const flagId = buildFlagId(ruleKey, relatedFindingIds);
  return { ...flag, flagId, ruleKey };
}
