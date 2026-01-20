/**
 * Angular route detector - detects changes in Angular Router routes.
 * Supports route configuration in routing modules and component files.
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type {
  Analyzer,
  ChangeSet,
  Finding,
  RouteChangeFinding,
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
  loadChildren?: boolean;
  redirectTo?: string;
}

/**
 * Check if file is an Angular routing module or component with routes.
 */
function isCandidateFile(path: string): boolean {
  // Check extension
  const validExtensions = [".ts", ".js"];
  if (!validExtensions.some((ext) => path.endsWith(ext))) {
    return false;
  }

  // Routing modules typically have these patterns
  const isRoutingModule =
    path.includes("-routing.module") ||
    path.includes(".routing.module") ||
    path.includes("app.routes") ||
    path.includes(".routes.ts");

  // Also check regular module files and components
  const isModuleOrComponent = path.includes(".module.") || path.includes(".component.");

  return isRoutingModule || isModuleOrComponent;
}

/**
 * Normalize route path.
 */
export function normalizePath(path: string): string {
  // Collapse multiple slashes
  let normalized = path.replace(/\/+/g, "/");

  // Remove trailing slash unless it's the root path
  if (normalized !== "/" && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

/**
 * Join parent and child paths.
 */
export function joinPaths(parent: string, child: string): string {
  // If child starts with "/", treat as absolute
  if (child.startsWith("/")) {
    return normalizePath(child);
  }

  // If child is empty string, return parent
  if (child === "") {
    return normalizePath(parent);
  }

  // Join with "/"
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
  children?: t.ArrayExpression;
} {
  const config: {
    path?: string;
    redirectTo?: string;
    loadChildren?: boolean;
    children?: t.ArrayExpression;
  } = {};

  for (const prop of obj.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      if (prop.key.name === "path" && t.isStringLiteral(prop.value)) {
        config.path = prop.value.value;
      } else if (prop.key.name === "redirectTo" && t.isStringLiteral(prop.value)) {
        config.redirectTo = prop.value.value;
      } else if (prop.key.name === "loadChildren") {
        config.loadChildren = true;
      } else if (prop.key.name === "children" && t.isArrayExpression(prop.value)) {
        config.children = prop.value;
      }
    }
  }

  return config;
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
        routes.push({
          path: fullPath,
          file: filePath,
          loadChildren: routeConfig.loadChildren,
          redirectTo: routeConfig.redirectTo,
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
 * Extract routes from Angular router configuration.
 * Looks for:
 * - RouterModule.forRoot(routes)
 * - RouterModule.forChild(routes)
 * - provideRouter(routes)
 * - const routes: Routes = [...]
 */
export function extractAngularRoutes(
  ast: t.File,
  filePath: string
): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const routeConfigs = new Map<string, t.Expression>();

  // First pass: collect Routes variable declarations
  traverse(ast, {
    VariableDeclarator(path) {
      if (t.isIdentifier(path.node.id) && t.isArrayExpression(path.node.init)) {
        // Check if variable has a type annotation of Routes or Routes[]
        const parent = path.parent;
        if (
          t.isVariableDeclaration(parent) &&
          parent.declarations.length > 0 &&
          parent.declarations[0] === path.node
        ) {
          // Store the routes array
          routeConfigs.set(path.node.id.name, path.node.init);
        }
      }
    },
  });

  // Second pass: find RouterModule.forRoot/forChild and provideRouter calls
  traverse(ast, {
    CallExpression(path) {
      let routesArray: t.ArrayExpression | null = null;

      // Check for RouterModule.forRoot(routes) or RouterModule.forChild(routes)
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
            const config = routeConfigs.get(firstArg.name);
            if (config && t.isArrayExpression(config)) {
              routesArray = config;
            }
          }
        }
      }
      // Check for provideRouter(routes) - Angular standalone API
      else if (t.isIdentifier(path.node.callee)) {
        if (path.node.callee.name === "provideRouter") {
          const firstArg = path.node.arguments[0];

          if (t.isArrayExpression(firstArg)) {
            routesArray = firstArg;
          } else if (t.isIdentifier(firstArg)) {
            const config = routeConfigs.get(firstArg.name);
            if (config && t.isArrayExpression(config)) {
              routesArray = config;
            }
          }
        }
      }

      if (routesArray) {
        const extracted = extractRoutesFromArray(routesArray, filePath);
        routes.push(...extracted);
      }
    },
  });

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
    // Parsing failed, skip silently
    return [];
  }
}

// ============================================================================
// Analyzer
// ============================================================================

export const angularRoutesAnalyzer: Analyzer = {
  name: "angular-routes",

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
        content.includes("RouterModule") ||
        content.includes("provideRouter") ||
        content.includes("Routes") ||
        content.includes("@angular/router");

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

      // Create sets for comparison
      const basePaths = new Set(baseRoutes.map((r) => r.path));
      const headPaths = new Set(headRoutes.map((r) => r.path));

      // Find added routes
      for (const route of headRoutes) {
        if (!basePaths.has(route.path)) {
          const routeType = route.loadChildren ? "lazy" : route.redirectTo ? "redirect" : "page";
          const evidence = route.redirectTo
            ? `Route: ${route.path} → ${route.redirectTo}`
            : `Route: ${route.path}`;

          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidence)],
            routeId: route.path,
            file: file.path,
            change: "added",
            routeType: routeType as any,
          };
          findings.push(finding);
        }
      }

      // Find deleted routes
      for (const route of baseRoutes) {
        if (!headPaths.has(route.path)) {
          const routeType = route.loadChildren ? "lazy" : route.redirectTo ? "redirect" : "page";
          const evidence = route.redirectTo
            ? `Route: ${route.path} → ${route.redirectTo}`
            : `Route: ${route.path}`;

          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidence)],
            routeId: route.path,
            file: file.path,
            change: "deleted",
            routeType: routeType as any,
          };
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
