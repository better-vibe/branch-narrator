/**
 * Angular route detector - detects changes in Angular Router routes.
 *
 * Detection capabilities:
 * - RouterModule.forRoot() and RouterModule.forChild() (NgModule pattern)
 * - provideRouter() (standalone API, Angular 14+)
 * - const routes: Routes = [...] declarations
 * - Lazy-loaded routes via loadChildren and loadComponent
 * - Nested routes with children arrays
 * - Redirect routes with redirectTo
 * - Route guards: canActivate, canDeactivate, canMatch, canLoad
 * - Route resolvers: resolve
 * - Route data and title
 * - Feature tags from diff content (guards, resolvers, lazy loading, etc.)
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  RouteChangeFinding,
  RouteType,
} from "../core/types.js";
import { createEvidence } from "../core/evidence.js";
import { batchGetFileContent as defaultBatchGetFileContent } from "../git/batch.js";

// Allow injection for testing
export const dependencies = {
  batchGetFileContent: defaultBatchGetFileContent,
};

// ============================================================================
// Route Extraction
// ============================================================================

interface ExtractedRoute {
  path: string;
  file: string;
  routeType: RouteType;
  loadChildren?: boolean;
  loadComponent?: boolean;
  redirectTo?: string;
  guards?: string[];
  hasResolvers?: boolean;
  hasData?: boolean;
  title?: string;
  tags: string[];
}

/** Keywords indicating Angular Router usage - used for fast filtering */
const ROUTER_KEYWORDS = [
  "RouterModule",
  "provideRouter",
  "Routes",
  "@angular/router",
  "loadChildren",
  "loadComponent",
] as const;

/** Angular route feature patterns for tag extraction from diff content */
const ANGULAR_ROUTE_FEATURE_PATTERNS: Array<{ pattern: RegExp; tag: string }> = [
  // Guard patterns
  { pattern: /canActivate\s*:/, tag: "has-guard" },
  { pattern: /canDeactivate\s*:/, tag: "has-guard" },
  { pattern: /canMatch\s*:/, tag: "has-guard" },
  { pattern: /canLoad\s*:/, tag: "has-guard" },
  { pattern: /canActivateChild\s*:/, tag: "has-guard" },
  // Resolver patterns
  { pattern: /resolve\s*:/, tag: "has-resolver" },
  // Lazy loading patterns
  { pattern: /loadChildren\s*:/, tag: "lazy-loading" },
  { pattern: /loadComponent\s*:/, tag: "lazy-component" },
  // Router features
  { pattern: /data\s*:\s*\{/, tag: "has-route-data" },
  { pattern: /title\s*:\s*['"`]/, tag: "has-title" },
  { pattern: /outlet\s*:\s*['"`]/, tag: "named-outlet" },
  { pattern: /pathMatch\s*:\s*['"`]/, tag: "has-path-match" },
  // Standalone API features
  { pattern: /provideRouter\s*\(/, tag: "standalone-api" },
  { pattern: /withComponentInputBinding\s*\(/, tag: "input-binding" },
  { pattern: /withRouterConfig\s*\(/, tag: "router-config" },
  { pattern: /withPreloading\s*\(/, tag: "preloading" },
  { pattern: /withDebugTracing\s*\(/, tag: "debug-tracing" },
  { pattern: /withHashLocation\s*\(/, tag: "hash-location" },
  { pattern: /withNavigationErrorHandler\s*\(/, tag: "error-handler" },
  { pattern: /withViewTransitions\s*\(/, tag: "view-transitions" },
  // Navigation patterns
  { pattern: /router\.navigate\s*\(/, tag: "programmatic-nav" },
  { pattern: /router\.navigateByUrl\s*\(/, tag: "programmatic-nav" },
  { pattern: /routerLink/, tag: "router-link" },
  { pattern: /routerLinkActive/, tag: "router-link-active" },
  // Route events
  { pattern: /NavigationStart/, tag: "route-events" },
  { pattern: /NavigationEnd/, tag: "route-events" },
  { pattern: /RouteConfigLoadStart/, tag: "route-events" },
];

/**
 * Check if file is an Angular routing module or component with routes.
 */
function isCandidateFile(path: string): boolean {
  const validExtensions = [".ts", ".js"];
  if (!validExtensions.some((ext) => path.endsWith(ext))) {
    return false;
  }

  // Routing modules typically have these patterns
  const isRoutingModule =
    path.includes("-routing.module") ||
    path.includes(".routing.module") ||
    path.includes("app.routes") ||
    path.includes(".routes.ts") ||
    path.includes(".routes.js");

  // Also check regular module files, components, and config files
  const isModuleOrComponent =
    path.includes(".module.") ||
    path.includes(".component.") ||
    path.includes("app.config.");

  return isRoutingModule || isModuleOrComponent;
}

/**
 * Normalize route path.
 */
export function normalizePath(path: string): string {
  let normalized = path.replace(/\/+/g, "/");
  if (normalized !== "/" && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Join parent and child paths.
 */
export function joinPaths(parent: string, child: string): string {
  if (child.startsWith("/")) {
    return normalizePath(child);
  }
  if (child === "") {
    return normalizePath(parent);
  }
  const joined = parent === "/" ? `/${child}` : `${parent}/${child}`;
  return normalizePath(joined);
}

/**
 * Extract route configuration from an object expression.
 */
function extractRouteConfig(obj: t.ObjectExpression): {
  path?: string;
  redirectTo?: string;
  loadChildren?: boolean;
  loadComponent?: boolean;
  children?: t.ArrayExpression;
  guards: string[];
  hasResolvers: boolean;
  hasData: boolean;
  title?: string;
  outlet?: string;
} {
  const config: ReturnType<typeof extractRouteConfig> = {
    guards: [],
    hasResolvers: false,
    hasData: false,
  };

  for (const prop of obj.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      switch (prop.key.name) {
        case "path":
          if (t.isStringLiteral(prop.value)) {
            config.path = prop.value.value;
          }
          break;
        case "redirectTo":
          if (t.isStringLiteral(prop.value)) {
            config.redirectTo = prop.value.value;
          }
          break;
        case "loadChildren":
          config.loadChildren = true;
          break;
        case "loadComponent":
          config.loadComponent = true;
          break;
        case "children":
          if (t.isArrayExpression(prop.value)) {
            config.children = prop.value;
          }
          break;
        case "canActivate":
        case "canDeactivate":
        case "canMatch":
        case "canLoad":
        case "canActivateChild":
          config.guards.push(prop.key.name);
          break;
        case "resolve":
          config.hasResolvers = true;
          break;
        case "data":
          config.hasData = true;
          break;
        case "title":
          if (t.isStringLiteral(prop.value)) {
            config.title = prop.value.value;
          }
          break;
        case "outlet":
          if (t.isStringLiteral(prop.value)) {
            config.outlet = prop.value.value;
          }
          break;
      }
    }
  }

  return config;
}

/**
 * Determine route type from route config.
 */
function determineRouteType(config: {
  loadChildren?: boolean;
  loadComponent?: boolean;
  redirectTo?: string;
  children?: t.ArrayExpression;
  path?: string;
}): RouteType {
  if (config.redirectTo) return "page"; // redirect routes are still page-level
  if (config.loadChildren) return "page"; // lazy modules
  if (config.loadComponent) return "page"; // lazy standalone components
  if (config.children) return "layout"; // routes with children act as layouts
  if (config.path === "**") return "error"; // wildcard catch-all
  return "page";
}

/**
 * Extract routes from route configuration array.
 */
function extractRoutesFromArray(
  array: t.ArrayExpression,
  filePath: string,
  parentPath = "/"
): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  for (const element of array.elements) {
    if (t.isObjectExpression(element)) {
      const routeConfig = extractRouteConfig(element);

      if (routeConfig.path !== undefined) {
        const fullPath = joinPaths(parentPath, routeConfig.path);
        const routeType = determineRouteType({ ...routeConfig, path: routeConfig.path });

        const tags: string[] = [];
        if (routeConfig.loadChildren) tags.push("lazy-loading");
        if (routeConfig.loadComponent) tags.push("lazy-component");
        if (routeConfig.guards.length > 0) {
          tags.push("has-guard");
          tags.push(...routeConfig.guards.map((g) => `guard:${g}`));
        }
        if (routeConfig.hasResolvers) tags.push("has-resolver");
        if (routeConfig.hasData) tags.push("has-route-data");
        if (routeConfig.title) tags.push("has-title");
        if (routeConfig.outlet) tags.push("named-outlet");
        if (routeConfig.redirectTo) tags.push("has-redirect");
        if (routeConfig.path === "**") tags.push("catch-all");

        routes.push({
          path: fullPath,
          file: filePath,
          routeType,
          loadChildren: routeConfig.loadChildren,
          loadComponent: routeConfig.loadComponent,
          redirectTo: routeConfig.redirectTo,
          guards: routeConfig.guards.length > 0 ? routeConfig.guards : undefined,
          hasResolvers: routeConfig.hasResolvers || undefined,
          hasData: routeConfig.hasData || undefined,
          title: routeConfig.title,
          tags,
        });

        // Process children routes
        if (routeConfig.children) {
          const childRoutes = extractRoutesFromArray(
            routeConfig.children,
            filePath,
            fullPath
          );
          routes.push(...childRoutes);
        }
      }
    }
  }

  return routes;
}

/**
 * Check if a type annotation is a Routes type.
 */
function isRoutesTypeAnnotation(typeAnnotation: any): boolean {
  if (!typeAnnotation) return false;

  const type = typeAnnotation.typeAnnotation || typeAnnotation;

  if (t.isTSTypeReference(type) && t.isIdentifier(type.typeName)) {
    return type.typeName.name === "Routes";
  }

  if (t.isTSArrayType(type)) {
    const elementType = type.elementType;
    if (t.isTSTypeReference(elementType) && t.isIdentifier(elementType.typeName)) {
      return elementType.typeName.name === "Route";
    }
  }

  return false;
}

/**
 * Extract routes from Angular router configuration.
 * Looks for:
 * - RouterModule.forRoot(routes)
 * - RouterModule.forChild(routes)
 * - provideRouter(routes)
 * - const routes: Routes = [...] (standalone declarations)
 */
export function extractAngularRoutes(
  ast: t.File,
  filePath: string
): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const routeConfigs = new Map<string, t.ArrayExpression>();
  const usedRouteVars = new Set<string>();

  // First pass: collect Routes variable declarations
  traverse(ast, {
    VariableDeclarator(path: any) {
      if (t.isIdentifier(path.node.id) && t.isArrayExpression(path.node.init)) {
        const hasRoutesType = isRoutesTypeAnnotation(path.node.id.typeAnnotation);
        const hasRoutesName = /routes/i.test(path.node.id.name);

        if (hasRoutesType || hasRoutesName) {
          routeConfigs.set(path.node.id.name, path.node.init);
        }
      }
    },
  });

  // Second pass: find RouterModule.forRoot/forChild and provideRouter calls
  traverse(ast, {
    CallExpression(path: any) {
      let routesArray: t.ArrayExpression | null = null;
      let routeVarName: string | null = null;

      if (t.isMemberExpression(path.node.callee)) {
        const obj = path.node.callee.object;
        const prop = path.node.callee.property;

        if (
          t.isIdentifier(obj) &&
          obj.name === "RouterModule" &&
          t.isIdentifier(prop) &&
          (prop.name === "forRoot" || prop.name === "forChild")
        ) {
          const firstArg = path.node.arguments[0];

          if (t.isArrayExpression(firstArg)) {
            routesArray = firstArg;
          } else if (t.isIdentifier(firstArg)) {
            routeVarName = firstArg.name;
            const config = routeConfigs.get(firstArg.name);
            if (config) {
              routesArray = config;
            }
          }
        }
      } else if (t.isIdentifier(path.node.callee)) {
        if (path.node.callee.name === "provideRouter") {
          const firstArg = path.node.arguments[0];

          if (t.isArrayExpression(firstArg)) {
            routesArray = firstArg;
          } else if (t.isIdentifier(firstArg)) {
            routeVarName = firstArg.name;
            const config = routeConfigs.get(firstArg.name);
            if (config) {
              routesArray = config;
            }
          }
        }
      }

      if (routesArray) {
        const extracted = extractRoutesFromArray(routesArray, filePath);
        routes.push(...extracted);
        if (routeVarName) {
          usedRouteVars.add(routeVarName);
        }
      }
    },
  });

  // Third pass: extract routes from standalone declarations not used in RouterModule/provideRouter
  if (routes.length === 0) {
    for (const [varName, arrayExpr] of routeConfigs) {
      if (!usedRouteVars.has(varName)) {
        const extracted = extractRoutesFromArray(arrayExpr, filePath);
        routes.push(...extracted);
      }
    }
  }

  return routes;
}

/**
 * Extract all routes from file content.
 */
export function extractRoutesFromContent(
  content: string,
  filePath: string
): ExtractedRoute[] {
  try {
    const ast = parse(content, {
      sourceType: "module",
      plugins: ["typescript", "decorators-legacy"],
    });

    return extractAngularRoutes(ast, filePath);
  } catch (error) {
    return [];
  }
}

/**
 * Extract feature tags from diff content lines.
 */
function extractTags(lines: string[]): string[] {
  const tags = new Set<string>();
  const combined = lines.join("\n");

  for (const { pattern, tag } of ANGULAR_ROUTE_FEATURE_PATTERNS) {
    if (pattern.test(combined)) {
      tags.add(tag);
    }
  }

  return [...tags];
}

// ============================================================================
// Analyzer
// ============================================================================

export const angularRoutesAnalyzer: Analyzer = {
  name: "angular-routes",
  cache: { includeGlobs: ["**/*.ts", "**/*.js"] },

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Select candidate files
    const candidateFiles = changeSet.files.filter((file) => {
      return isCandidateFile(file.path);
    });

    if (candidateFiles.length === 0) return [];

    // Prepare batch request
    const batchRequest: Array<{ ref: string; path: string }> = [];
    for (const file of candidateFiles) {
      batchRequest.push({ ref: changeSet.base, path: file.path });
      batchRequest.push({ ref: changeSet.head, path: file.path });
    }

    const contentMap = await dependencies.batchGetFileContent(batchRequest);

    // Extract routes from base and head for each file
    for (const file of candidateFiles) {
      const baseKey = `${changeSet.base}:${file.path}`;
      const headKey = `${changeSet.head}:${file.path}`;

      const baseContent = contentMap.get(baseKey);
      const headContent = contentMap.get(headKey);

      // Heuristic: If content doesn't contain Angular router keywords, skip
      const hasRouterKeywords = (content: string) =>
        ROUTER_KEYWORDS.some((kw) => content.includes(kw));

      if (
        baseContent &&
        !hasRouterKeywords(baseContent) &&
        headContent &&
        !hasRouterKeywords(headContent)
      ) {
        continue;
      }

      const baseRoutes = baseContent
        ? extractRoutesFromContent(baseContent, file.path)
        : [];
      const headRoutes = headContent
        ? extractRoutesFromContent(headContent, file.path)
        : [];

      // Create maps for comparison (by path)
      const baseByPath = new Map(baseRoutes.map((r) => [r.path, r]));
      const headByPath = new Map(headRoutes.map((r) => [r.path, r]));

      // Extract diff-level tags for enrichment
      const diff = changeSet.diffs.find((d) => d.path === file.path);
      const diffAdditions = diff
        ? diff.hunks.flatMap((h) => h.additions)
        : [];
      const diffTags = extractTags(diffAdditions);

      // Find added routes
      for (const [path, route] of headByPath) {
        if (!baseByPath.has(path)) {
          const evidence = route.redirectTo
            ? `Route: ${route.path} → ${route.redirectTo}`
            : `Route: ${route.path}`;

          const tags = [...new Set([...route.tags, ...diffTags])];

          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidence)],
            routeId: route.path,
            file: file.path,
            change: "added",
            routeType: route.routeType,
          };
          if (tags.length > 0) finding.tags = tags;
          findings.push(finding);
        }
      }

      // Find deleted routes
      for (const [path, route] of baseByPath) {
        if (!headByPath.has(path)) {
          const evidence = route.redirectTo
            ? `Route: ${route.path} → ${route.redirectTo}`
            : `Route: ${route.path}`;

          const tags = [...route.tags];

          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidence)],
            routeId: route.path,
            file: file.path,
            change: "deleted",
            routeType: route.routeType,
          };
          if (tags.length > 0) finding.tags = tags;
          findings.push(finding);
        }
      }

      // Detect modified routes (same path, but guards/resolvers/type changed)
      for (const [path, headRoute] of headByPath) {
        const baseRoute = baseByPath.get(path);
        if (!baseRoute) continue;

        const guardsChanged =
          JSON.stringify(baseRoute.guards || []) !== JSON.stringify(headRoute.guards || []);
        const resolversChanged = baseRoute.hasResolvers !== headRoute.hasResolvers;
        const typeChanged = baseRoute.routeType !== headRoute.routeType;
        const lazyChanged =
          baseRoute.loadChildren !== headRoute.loadChildren ||
          baseRoute.loadComponent !== headRoute.loadComponent;
        const redirectChanged = baseRoute.redirectTo !== headRoute.redirectTo;

        if (guardsChanged || resolversChanged || typeChanged || lazyChanged || redirectChanged) {
          const changes: string[] = [];
          if (guardsChanged) changes.push("guards");
          if (resolversChanged) changes.push("resolvers");
          if (typeChanged) changes.push("route type");
          if (lazyChanged) changes.push("lazy loading");
          if (redirectChanged) changes.push("redirect target");

          const evidence = `Route modified: ${headRoute.path} (${changes.join(", ")} changed)`;
          const tags = [...new Set([...headRoute.tags, ...diffTags])];

          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidence)],
            routeId: headRoute.path,
            file: file.path,
            change: "modified",
            routeType: headRoute.routeType,
          };
          if (tags.length > 0) finding.tags = tags;
          findings.push(finding);
        }
      }
    }

    // Deduplicate findings by routeId + change + file
    const uniqueFindings = Array.from(
      new Map(
        findings.map((f) => {
          const key = `${(f as RouteChangeFinding).routeId}-${
            (f as RouteChangeFinding).change
          }-${(f as RouteChangeFinding).file}`;
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
