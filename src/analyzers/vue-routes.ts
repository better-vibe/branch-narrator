/**
 * Vue.js and Nuxt route change detector.
 *
 * Detects changes to Vue Router configuration and Nuxt file-based routes.
 *
 * Detection capabilities:
 * - Nuxt 3 file-based pages (pages/**) with dynamic segments and catch-all
 * - Nuxt 3 server routes (server/api/**, server/routes/**, server/middleware/**)
 * - Nuxt 3 layouts (layouts/**)
 * - Nuxt 3 middleware (middleware/**)
 * - Nuxt 3 error page (error.vue)
 * - Nuxt 3 app-level files (app.vue, app.config.ts)
 * - Vue Router config files (router.ts, routes.ts, router/index.ts)
 * - Route feature detection: definePageMeta, navigation guards, lazy loading, middleware
 * - Vue Router config parsing: extracting routes from createRouter() / route arrays
 */

import { getAdditions, getDeletions } from "../git/parser.js";
import { createEvidence, extractRepresentativeExcerpt } from "../core/evidence.js";
import type {
  Analyzer,
  ChangeSet,
  Evidence,
  FileDiff,
  Finding,
  RouteChangeFinding,
  RouteType,
} from "../core/types.js";

// ============================================================================
// File Pattern Detection
// ============================================================================

// Nuxt 3 pages directory pattern
const NUXT_PAGES_PATTERN = /^(pages|src\/pages)\/(.+)\.(vue|ts|tsx|js|jsx)$/;

// Nuxt 3 server routes pattern
const NUXT_SERVER_PATTERN = /^server\/(api|routes|middleware)\/(.+)\.(ts|js)$/;

// Nuxt layouts pattern
const NUXT_LAYOUTS_PATTERN = /^(layouts|src\/layouts)\/(.+)\.vue$/;

// Nuxt middleware pattern (app-level, not server)
const NUXT_MIDDLEWARE_PATTERN = /^(middleware|src\/middleware)\/(.+)\.(ts|js)$/;

// Nuxt error page pattern
const NUXT_ERROR_PATTERN = /^(src\/)?error\.vue$/;

// Nuxt app-level files
const NUXT_APP_PATTERN = /^(src\/)?app\.vue$/;
const NUXT_APP_CONFIG_PATTERN = /^(src\/)?app\.config\.(ts|js)$/;

// Vue Router config patterns
const VUE_ROUTER_PATTERNS = [
  /router\.(ts|js)$/,
  /routes\.(ts|js)$/,
  /router\/index\.(ts|js)$/,
  /router\/routes\.(ts|js)$/,
];

// ============================================================================
// File Detection Functions
// ============================================================================

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
 * Check if file is a Nuxt app-level middleware.
 */
export function isNuxtMiddleware(path: string): boolean {
  return NUXT_MIDDLEWARE_PATTERN.test(path);
}

/**
 * Check if file is a Nuxt error page.
 */
export function isNuxtErrorPage(path: string): boolean {
  return NUXT_ERROR_PATTERN.test(path);
}

/**
 * Check if file is Vue Router configuration.
 */
export function isVueRouterConfig(path: string): boolean {
  return VUE_ROUTER_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Check if file is an app-level Nuxt file (app.vue or app.config.ts).
 */
export function isNuxtAppFile(path: string): boolean {
  return NUXT_APP_PATTERN.test(path) || NUXT_APP_CONFIG_PATTERN.test(path);
}

// ============================================================================
// Route Path Conversion
// ============================================================================

/**
 * Convert Nuxt file path to route path.
 * Examples:
 * - pages/index.vue -> /
 * - pages/about.vue -> /about
 * - pages/users/[id].vue -> /users/:id
 * - pages/[...slug].vue -> /:slug*
 * - pages/users/[[id]].vue -> /users/:id?
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
    // [[id]] -> :id? (optional param)
    .replace(/\[\[(\w+)\]\]/g, ":$1?")
    // [...slug] -> :slug*
    .replace(/\[\.\.\.(\w+)\]/g, ":$1*")
    // [id] -> :id
    .replace(/\[(\w+)\]/g, ":$1");

  return "/" + routePath;
}

/**
 * Convert Nuxt server route file path to API path.
 */
export function nuxtServerFileToRoute(filePath: string): string {
  const match = filePath.match(NUXT_SERVER_PATTERN);
  if (!match) return filePath;

  const prefix = match[1]; // api, routes, or middleware
  let routePath = match[2];

  // Remove HTTP method suffix
  routePath = routePath.replace(/\.(get|post|put|delete|patch|head|options)$/i, "");

  // Convert dynamic segments
  routePath = routePath
    .replace(/\/index$/, "")
    .replace(/^index$/, "")
    .replace(/\[\.\.\.(\w+)\]/g, ":$1*")
    .replace(/\[(\w+)\]/g, ":$1");

  if (prefix === "api") {
    return `/api/${routePath}`;
  }
  return `/${routePath}`;
}

// ============================================================================
// HTTP Method Detection
// ============================================================================

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

// ============================================================================
// Route Type Detection
// ============================================================================

/**
 * Determine route type from file path.
 */
function getRouteType(filePath: string): RouteType {
  if (isNuxtServerRoute(filePath)) {
    // Server middleware is a special endpoint type
    if (filePath.match(/^server\/middleware\//)) {
      return "endpoint";
    }
    return "endpoint";
  }
  if (isNuxtLayout(filePath)) {
    const layoutMatch = filePath.match(NUXT_LAYOUTS_PATTERN);
    if (layoutMatch && layoutMatch[2] === "default") {
      return "default";
    }
    return "layout";
  }
  if (isNuxtErrorPage(filePath)) {
    return "error";
  }
  if (isNuxtMiddleware(filePath)) {
    return "metadata";
  }
  if (
    filePath.includes("error.vue") ||
    filePath.includes("404.vue") ||
    filePath.includes("500.vue")
  ) {
    return "error";
  }
  return "page";
}

// ============================================================================
// Tag Extraction from Diff Content
// ============================================================================

/** Keywords for Vue Router features in diff content */
const ROUTE_FEATURE_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /definePageMeta\s*\(/, tag: "has-page-meta" },
  { pattern: /defineRouteRules\s*\(/, tag: "has-route-rules" },
  { pattern: /useRoute\s*\(/, tag: "uses-route" },
  { pattern: /useRouter\s*\(/, tag: "uses-router" },
  { pattern: /navigateTo\s*\(/, tag: "has-navigation" },
  { pattern: /defineNuxtRouteMiddleware\s*\(/, tag: "route-middleware" },
  { pattern: /middleware\s*:/, tag: "has-middleware" },
  { pattern: /validate\s*\(/, tag: "has-validation" },
  { pattern: /useLazyAsyncData\s*\(/, tag: "lazy-data" },
  { pattern: /useLazyFetch\s*\(/, tag: "lazy-data" },
  { pattern: /useAsyncData\s*\(/, tag: "has-async-data" },
  { pattern: /useFetch\s*\(/, tag: "has-fetch" },
  { pattern: /defineEventHandler\s*\(/, tag: "event-handler" },
  { pattern: /defineCachedEventHandler\s*\(/, tag: "cached-handler" },
  { pattern: /defineWebSocketHandler\s*\(/, tag: "websocket-handler" },
  { pattern: /getValidatedQuery\s*\(/, tag: "validated-input" },
  { pattern: /readValidatedBody\s*\(/, tag: "validated-input" },
  { pattern: /getRouterParams?\s*\(/, tag: "reads-params" },
  { pattern: /setResponseStatus\s*\(/, tag: "sets-status" },
  { pattern: /sendRedirect\s*\(/, tag: "has-redirect" },
];

/** Vue Router config feature patterns */
const ROUTER_CONFIG_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  { pattern: /createRouter\s*\(/, tag: "creates-router" },
  { pattern: /createWebHistory\s*\(/, tag: "history-mode" },
  { pattern: /createWebHashHistory\s*\(/, tag: "hash-mode" },
  { pattern: /createMemoryHistory\s*\(/, tag: "memory-mode" },
  { pattern: /beforeEach\s*\(/, tag: "global-guard" },
  { pattern: /beforeResolve\s*\(/, tag: "global-guard" },
  { pattern: /afterEach\s*\(/, tag: "global-hook" },
  { pattern: /beforeEnter\s*:/, tag: "route-guard" },
  { pattern: /scrollBehavior\s*[:(]/, tag: "scroll-behavior" },
  { pattern: /component\s*:\s*\(\)\s*=>\s*import\s*\(/, tag: "lazy-loading" },
  { pattern: /defineAsyncComponent\s*\(/, tag: "lazy-loading" },
  { pattern: /meta\s*:/, tag: "has-meta" },
  { pattern: /children\s*:/, tag: "nested-routes" },
  { pattern: /redirect\s*:/, tag: "has-redirect" },
  { pattern: /alias\s*:/, tag: "has-alias" },
  { pattern: /props\s*:\s*true/, tag: "props-as-route-params" },
  { pattern: /sensitive\s*:\s*true/, tag: "case-sensitive" },
  { pattern: /strict\s*:\s*true/, tag: "strict-mode" },
];

/**
 * Extract feature tags from diff additions.
 */
function extractTags(additions: string[], patterns: Array<{ pattern: RegExp; tag: string }>): string[] {
  const tags = new Set<string>();
  const combined = additions.join("\n");

  for (const { pattern, tag } of patterns) {
    if (pattern.test(combined)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

// ============================================================================
// Vue Router Config Parsing
// ============================================================================


interface ExtractedConfigRoute {
  path: string;
  name?: string;
  tags: string[];
  routeType: RouteType;
}

/**
 * Extract route definitions from Vue Router config diff content.
 * Parses path: '...' patterns from additions and deletions.
 */
export function extractRoutesFromDiff(
  additions: string[],
  deletions: string[]
): { added: ExtractedConfigRoute[]; removed: ExtractedConfigRoute[] } {
  const added: ExtractedConfigRoute[] = [];
  const removed: ExtractedConfigRoute[] = [];

  // Extract from additions
  const addedRoutes = extractRoutePathsFromLines(additions);
  added.push(...addedRoutes);

  // Extract from deletions
  const removedRoutes = extractRoutePathsFromLines(deletions);
  removed.push(...removedRoutes);

  return { added, removed };
}

/**
 * Extract route paths from lines of code.
 */
function extractRoutePathsFromLines(lines: string[]): ExtractedConfigRoute[] {
  const routes: ExtractedConfigRoute[] = [];
  const combined = lines.join("\n");
  const seen = new Set<string>();

  // Find all path definitions
  let match: RegExpExecArray | null;
  const pathRegex = /path\s*:\s*['"`]([^'"`]+)['"`]/g;
  while ((match = pathRegex.exec(combined)) !== null) {
    const path = match[1];
    if (seen.has(path)) continue;
    seen.add(path);

    // Determine surrounding context for tags
    const contextStart = Math.max(0, match.index - 200);
    const contextEnd = Math.min(combined.length, match.index + 200);
    const context = combined.substring(contextStart, contextEnd);

    const tags: string[] = [];
    let routeType: RouteType = "page";

    if (/children\s*:/.test(context)) {
      routeType = "layout";
      tags.push("nested-routes");
    }
    if (/redirect\s*:/.test(context)) {
      tags.push("has-redirect");
    }
    if (/beforeEnter\s*:/.test(context)) {
      tags.push("route-guard");
    }
    if (/meta\s*:/.test(context)) {
      tags.push("has-meta");
    }
    if (/component\s*:\s*\(\)\s*=>\s*import\s*\(/.test(context)) {
      tags.push("lazy-loading");
    }
    if (/alias\s*:/.test(context)) {
      tags.push("has-alias");
    }
    if (path === "*" || path === "/:pathMatch(.*)*" || path.includes("/:catchAll")) {
      routeType = "error";
      tags.push("catch-all");
    }

    // Find name if nearby
    const nameRegex = /name\s*:\s*['"`]([^'"`]+)['"`]/;
    const nameMatch = context.match(nameRegex);

    routes.push({
      path,
      name: nameMatch?.[1],
      tags,
      routeType,
    });
  }

  return routes;
}

// ============================================================================
// Analyzer
// ============================================================================

export const vueRoutesAnalyzer: Analyzer = {
  name: "vue-routes",
  cache: {
    includeGlobs: [
      "**/pages/**",
      "**/src/pages/**",
      "**/server/**",
      "**/layouts/**",
      "**/src/layouts/**",
      "**/middleware/**",
      "**/src/middleware/**",
      "**/router.*",
      "**/routes.*",
      "**/router/index.*",
      "**/router/routes.*",
      "**/error.vue",
      "**/src/error.vue",
      "**/app.vue",
      "**/src/app.vue",
      "**/app.config.*",
      "**/src/app.config.*",
    ],
  },

  analyze(changeSet: ChangeSet): Finding[] {
    const findings: Finding[] = [];

    for (const file of changeSet.files) {
      const isPage = isNuxtPage(file.path);
      const isServer = isNuxtServerRoute(file.path);
      const isLayout = isNuxtLayout(file.path);
      const isMiddleware = isNuxtMiddleware(file.path);
      const isError = isNuxtErrorPage(file.path);
      const isRouterConfig = isVueRouterConfig(file.path);
      const isApp = isNuxtAppFile(file.path);

      if (!isPage && !isServer && !isLayout && !isMiddleware && !isError && !isRouterConfig && !isApp) {
        continue;
      }

      const diff = changeSet.diffs.find((d) => d.path === file.path);
      const additions = diff ? getAdditions(diff) : [];
      const deletions = diff ? getDeletions(diff) : [];

      // Vue Router config files: extract individual routes from config
      if (isRouterConfig) {
        const configFindings = analyzeRouterConfig(file.path, file.status, diff, additions, deletions);
        findings.push(...configFindings);
        continue;
      }

      // Nuxt app-level files
      if (isApp) {
        const excerpt = extractRepresentativeExcerpt(additions);
        const tags = extractTags(additions, ROUTE_FEATURE_PATTERNS);

        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "medium",
          evidence: [createEvidence(file.path, excerpt || "Nuxt app-level file changed")],
          routeId: file.path.replace(/^src\//, ""),
          file: file.path,
          change: file.status,
          routeType: "template",
        };
        if (tags.length > 0) finding.tags = tags;
        findings.push(finding);
        continue;
      }

      // Nuxt middleware files
      if (isMiddleware) {
        const middlewareMatch = file.path.match(NUXT_MIDDLEWARE_PATTERN);
        const middlewareName = middlewareMatch ? middlewareMatch[2] : file.path;
        const excerpt = extractRepresentativeExcerpt(additions);
        const tags = extractTags(additions, ROUTE_FEATURE_PATTERNS);

        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence: excerpt ? [createEvidence(file.path, excerpt)] : [],
          routeId: `middleware:${middlewareName}`,
          file: file.path,
          change: file.status,
          routeType: "metadata",
        };
        if (tags.length > 0) finding.tags = tags;
        findings.push(finding);
        continue;
      }

      // Nuxt error page
      if (isError) {
        const excerpt = extractRepresentativeExcerpt(additions);
        const tags = extractTags(additions, ROUTE_FEATURE_PATTERNS);

        const finding: RouteChangeFinding = {
          type: "route-change",
          kind: "route-change",
          category: "routes",
          confidence: "high",
          evidence: excerpt ? [createEvidence(file.path, excerpt)] : [],
          routeId: "error",
          file: file.path,
          change: file.status,
          routeType: "error",
        };
        if (tags.length > 0) finding.tags = tags;
        findings.push(finding);
        continue;
      }

      // Get route details for pages, server routes, layouts
      const routeId = isPage
        ? nuxtFileToRoute(file.path)
        : isServer
          ? nuxtServerFileToRoute(file.path)
          : file.path;
      const routeType = getRouteType(file.path);
      const methods = isServer ? detectNuxtServerMethod(file.path) : undefined;

      // Extract feature tags from diff content
      const featurePatterns = isServer
        ? ROUTE_FEATURE_PATTERNS
        : ROUTE_FEATURE_PATTERNS;
      const tags = extractTags(additions, featurePatterns);

      // Get evidence from diff
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
      if (tags.length > 0) finding.tags = tags;

      findings.push(finding);
    }

    // Deduplicate by routeId + change + file
    const uniqueFindings = Array.from(
      new Map(
        findings.map((f) => {
          const rf = f as RouteChangeFinding;
          const key = `${rf.routeId}-${rf.change}-${rf.file}`;
          return [key, f];
        })
      ).values()
    );

    // Sort by routeId for deterministic output
    return uniqueFindings.sort((a, b) => {
      const aRoute = (a as RouteChangeFinding).routeId;
      const bRoute = (b as RouteChangeFinding).routeId;
      return aRoute.localeCompare(bRoute);
    });
  },
};

// ============================================================================
// Vue Router Config Analysis
// ============================================================================

/**
 * Analyze Vue Router config file to extract individual route findings.
 */
function analyzeRouterConfig(
  filePath: string,
  status: RouteChangeFinding["change"],
  _diff: FileDiff | undefined,
  additions: string[],
  deletions: string[],
): Finding[] {
  const findings: Finding[] = [];

  // Extract global router config tags
  const configTags = extractTags(additions, ROUTER_CONFIG_PATTERNS);

  // Try to extract individual routes from diff
  const { added, removed } = extractRoutesFromDiff(additions, deletions);

  // Emit individual route findings for added routes
  for (const route of added) {
    const tags = [...route.tags, ...configTags.filter((t) => t === "global-guard" || t === "global-hook")];

    const finding: RouteChangeFinding = {
      type: "route-change",
      kind: "route-change",
      category: "routes",
      confidence: "medium",
      evidence: [createEvidence(filePath, `Route: ${route.path}${route.name ? ` (${route.name})` : ""}`)],
      routeId: route.path,
      file: filePath,
      change: "added",
      routeType: route.routeType,
    };
    if (tags.length > 0) finding.tags = tags;
    findings.push(finding);
  }

  // Emit individual route findings for removed routes
  for (const route of removed) {
    // Skip routes that also appear in added (modified, not removed)
    if (added.some((a) => a.path === route.path)) continue;

    const finding: RouteChangeFinding = {
      type: "route-change",
      kind: "route-change",
      category: "routes",
      confidence: "medium",
      evidence: [createEvidence(filePath, `Route removed: ${route.path}`)],
      routeId: route.path,
      file: filePath,
      change: "deleted",
      routeType: route.routeType,
    };
    if (route.tags.length > 0) finding.tags = route.tags;
    findings.push(finding);
  }

  // Always emit a config-level finding for the router config change
  const excerpt = extractRepresentativeExcerpt(additions);
  const configFinding: RouteChangeFinding = {
    type: "route-change",
    kind: "route-change",
    category: "routes",
    confidence: "medium",
    evidence: [createEvidence(filePath, excerpt || "Vue Router config changed")],
    routeId: "vue-router-config",
    file: filePath,
    change: status,
    routeType: "unknown",
  };
  if (configTags.length > 0) configFinding.tags = configTags;
  findings.push(configFinding);

  return findings;
}
