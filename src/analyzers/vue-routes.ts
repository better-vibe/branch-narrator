/**
 * Vue.js and Nuxt route change detector.
 *
 * Detects changes to Vue Router and Nuxt file-based routes.
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

// Nuxt 3 pages directory pattern
const NUXT_PAGES_PATTERN = /^(pages|src\/pages)\/(.+)\.(vue|ts|tsx|js|jsx)$/;

// Nuxt 3 server routes pattern
const NUXT_SERVER_PATTERN = /^server\/(api|routes|middleware)\/(.+)\.(ts|js)$/;

// Nuxt layouts pattern
const NUXT_LAYOUTS_PATTERN = /^(layouts|src\/layouts)\/(.+)\.vue$/;

// Vue Router config patterns
const VUE_ROUTER_PATTERNS = [
  /router\.(ts|js)$/,
  /routes\.(ts|js)$/,
  /router\/index\.(ts|js)$/,
];

/**
 * Check if file is a Nuxt page route.
 */
export function isNuxtPage(path: string): boolean {
  return NUXT_PAGES_PATTERN.test(path);
}

/**
 * Check if file is a Nuxt server route.
 */
export function isNuxtServerRoute(path: string): boolean {
  return NUXT_SERVER_PATTERN.test(path);
}

/**
 * Check if file is a Nuxt layout.
 */
export function isNuxtLayout(path: string): boolean {
  return NUXT_LAYOUTS_PATTERN.test(path);
}

/**
 * Check if file is Vue Router configuration.
 */
export function isVueRouterConfig(path: string): boolean {
  return VUE_ROUTER_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Convert Nuxt file path to route path.
 * Examples:
 * - pages/index.vue -> /
 * - pages/about.vue -> /about
 * - pages/users/[id].vue -> /users/:id
 * - pages/[...slug].vue -> /:slug*
 */
export function nuxtFileToRoute(filePath: string): string {
  const match = filePath.match(NUXT_PAGES_PATTERN);
  if (!match) return filePath;

  let routePath = match[2];

  // Remove file extension part if it's like .get, .post, etc.
  routePath = routePath.replace(/\.(get|post|put|delete|patch)$/i, "");

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
 * Detect HTTP method from Nuxt server route filename.
 */
function detectNuxtServerMethod(filePath: string): string[] {
  const methods: string[] = [];

  // Method can be in filename: route.get.ts, route.post.ts
  const methodMatch = filePath.match(/\.(\w+)\.(ts|js)$/);
  if (methodMatch) {
    const method = methodMatch[1].toUpperCase();
    if (["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(method)) {
      methods.push(method);
    }
  }

  // Default to all methods if no specific method detected
  if (methods.length === 0) {
    methods.push("*");
  }

  return methods;
}

/**
 * Determine route type from file path.
 */
function getRouteType(filePath: string): RouteType {
  if (isNuxtServerRoute(filePath)) {
    return "endpoint";
  }
  if (isNuxtLayout(filePath)) {
    return "layout";
  }
  if (filePath.includes("error.vue") || filePath.includes("[...")) {
    return "error";
  }
  return "page";
}

export const vueRoutesAnalyzer: Analyzer = {
  name: "vue-routes",

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      const isPage = isNuxtPage(file.path);
      const isServer = isNuxtServerRoute(file.path);
      const isLayout = isNuxtLayout(file.path);
      const isRouterConfig = isVueRouterConfig(file.path);

      if (!isPage && !isServer && !isLayout && !isRouterConfig) {
        continue;
      }

      // For router config files, just report the change
      if (isRouterConfig) {
        const diff = changeSet.diffs.find((d) => d.path === file.path);
        const additions = diff ? getAdditions(diff) : [];
        const excerpt = extractRepresentativeExcerpt(additions);

        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "medium",
          evidence: [createEvidence(file.path, excerpt || "Vue Router config changed")],
          routeId: "vue-router-config",
          file: file.path,
          change: file.status,
          routeType: "unknown",
        };
        findings.push(finding);
        continue;
      }

      // Get route details
      const routeId = isPage ? nuxtFileToRoute(file.path) : file.path;
      const routeType = getRouteType(file.path);
      const methods = isServer ? detectNuxtServerMethod(file.path) : undefined;

      // Get evidence from diff
      const diff = changeSet.diffs.find((d) => d.path === file.path);
      const additions = diff ? getAdditions(diff) : [];
      const excerpt = extractRepresentativeExcerpt(additions);

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
