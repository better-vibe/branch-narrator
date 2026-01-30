/**
 * Stable ID generation for findings and risk flags.
 *
 * IDs are deterministic and based on canonical fingerprints of the underlying data.
 * This enables stable references across multiple analysis runs.
 */

import { createHash } from "node:crypto";
import type { Finding } from "./types.js";

/**
 * Normalize a file path to POSIX format for deterministic hashing.
 * Converts backslashes to forward slashes.
 * Note: This is intentionally NOT exported to avoid conflict with sorting.ts's normalizePath.
 */
function normalizePathForHash(path: string): string {
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
      const files = sortForHash(finding.evidenceFiles.map(normalizePathForHash));
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
      const routeId = normalizePathForHash(finding.routeId);
      fingerprint = `route-change:${routeId}:${finding.change}:${finding.routeType}`;
      break;
    }

    case "db-migration": {
      // Fingerprint: type + tool + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      fingerprint = `db-migration:${finding.tool}:${files.join(",")}`;
      break;
    }

    case "cloudflare-change": {
      // Fingerprint: type + area + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      fingerprint = `cloudflare-change:${finding.area}:${files.join(",")}`;
      break;
    }

    case "test-change": {
      // Fingerprint: type + framework + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      fingerprint = `test-change:${finding.framework}:${files.join(",")}`;
      break;
    }

    case "security-file": {
      // Fingerprint: type + sorted(files) + sorted(reasons)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      const reasons = sortForHash(finding.reasons);
      fingerprint = `security-file:${files.join(",")}:${reasons.join(",")}`;
      break;
    }

    case "file-category": {
      // Fingerprint: type + sorted category entries
      const entries = Object.entries(finding.categories)
        .map(([cat, files]) => `${cat}:${sortForHash(files.map(normalizePathForHash)).join(",")}`)
        .sort();
      fingerprint = `file-category:${entries.join("|")}`;
      break;
    }

    case "file-summary": {
      // Fingerprint: type + category + sorted file lists
      const added = sortForHash(finding.added.map(normalizePathForHash)).join(",");
      const modified = sortForHash(finding.modified.map(normalizePathForHash)).join(",");
      const deleted = sortForHash(finding.deleted.map(normalizePathForHash)).join(",");
      const renamed = sortForHash(
        finding.renamed.map(r => `${normalizePathForHash(r.from)}->${normalizePathForHash(r.to)}`)
      ).join(",");
      fingerprint = `file-summary:${finding.category}:a=${added}:m=${modified}:d=${deleted}:r=${renamed}`;
      break;
    }

    case "convention-violation": {
      // Fingerprint: type + message + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      fingerprint = `convention-violation:${finding.message}:${files.join(",")}`;
      break;
    }

    case "impact-analysis": {
      // Fingerprint: type + sourceFile + sorted(affectedFiles)
      const sourceFile = normalizePathForHash(finding.sourceFile);
      const affected = sortForHash(finding.affectedFiles.map(normalizePathForHash));
      fingerprint = `impact-analysis:${sourceFile}:${affected.join(",")}`;
      break;
    }

    case "ci-workflow": {
      // Fingerprint: type + file + riskType
      const file = normalizePathForHash(finding.file);
      fingerprint = `ci-workflow:${file}:${finding.riskType}`;
      break;
    }

    case "sql-risk": {
      // Fingerprint: type + file + riskType
      const file = normalizePathForHash(finding.file);
      fingerprint = `sql-risk:${file}:${finding.riskType}`;
      break;
    }

    case "infra-change": {
      // Fingerprint: type + infraType + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      fingerprint = `infra-change:${finding.infraType}:${files.join(",")}`;
      break;
    }

    case "api-contract-change": {
      // Fingerprint: type + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
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

    case "stencil-component-change": {
      // Fingerprint: type + tag + change + file
      const file = normalizePathForHash(finding.file);
      fingerprint = `stencil-component-change:${finding.tag}:${finding.change}:${file}:${finding.fromTag || ""}:${finding.toTag || ""}`;
      break;
    }

    case "stencil-prop-change": {
      // Fingerprint: type + tag + propName + change + file
      const file = normalizePathForHash(finding.file);
      fingerprint = `stencil-prop-change:${finding.tag}:${finding.propName}:${finding.change}:${file}`;
      break;
    }

    case "stencil-event-change": {
      // Fingerprint: type + tag + eventName + change + file
      const file = normalizePathForHash(finding.file);
      fingerprint = `stencil-event-change:${finding.tag}:${finding.eventName}:${finding.change}:${file}`;
      break;
    }

    case "stencil-method-change": {
      // Fingerprint: type + tag + methodName + change + file
      const file = normalizePathForHash(finding.file);
      fingerprint = `stencil-method-change:${finding.tag}:${finding.methodName}:${finding.change}:${file}`;
      break;
    }

    case "stencil-slot-change": {
      // Fingerprint: type + tag + slotName + change + file
      const file = normalizePathForHash(finding.file);
      fingerprint = `stencil-slot-change:${finding.tag}:${finding.slotName}:${finding.change}:${file}`;
      break;
    }

    case "risk-flag": {
      // Fingerprint: type + risk + evidenceText (legacy)
      // Note: risk-flag findings are being phased out in favor of derived flags
      fingerprint = `risk-flag:${finding.risk}:${finding.evidenceText}`;
      break;
    }

    case "graphql-change": {
      // Fingerprint: type + file + isBreaking + sorted(breakingChanges) + sorted(addedElements)
      const file = normalizePathForHash(finding.file);
      const breaking = sortForHash(finding.breakingChanges).join(",");
      const added = sortForHash(finding.addedElements).join(",");
      fingerprint = `graphql-change:${file}:${finding.isBreaking}:${breaking}:${added}`;
      break;
    }

    case "typescript-config": {
      // Fingerprint: type + file + isBreaking + sorted(changedOptions)
      const file = normalizePathForHash(finding.file);
      const added = sortForHash(finding.changedOptions.added).join(",");
      const removed = sortForHash(finding.changedOptions.removed).join(",");
      const modified = sortForHash(finding.changedOptions.modified).join(",");
      fingerprint = `typescript-config:${file}:${finding.isBreaking}:a=${added}:r=${removed}:m=${modified}`;
      break;
    }

    case "tailwind-config": {
      // Fingerprint: type + file + configType + isBreaking + sorted(affectedSections)
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      fingerprint = `tailwind-config:${file}:${finding.configType}:${finding.isBreaking}:${sections}`;
      break;
    }

    case "monorepo-config": {
      // Fingerprint: type + file + tool + sorted(affectedFields)
      const file = normalizePathForHash(finding.file);
      const fields = sortForHash(finding.affectedFields).join(",");
      fingerprint = `monorepo-config:${file}:${finding.tool}:${fields}`;
      break;
    }

    case "package-exports": {
      // Fingerprint: type + isBreaking + sorted(addedExports) + sorted(removedExports)
      const added = sortForHash(finding.addedExports).join(",");
      const removed = sortForHash(finding.removedExports).join(",");
      fingerprint = `package-exports:${finding.isBreaking}:a=${added}:r=${removed}`;
      break;
    }

    case "python-migration": {
      // Fingerprint: type + tool + risk + sorted(files)
      const files = sortForHash(finding.files.map(normalizePathForHash));
      fingerprint = `python-migration:${finding.tool}:${finding.risk}:${files.join(",")}`;
      break;
    }

    case "python-config": {
      // Fingerprint: type + file + configType + isBreaking + sorted(affectedSections)
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      fingerprint = `python-config:${file}:${finding.configType}:${finding.isBreaking}:${sections}`;
      break;
    }

    case "angular-component-change": {
      // Fingerprint: type + file + change + componentType + selector
      const file = normalizePathForHash(finding.file);
      fingerprint = `angular-component-change:${file}:${finding.change}:${finding.componentType}:${finding.selector || ""}`;
      break;
    }

    case "vite-config": {
      // Fingerprint: type + file + isBreaking + sorted(affectedSections) + sorted(plugins)
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      const plugins = sortForHash(finding.pluginsDetected).join(",");
      fingerprint = `vite-config:${file}:${finding.isBreaking}:${sections}:${plugins}`;
      break;
    }

    case "next-config-change": {
      // Fingerprint: type + file + status + sorted(detectedFeatures)
      const file = normalizePathForHash(finding.file);
      const features = sortForHash(finding.detectedFeatures).join(",");
      fingerprint = `next-config-change:${file}:${finding.status}:${features}`;
      break;
    }

    case "prisma-schema": {
      const file = normalizePathForHash(finding.file);
      const added = sortForHash(finding.addedModels).join(",");
      const removed = sortForHash(finding.removedModels).join(",");
      fingerprint = `prisma-schema:${file}:${finding.isBreaking}:${added}:${removed}`;
      break;
    }

    case "jest-config": {
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      fingerprint = `jest-config:${file}:${finding.isBreaking}:${sections}`;
      break;
    }

    case "linter-config": {
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      fingerprint = `linter-config:${file}:${finding.tool}:${finding.isBreaking}:${sections}`;
      break;
    }

    case "playwright-config": {
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      fingerprint = `playwright-config:${file}:${finding.isBreaking}:${sections}`;
      break;
    }

    case "docker-change": {
      const file = normalizePathForHash(finding.file);
      const images = sortForHash(finding.baseImageChanges).join(",");
      fingerprint = `docker-change:${file}:${finding.dockerfileType}:${finding.isBreaking}:${images}`;
      break;
    }

    case "turborepo-config": {
      const file = normalizePathForHash(finding.file);
      const sections = sortForHash(finding.affectedSections).join(",");
      fingerprint = `turborepo-config:${file}:${finding.isBreaking}:${sections}`;
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
