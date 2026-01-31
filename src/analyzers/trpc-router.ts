/**
 * tRPC v11 router change detector.
 *
 * Detects changes to tRPC routers and procedures, identifying breaking API
 * contract changes in type-safe backends. Supports tRPC v11 syntax.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  TRPCRouterFinding,
  Confidence,
} from "../core/types.js";

// tRPC router file patterns
const TRPC_ROUTER_PATTERNS = [
  /[\/\\]routers[\/\\].+\.(ts|js)$/,
  /[\/\\]api[\/\\]trpc[\/\\].+\.(ts|js)$/,
  /[\/\\]server[\/\\]trpc[\/\\].+\.(ts|js)$/,
  /[\/\\]trpc[\/\\].+\.(ts|js)$/,
  /_app\.(ts|js)$/,  // tRPC root router
];

/**
 * Check if a file is a tRPC router file.
 */
export function isTRPCRouterFile(path: string): boolean {
  return TRPC_ROUTER_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if the project uses tRPC based on package.json dependencies.
 */
function hasTRPCDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(
    deps?.["@trpc/server"] ||
    devDeps?.["@trpc/server"] ||
    deps?.["@trpc/client"] ||
    devDeps?.["@trpc/client"]
  );
}

/**
 * Extract router name from file content or path.
 */
function extractRouterName(path: string, content: string): string {
  // Try to find router name from export
  const exportMatch = content.match(/export\s+(?:const|let|var)\s+(\w+)Router/);
  if (exportMatch && exportMatch[1]) {
    return `${exportMatch[1]}Router`;
  }

  // Fallback to file name
  const fileName = path.split(/[\/\\]/).pop() || "router";
  return fileName.replace(/\.(ts|js)$/, "");
}

/**
 * Detect procedures in router content using v11 syntax.
 * v11 syntax: router({ procedure: publicProcedure.query(...), ... })
 * 
 * Handles both single-line and multiline procedure definitions with chained methods.
 */
export function detectProcedures(content: string): Array<{
  name: string;
  type: "query" | "mutation" | "subscription";
}> {
  const procedures: Array<{
    name: string;
    type: "query" | "mutation" | "subscription";
  }> = [];

  // Match procedure definitions with chained methods (multiline support)
  // Captures: procedureName followed by colon, then any chars (including newlines),
  // until it reaches .query( or .mutation( or .subscription(
  // The (?s) flag makes . match newlines
  const multilineRegex = /(\w+)\s*:\s*\w*Procedure[\s\S]*?\.(query|mutation|subscription)\s*\(/g;

  let match;
  while ((match = multilineRegex.exec(content)) !== null) {
    const name = match[1];
    const type = match[2] as "query" | "mutation" | "subscription";
    // Avoid duplicates
    if (!procedures.some((p) => p.name === name && p.type === type)) {
      procedures.push({ name, type });
    }
  }

  return procedures;
}

/**
 * Detect breaking changes in procedure modifications.
 */
function detectBreakingChanges(
  baseProcedures: Array<{ name: string; type: string }>,
  headProcedures: Array<{ name: string; type: string }>,
  deletions: string[]
): string[] {
  const breakingChanges: string[] = [];
  const deletedContent = deletions.join("\n");

  // Check for removed procedures
  for (const baseProc of baseProcedures) {
    const stillExists = headProcedures.some(
      (p) => p.name === baseProc.name && p.type === baseProc.type
    );
    if (!stillExists) {
      breakingChanges.push(`Removed ${baseProc.type}: ${baseProc.name}`);
    }
  }

  // Check for input schema changes (indicated by .input() calls in deletions)
  if (/\.input\s*\(/.test(deletedContent)) {
    breakingChanges.push("Input schema modified");
  }

  // Check for output schema changes (indicated by .output() calls)
  if (/\.output\s*\(/.test(deletedContent)) {
    breakingChanges.push("Output schema modified");
  }

  // Check for middleware changes
  if (/\.use\s*\(/.test(deletedContent)) {
    breakingChanges.push("Middleware chain modified");
  }

  return breakingChanges;
}

export const trpcRouterAnalyzer: Analyzer = {
  name: "trpc-router",
  cache: {
    includeGlobs: [
      "**/routers/**/*.{ts,js}",
      "**/api/trpc/**/*.{ts,js}",
      "**/server/trpc/**/*.{ts,js}",
      "**/trpc/**/*.{ts,js}",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use tRPC
    if (!hasTRPCDependency(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      // Check if this is a tRPC router file
      if (!isTRPCRouterFile(diff.path)) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      // Extract procedures from base and head
      const addedContent = additions.join("\n");
      const deletedContent = deletions.join("\n");

      const headProcedures = detectProcedures(addedContent);
      const baseProcedures = detectProcedures(deletedContent);

      // If no procedures detected, this might not be a router file
      if (headProcedures.length === 0 && baseProcedures.length === 0) {
        continue;
      }

      // Build procedure changes
      const procedureChanges: TRPCRouterFinding["procedureChanges"] = [];

      // Added procedures
      for (const proc of headProcedures) {
        const existedBefore = baseProcedures.some(
          (p) => p.name === proc.name && p.type === proc.type
        );
        if (!existedBefore) {
          procedureChanges.push({
            name: proc.name,
            type: proc.type,
            operation: "added",
            isBreaking: false,
          });
        }
      }

      // Removed procedures
      for (const proc of baseProcedures) {
        const stillExists = headProcedures.some(
          (p) => p.name === proc.name && p.type === proc.type
        );
        if (!stillExists) {
          procedureChanges.push({
            name: proc.name,
            type: proc.type,
            operation: "removed",
            isBreaking: true,
            reason: "Procedure removed from API",
          });
        }
      }

      // Modified procedures (exist in both but content changed)
      for (const headProc of headProcedures) {
        const baseProc = baseProcedures.find(
          (p) => p.name === headProc.name && p.type === headProc.type
        );
        if (baseProc) {
          // Check for breaking changes in modifications
          const breakingReasons = detectBreakingChanges(
            [baseProc],
            [headProc],
            deletions
          );
          const isBreaking = breakingReasons.length > 0;

          procedureChanges.push({
            name: headProc.name,
            type: headProc.type,
            operation: "modified",
            isBreaking,
            reason: isBreaking ? breakingReasons.join(", ") : undefined,
          });
        }
      }

      // If no changes detected, skip
      if (procedureChanges.length === 0) {
        continue;
      }

      // Determine router name
      const routerName = extractRouterName(diff.path, addedContent);

      // Check for overall breaking changes
      const breakingChanges = detectBreakingChanges(
        baseProcedures,
        headProcedures,
        deletions
      );
      const isBreaking =
        breakingChanges.length > 0 ||
        procedureChanges.some((p) => p.isBreaking);

      // Determine confidence
      let confidence: Confidence = "medium";
      if (isBreaking) {
        confidence = "high";
      } else if (procedureChanges.every((p) => p.operation === "added")) {
        confidence = "low";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add procedure change evidence
      for (const change of procedureChanges.filter((c) => c.isBreaking)) {
        evidence.push(
          createEvidence(diff.path, `Breaking change: ${change.name} (${change.type})`)
        );
      }

      const finding: TRPCRouterFinding = {
        type: "trpc-router",
        kind: "trpc-router",
        category: "api",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        routerName,
        procedureChanges,
        isBreaking,
        tags: isBreaking ? ["breaking"] : undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
