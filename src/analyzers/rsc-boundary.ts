/**
 * Next.js React Server Components (RSC) boundary change detector.
 *
 * Detects changes to "use client" and "use server" directives in Next.js App Router,
 * identifying when components switch between server and client contexts.
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  RSCBoundaryFinding,
  Confidence,
} from "../core/types.js";

// RSC file patterns for Next.js App Router
const RSC_FILE_PATTERNS = [
  /(?:^|[\/\\])app[\/\\].*\.(ts|tsx|js|jsx)$/,
  /\.server\.(ts|tsx|js|jsx)$/,
  /\.client\.(ts|tsx|js|jsx)$/,
];

// Directives to detect
const SERVER_DIRECTIVE = "use server";
const CLIENT_DIRECTIVE = "use client";

/**
 * Check if a file is an RSC-related file in Next.js App Router.
 */
export function isRSCFile(path: string): boolean {
  return RSC_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if the project uses Next.js based on package.json dependencies.
 */
function hasNextDependency(changeSet: ChangeSet): boolean {
  const pkg = changeSet.headPackageJson;
  if (!pkg) return false;
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  return Boolean(deps?.["next"] || devDeps?.["next"]);
}

/**
 * Extract directives from file content.
 */
function extractDirectives(content: string[]): {
  serverDirective: boolean;
  clientDirective: boolean;
  serverOnlyImport: boolean;
  clientOnlyImport: boolean;
  isAsyncComponent: boolean;
} {
  const fullContent = content.join("\n");

  // Check for directives (must be at the top of the file)
  const serverDirective = fullContent.includes(`"${SERVER_DIRECTIVE}"`) || fullContent.includes(`'${SERVER_DIRECTIVE}'`);
  const clientDirective = fullContent.includes(`"${CLIENT_DIRECTIVE}"`) || fullContent.includes(`'${CLIENT_DIRECTIVE}'`);

  // Check for server-only and client-only imports
  const serverOnlyImport = /(?:import\s+|from\s+)["']server-only["']/.test(fullContent);
  const clientOnlyImport = /(?:import\s+|from\s+)["']client-only["']/.test(fullContent);

  // Check for async component (indicates server component in Next.js)
  const isAsyncComponent = /export\s+(?:default\s+)?async\s+(?:function\s+\w+|const|let|var)\s*=/
    .test(fullContent) ||
    /async\s+function\s+\w+\s*\([^)]*\)\s*\{/.test(fullContent);

  return {
    serverDirective,
    clientDirective,
    serverOnlyImport,
    clientOnlyImport,
    isAsyncComponent,
  };
}

/**
 * Determine boundary type from directives and imports.
 */
function determineBoundaryType(
  directives: ReturnType<typeof extractDirectives>
): "server" | "client" | "unknown" {
  if (directives.serverDirective || directives.serverOnlyImport) {
    return "server";
  }
  if (directives.clientDirective || directives.clientOnlyImport) {
    return "client";
  }
  // Async components without directives are server components in Next.js App Router
  if (directives.isAsyncComponent) {
    return "server";
  }
  return "unknown";
}

/**
 * Detect breaking changes in directive changes.
 */
function detectBreakingChanges(
  baseDirectives: ReturnType<typeof extractDirectives>,
  headDirectives: ReturnType<typeof extractDirectives>,
  deletions: string[]
): string[] {
  const breakingChanges: string[] = [];
  const deletedContent = deletions.join("\n");

  // Removing "use client" from a component with browser APIs is breaking
  if (baseDirectives.clientDirective && !headDirectives.clientDirective) {
    // Check if component uses browser-only APIs
    const browserApis = [
      "window.",
      "document.",
      "localStorage",
      "sessionStorage",
      "navigator",
      "location",
      "addEventListener",
      "fetch(",
      "alert(",
      "confirm(",
      "prompt(",
    ];
    for (const api of browserApis) {
      if (deletedContent.includes(api)) {
        breakingChanges.push(`Removed "use client" from component using ${api}`);
        break;
      }
    }
    if (breakingChanges.length === 0) {
      breakingChanges.push('Removed "use client" directive');
    }
  }

  // Removing "use server" is breaking if it was marking server actions
  if (baseDirectives.serverDirective && !headDirectives.serverDirective) {
    breakingChanges.push('Removed "use server" directive');
  }

  // Adding server-only import to a client component is breaking
  if (!baseDirectives.serverOnlyImport && headDirectives.serverOnlyImport) {
    breakingChanges.push("Added server-only import (restricts to server context)");
  }

  // Removing client-only import might be breaking
  if (baseDirectives.clientOnlyImport && !headDirectives.clientOnlyImport) {
    breakingChanges.push("Removed client-only import");
  }

  return breakingChanges;
}

/**
 * Check if a file is inside the app directory.
 */
function isAppRouterFile(path: string): boolean {
  return /(?:^|[\/\\])app[\/\\]/.test(path);
}

export const rscBoundaryAnalyzer: Analyzer = {
  name: "rsc-boundary",
  cache: {
    includeGlobs: [
      "**/app/**/*.{ts,tsx,js,jsx}",
      "**/*.server.{ts,tsx,js,jsx}",
      "**/*.client.{ts,tsx,js,jsx}",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    // Skip if project doesn't use Next.js
    if (!hasNextDependency(changeSet)) {
      return [];
    }

    const findings: Finding[] = [];

    for (const diff of changeSet.diffs) {
      // Check if this is an RSC file
      if (!isRSCFile(diff.path)) {
        continue;
      }

      // Skip if not in App Router (Pages Router doesn't use RSC boundaries)
      if (!isAppRouterFile(diff.path) && !diff.path.includes(".server.") && !diff.path.includes(".client.")) {
        continue;
      }

      const additions = getAdditions(diff);
      const deletions = getDeletions(diff);

      // Extract directives from base and head
      const headDirectives = extractDirectives(additions);
      const baseDirectives = extractDirectives(deletions);

      // Determine boundary types
      const headBoundary = determineBoundaryType(headDirectives);
      const baseBoundary = determineBoundaryType(baseDirectives);

      // If no directives detected and no boundary change, skip
      const hasDirectives =
        headDirectives.serverDirective ||
        headDirectives.clientDirective ||
        baseDirectives.serverDirective ||
        baseDirectives.clientDirective ||
        headDirectives.serverOnlyImport ||
        headDirectives.clientOnlyImport ||
        baseDirectives.serverOnlyImport ||
        baseDirectives.clientOnlyImport;

      if (!hasDirectives && headBoundary === baseBoundary) {
        continue;
      }

      // Build directive change info
      const directiveChange: RSCBoundaryFinding["directiveChange"] = {
        from: baseDirectives.serverDirective
          ? "use server"
          : baseDirectives.clientDirective
          ? "use client"
          : null,
        to: headDirectives.serverDirective
          ? "use server"
          : headDirectives.clientDirective
          ? "use client"
          : null,
      };

      // Detect breaking changes
      const breakingChanges = detectBreakingChanges(
        baseDirectives,
        headDirectives,
        deletions
      );
      const isBreaking = breakingChanges.length > 0;

      // Determine final boundary type
      const boundaryType = headBoundary !== "unknown" ? headBoundary : baseBoundary;

      // Determine confidence
      let confidence: Confidence = "medium";
      if (isBreaking) {
        confidence = "high";
      } else if (directiveChange.from !== null && directiveChange.to !== null && directiveChange.from !== directiveChange.to) {
        // High confidence when changing from one directive to another (not just adding)
        confidence = "high";
      } else if (headBoundary === "unknown" && baseBoundary === "unknown") {
        confidence = "low";
      }

      // Build evidence
      const excerpt = extractRepresentativeExcerpt(
        additions.length > 0 ? additions : deletions
      );
      const evidence = [createEvidence(diff.path, excerpt)];

      // Add directive change evidence
      if (directiveChange.from !== directiveChange.to) {
        const fromText = directiveChange.from || "none";
        const toText = directiveChange.to || "none";
        evidence.push(createEvidence(diff.path, `Directive: ${fromText} → ${toText}`));
      }

      // Add breaking change evidence
      for (const change of breakingChanges) {
        evidence.push(createEvidence(diff.path, `Breaking: ${change}`));
      }

      // Add boundary type evidence
      if (boundaryType !== "unknown") {
        evidence.push(createEvidence(diff.path, `Component type: ${boundaryType}`));
      }

      const finding: RSCBoundaryFinding = {
        type: "rsc-boundary",
        kind: "rsc-boundary",
        category: "routes",
        confidence,
        evidence,
        file: diff.path,
        status: diff.status,
        boundaryType,
        directiveChange,
        imports: {
          serverOnly: headDirectives.serverOnlyImport,
          clientOnly: headDirectives.clientOnlyImport,
        },
        isBreaking,
        breakingReasons: breakingChanges,
        tags: isBreaking ? ["breaking"] : undefined,
      };

      findings.push(finding);
    }

    return findings;
  },
};
