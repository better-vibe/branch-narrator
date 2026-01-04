/**
 * React Router route detector - detects changes in React Router routes.
 * Supports both JSX routes (<Route>) and data routers (createBrowserRouter).
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
}

function isCandidateFile(path: string): boolean {
  // Check extension
  const validExtensions = [".ts", ".tsx", ".js", ".jsx"];
  if (!validExtensions.some((ext) => path.endsWith(ext))) {
    return false;
  }

  // We previously checked diffContent for react-router keywords,
  // but that causes us to miss modifications where imports aren't touched.
  // We accept the cost of checking all JS/TS files in exchange for correctness.
  return true;
}

/**
 * Normalize route path.
 * - Collapse multiple slashes
 * - Remove trailing slash unless path is exactly "/"
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

  // Join with "/"
  const joined = parent === "/" ? `/${child}` : `${parent}/${child}`;
  return normalizePath(joined);
}

/**
 * Extract routes from JSX <Route> elements.
 */
export function extractJsxRoutes(
  ast: t.File,
  filePath: string,
  parentPath = "/"
): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  traverse(ast, {
    JSXElement(path) {
      const openingElement = path.node.openingElement;
      const name = openingElement.name;

      // Check if this is a <Route> element
      if (t.isJSXIdentifier(name) && name.name === "Route") {
        let routePath: string | null = null;
        let isIndex = false;
        let children: t.JSXElement[] = [];

        // Extract path attribute
        for (const attr of openingElement.attributes) {
          if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
            if (attr.name.name === "path" && attr.value) {
              if (t.isStringLiteral(attr.value)) {
                routePath = attr.value.value;
              } else if (
                t.isJSXExpressionContainer(attr.value) &&
                t.isStringLiteral(attr.value.expression)
              ) {
                routePath = attr.value.expression.value;
              }
            } else if (attr.name.name === "index") {
              isIndex = true;
            }
          }
        }

        // Handle index routes
        if (isIndex) {
          routes.push({
            path: normalizePath(parentPath),
            file: filePath,
          });
        } else if (routePath) {
          const fullPath = joinPaths(parentPath, routePath);
          routes.push({
            path: fullPath,
            file: filePath,
          });

          // Extract nested routes
          for (const child of path.node.children) {
            if (t.isJSXElement(child)) {
              children.push(child);
            }
          }

          // Process children with current route as parent
          for (const child of children) {
            const childAst: t.File = t.file(t.program([t.expressionStatement(child)]));
            const childRoutes = extractJsxRoutes(childAst, filePath, fullPath);
            routes.push(...childRoutes);
          }
        }

        // We've manually processed this Route's children; avoid traversing them again
        path.skip();
      }
    },
  });

  return routes;
}

/**
 * Extract routes from data router configuration.
 */
export function extractDataRoutes(
  ast: t.File,
  filePath: string,
  parentPath = "/"
): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];
  const routeConfigs = new Map<string, t.Expression>();

  // First pass: collect route config variables
  traverse(ast, {
    VariableDeclarator(path) {
      if (
        t.isIdentifier(path.node.id) &&
        (t.isArrayExpression(path.node.init) ||
          t.isObjectExpression(path.node.init))
      ) {
        routeConfigs.set(path.node.id.name, path.node.init);
      }
    },
  });

  // Second pass: find createBrowserRouter/createHashRouter/createMemoryRouter calls
  traverse(ast, {
    CallExpression(path) {
      const callee = path.node.callee;
      if (
        t.isIdentifier(callee) &&
        (callee.name === "createBrowserRouter" ||
          callee.name === "createHashRouter" ||
          callee.name === "createMemoryRouter")
      ) {
        const firstArg = path.node.arguments[0];
        let routesArray: t.ArrayExpression | null = null;

        // Check if first argument is an array literal
        if (t.isArrayExpression(firstArg)) {
          routesArray = firstArg;
        }
        // Check if first argument is an identifier referencing a routes variable
        else if (t.isIdentifier(firstArg)) {
          const config = routeConfigs.get(firstArg.name);
          if (config && t.isArrayExpression(config)) {
            routesArray = config;
          }
        }

        if (routesArray) {
          const extracted = extractRoutesFromArray(
            routesArray,
            filePath,
            parentPath
          );
          routes.push(...extracted);
        }
      }
    },
  });

  return routes;
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
      
      if (routeConfig.index) {
        routes.push({
          path: normalizePath(parentPath),
          file: filePath,
        });
      } else if (routeConfig.path) {
        const fullPath = joinPaths(parentPath, routeConfig.path);
        routes.push({
          path: fullPath,
          file: filePath,
        });

        // Process children
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
 * Extract route configuration from an object expression.
 */
function extractRouteConfig(obj: t.ObjectExpression): {
  path?: string;
  index?: boolean;
  children?: t.ArrayExpression;
} {
  const config: {
    path?: string;
    index?: boolean;
    children?: t.ArrayExpression;
  } = {};

  for (const prop of obj.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      if (prop.key.name === "path" && t.isStringLiteral(prop.value)) {
        config.path = prop.value.value;
      } else if (prop.key.name === "index") {
        if (t.isBooleanLiteral(prop.value) && prop.value.value) {
          config.index = true;
        }
      } else if (prop.key.name === "children" && t.isArrayExpression(prop.value)) {
        config.children = prop.value;
      }
    }
  }

  return config;
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
      plugins: ["typescript", "jsx"],
    });

    const jsxRoutes = extractJsxRoutes(ast, filePath);
    const dataRoutes = extractDataRoutes(ast, filePath);

    return [...jsxRoutes, ...dataRoutes];
  } catch (error) {
    // Parsing failed, skip silently
    return [];
  }
}

// ============================================================================
// Analyzer
// ============================================================================

export const reactRouterRoutesAnalyzer: Analyzer = {
  name: "react-router-routes",

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Select candidate files
    const candidateFiles = changeSet.files.filter((file) => {
      // We assume isCandidateFile logic is correct
      return isCandidateFile(file.path);
    });

    if (candidateFiles.length === 0) return [];

    // Prepare batch request
    const batchRequest: Array<{ ref: string; path: string }> = [];
    for (const file of candidateFiles) {
       batchRequest.push({ ref: changeSet.base, path: file.path });
       batchRequest.push({ ref: changeSet.head, path: file.path });
    }

    // Determine CWD (implicitly handled if batchGetFileContent uses process.cwd(),
    // but ideally ChangeSet should provide it. Since we don't have it in ChangeSet,
    // we assume process.cwd() is correct as per other analyzers).
    // Note: In benchmarks we chdir to the repo.
    const contentMap = await dependencies.batchGetFileContent(batchRequest);

    // Extract routes from base and head for each file
    for (const file of candidateFiles) {
      const baseKey = `${changeSet.base}:${file.path}`;
      const headKey = `${changeSet.head}:${file.path}`;

      const baseContent = contentMap.get(baseKey);
      const headContent = contentMap.get(headKey);

      // Heuristic: If content doesn't contain "react-router", "Route", etc., skip AST parsing
      // This saves time on files that are .tsx but not routes.
      const hasRouterKeywords = (content: string) =>
        content.includes("react-router") ||
        content.includes("<Route") ||
        content.includes("createBrowserRouter") ||
        content.includes("createHashRouter") ||
        content.includes("createMemoryRouter");

      if (baseContent && !hasRouterKeywords(baseContent) && headContent && !hasRouterKeywords(headContent)) {
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
          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, `Route: ${route.path}`)],
            routeId: route.path,
            file: file.path,
            change: "added",
            routeType: "page",
          };
          findings.push(finding);
        }
      }

      // Find deleted routes
      for (const route of baseRoutes) {
        if (!headPaths.has(route.path)) {
          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, `Route: ${route.path}`)],
            routeId: route.path,
            file: file.path,
            change: "deleted",
            routeType: "page",
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
