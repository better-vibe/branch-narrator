/**
 * Astro route and page change detector.
 *
 * Detects changes to Astro pages, API routes, and layouts.
 */

import { getAdditions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Evidence,
  Finding,
  RouteChangeFinding,
  RouteType,
} from "../core/types.js";

// Astro pages directory pattern
const ASTRO_PAGES_PATTERN = /^src\/pages\/(.+)\.(astro|md|mdx|html|ts|js)$/;

// Astro layouts pattern
const ASTRO_LAYOUTS_PATTERN = /^src\/layouts\/(.+)\.astro$/;

// Astro content collections pattern
const ASTRO_CONTENT_PATTERN = /^src\/content\/(.+)\.(md|mdx|json|yaml|yml)$/;

// Astro config pattern
const ASTRO_CONFIG_PATTERN = /^astro\.config\.(mjs|ts|js)$/;

/**
 * Check if file is an Astro page.
 */
export function isAstroPage(path: string): boolean {
  return ASTRO_PAGES_PATTERN.test(path);
}

/**
 * Check if file is an Astro API endpoint.
 */
export function isAstroEndpoint(path: string): boolean {
  return ASTRO_PAGES_PATTERN.test(path) && /\.(ts|js)$/.test(path);
}

/**
 * Check if file is an Astro layout.
 */
export function isAstroLayout(path: string): boolean {
  return ASTRO_LAYOUTS_PATTERN.test(path);
}

/**
 * Check if file is Astro content.
 */
export function isAstroContent(path: string): boolean {
  return ASTRO_CONTENT_PATTERN.test(path);
}

/**
 * Check if file is Astro config.
 */
export function isAstroConfig(path: string): boolean {
  return ASTRO_CONFIG_PATTERN.test(path);
}

/**
 * Convert Astro file path to route path.
 * Examples:
 * - src/pages/index.astro -> /
 * - src/pages/about.astro -> /about
 * - src/pages/blog/[slug].astro -> /blog/:slug
 * - src/pages/[...slug].astro -> /:slug*
 */
export function astroFileToRoute(filePath: string): string {
  const match = filePath.match(ASTRO_PAGES_PATTERN);
  if (!match) return filePath;

  let routePath = match[1];

  // Remove file extension
  routePath = routePath.replace(/\.(astro|md|mdx|html|ts|js)$/, "");

  // Convert to route path
  routePath = routePath
    // index -> /
    .replace(/\/index$/, "")
    .replace(/^index$/, "")
    // [...slug] -> :slug*
    .replace(/\[\.\.\.(\w+)\]/g, ":$1*")
    // [id] -> :id
    .replace(/\[(\w+)\]/g, ":$1");

  return "/" + routePath;
}

/**
 * Detect HTTP methods from Astro endpoint content.
 */
function detectAstroEndpointMethods(additions: string[]): string[] {
  const methods: string[] = [];
  const content = additions.join("\n");

  // Astro exports functions for each HTTP method
  const methodPatterns = [
    { pattern: /export\s+(const|function|async function)\s+GET\b/, method: "GET" },
    { pattern: /export\s+(const|function|async function)\s+POST\b/, method: "POST" },
    { pattern: /export\s+(const|function|async function)\s+PUT\b/, method: "PUT" },
    { pattern: /export\s+(const|function|async function)\s+DELETE\b/, method: "DELETE" },
    { pattern: /export\s+(const|function|async function)\s+PATCH\b/, method: "PATCH" },
    { pattern: /export\s+(const|function|async function)\s+ALL\b/, method: "*" },
  ];

  for (const { pattern, method } of methodPatterns) {
    if (pattern.test(content)) {
      methods.push(method);
    }
  }

  return methods;
}

/**
 * Determine route type from file path and content.
 */
function getRouteType(filePath: string): RouteType {
  if (isAstroLayout(filePath)) {
    return "layout";
  }
  if (isAstroEndpoint(filePath)) {
    return "endpoint";
  }
  if (filePath.includes("404.") || filePath.includes("500.")) {
    return "error";
  }
  return "page";
}

export const astroRoutesAnalyzer: Analyzer = {
  name: "astro-routes",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      const isPage = isAstroPage(file.path);
      const isLayout = isAstroLayout(file.path);
      const isContent = isAstroContent(file.path);
      const isConfig = isAstroConfig(file.path);

      if (!isPage && !isLayout && !isContent && !isConfig) {
        continue;
      }

      // Get evidence from diff
      const diff = changeSet.diffs.find((d) => d.path === file.path);
      const additions = diff ? getAdditions(diff) : [];
      const excerpt = extractRepresentativeExcerpt(additions);

      // For config files, just report the change
      if (isConfig) {
        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "medium",
          evidence: [createEvidence(file.path, excerpt || "Astro config changed")],
          routeId: "astro-config",
          file: file.path,
          change: file.status,
          routeType: "unknown",
        };
        findings.push(finding);
        continue;
      }

      // For content files, report as content change
      if (isContent) {
        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence: excerpt ? [createEvidence(file.path, excerpt)] : [],
          routeId: file.path.replace(/^src\/content\//, "/content/"),
          file: file.path,
          change: file.status,
          routeType: "page",
          tags: ["content-collection"],
        };
        findings.push(finding);
        continue;
      }

      // Get route details for pages and layouts
      const routeId = isPage ? astroFileToRoute(file.path) : file.path;
      const routeType = getRouteType(file.path);
      const endpointMethods = isAstroEndpoint(file.path)
        ? detectAstroEndpointMethods(additions)
        : [];
      const methods = endpointMethods.length > 0 ? endpointMethods : undefined;

      const evidence: Evidence[] = [];
      if (excerpt) {
        evidence.push(createEvidence(file.path, excerpt));
      }

      const finding: RouteChangeFinding = {
        type: "route-change",
        kind: "route-change",
        category: "routes",
        confidence: "high",
        evidence,
        routeId,
        file: file.path,
        change: file.status,
        routeType,
        methods,
      };

      findings.push(finding);
    }

    return findings;
  },
};
