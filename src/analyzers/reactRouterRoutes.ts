/**
 * React Router route detector - detects changes in React Router routes.
 * Supports both JSX routes (<Route>) and data routers (createBrowserRouter).
 *
 * Detects:
 * - JSX routes: <Route path="/..." element={...} />
 * - Data routers: createBrowserRouter, createHashRouter, createMemoryRouter
 * - createRoutesFromElements (JSX-to-object bridge)
 * - Route types: page, layout, error boundary, catch-all
 * - Route features: loader, action, lazy loading, error boundaries, handle
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
  tags: string[];
}

/** Keywords indicating React Router usage - used for fast filtering */
const ROUTER_KEYWORDS = [
  "react-router",
  "<Route",
  "createBrowserRouter",
  "createHashRouter",
  "createMemoryRouter",
  "createRoutesFromElements",
] as const;

function isCandidateFile(path: string): boolean {
  const validExtensions = [".ts", ".tsx", ".js", ".jsx"];
  return validExtensions.some((ext) => path.endsWith(ext));
}

/**
 * Normalize route path.
 * - Collapse multiple slashes
 * - Remove trailing slash unless path is exactly "/"
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
  const joined = parent === "/" ? `/${child}` : `${parent}/${child}`;
  return normalizePath(joined);
}

/**
 * Determine route type from JSX attributes.
 */
function determineJsxRouteType(
  attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[],
  hasChildren: boolean,
  hasPath: boolean,
  isIndex: boolean
): RouteType {
  // Check for errorElement attribute → error boundary route
  for (const attr of attributes) {
    if (
      t.isJSXAttribute(attr) &&
      t.isJSXIdentifier(attr.name) &&
      attr.name.name === "errorElement"
    ) {
      return "error";
    }
  }

  // Catch-all route (path="*")
  // Determined by caller via path value

  // Index routes are pages
  if (isIndex) return "page";

  // Layout: has children and a path (wrapping component with <Outlet>)
  if (hasChildren && hasPath) return "layout";

  return "page";
}

/**
 * Extract tags from JSX Route attributes.
 */
function extractJsxRouteTags(
  attributes: (t.JSXAttribute | t.JSXSpreadAttribute)[]
): string[] {
  const tags: string[] = [];
  for (const attr of attributes) {
    if (t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name)) {
      const name = attr.name.name;
      if (name === "loader") tags.push("has-loader");
      if (name === "action") tags.push("has-action");
      if (name === "lazy") tags.push("lazy");
      if (name === "errorElement") tags.push("error-boundary");
      if (name === "handle") tags.push("has-handle");
      if (name === "shouldRevalidate") tags.push("custom-revalidation");
      if (name === "Component") tags.push("component-prop");
      if (name === "HydrateFallback") tags.push("hydrate-fallback");
    }
  }
  return tags;
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

        // Collect JSX children (nested <Route> elements)
        for (const child of path.node.children) {
          if (t.isJSXElement(child)) {
            children.push(child);
          }
        }

        const tags = extractJsxRouteTags(openingElement.attributes);
        const hasChildren = children.length > 0;

        // Handle index routes
        if (isIndex) {
          routes.push({
            path: normalizePath(parentPath),
            file: filePath,
            routeType: "page",
            tags,
          });
        } else if (routePath !== null) {
          const fullPath = joinPaths(parentPath, routePath);

          // Catch-all route
          const isCatchAll = routePath === "*";
          if (isCatchAll) {
            tags.push("catch-all");
          }

          const routeType = isCatchAll
            ? "error"
            : determineJsxRouteType(
                openingElement.attributes,
                hasChildren,
                true,
                false
              );

          routes.push({
            path: fullPath,
            file: filePath,
            routeType,
            tags,
          });

          // Process children with current route as parent
          for (const child of children) {
            const childAst: t.File = t.file(
              t.program([t.expressionStatement(child)])
            );
            const childRoutes = extractJsxRoutes(childAst, filePath, fullPath);
            routes.push(...childRoutes);
          }
        }

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

  // Second pass: find createBrowserRouter/createHashRouter/createMemoryRouter/createRoutesFromElements calls
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

        if (t.isArrayExpression(firstArg)) {
          routesArray = firstArg;
        } else if (t.isIdentifier(firstArg)) {
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

      // Support createRoutesFromElements(JSX) - extract routes from JSX arg
      if (
        t.isIdentifier(callee) &&
        callee.name === "createRoutesFromElements"
      ) {
        const firstArg = path.node.arguments[0];
        if (t.isJSXElement(firstArg)) {
          const childAst: t.File = t.file(
            t.program([t.expressionStatement(firstArg)])
          );
          const jsxRoutes = extractJsxRoutes(childAst, filePath, parentPath);
          routes.push(...jsxRoutes);
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

      const tags = routeConfig.tags;

      if (routeConfig.index) {
        routes.push({
          path: normalizePath(parentPath),
          file: filePath,
          routeType: "page",
          tags,
        });
      } else if (routeConfig.path !== undefined) {
        const fullPath = joinPaths(parentPath, routeConfig.path);

        // Catch-all route
        const isCatchAll = routeConfig.path === "*";
        if (isCatchAll) {
          tags.push("catch-all");
        }

        const routeType = isCatchAll
          ? "error"
          : routeConfig.hasErrorElement
            ? "error"
            : routeConfig.children && !routeConfig.index
              ? "layout"
              : "page";

        routes.push({
          path: fullPath,
          file: filePath,
          routeType,
          tags,
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

interface RouteConfig {
  path?: string;
  index?: boolean;
  children?: t.ArrayExpression;
  hasErrorElement: boolean;
  tags: string[];
}

/**
 * Extract route configuration from an object expression.
 */
function extractRouteConfig(obj: t.ObjectExpression): RouteConfig {
  const config: RouteConfig = {
    hasErrorElement: false,
    tags: [],
  };

  for (const prop of obj.properties) {
    if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
      const key = prop.key.name;

      if (key === "path" && t.isStringLiteral(prop.value)) {
        config.path = prop.value.value;
      } else if (key === "index") {
        if (t.isBooleanLiteral(prop.value) && prop.value.value) {
          config.index = true;
        }
      } else if (key === "children" && t.isArrayExpression(prop.value)) {
        config.children = prop.value;
      } else if (key === "errorElement") {
        config.hasErrorElement = true;
        config.tags.push("error-boundary");
      } else if (key === "ErrorBoundary") {
        config.hasErrorElement = true;
        config.tags.push("error-boundary");
      } else if (key === "loader") {
        config.tags.push("has-loader");
      } else if (key === "action") {
        config.tags.push("has-action");
      } else if (key === "lazy") {
        config.tags.push("lazy");
      } else if (key === "handle") {
        config.tags.push("has-handle");
      } else if (key === "shouldRevalidate") {
        config.tags.push("custom-revalidation");
      } else if (key === "Component") {
        config.tags.push("component-prop");
      } else if (key === "HydrateFallback") {
        config.tags.push("hydrate-fallback");
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
  cache: { includeGlobs: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"] },

  async analyze(changeSet: ChangeSet): Promise<Finding[]> {
    const findings: Finding[] = [];

    // Select candidate files
    const candidateFiles = changeSet.files.filter((file) =>
      isCandidateFile(file.path)
    );

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

      // Heuristic: If content doesn't contain router keywords, skip AST parsing
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

      // Create maps for comparison (path → route details)
      const baseRouteMap = new Map<string, ExtractedRoute>();
      for (const r of baseRoutes) {
        baseRouteMap.set(r.path, r);
      }
      const headRouteMap = new Map<string, ExtractedRoute>();
      for (const r of headRoutes) {
        headRouteMap.set(r.path, r);
      }

      // Find added routes
      for (const route of headRoutes) {
        if (!baseRouteMap.has(route.path)) {
          const tags = route.tags.length > 0 ? route.tags : undefined;
          const evidenceText = buildEvidenceText(route);
          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidenceText)],
            routeId: route.path,
            file: file.path,
            change: "added",
            routeType: route.routeType,
          };
          if (tags) finding.tags = tags;
          findings.push(finding);
        }
      }

      // Find deleted routes
      for (const route of baseRoutes) {
        if (!headRouteMap.has(route.path)) {
          const tags = route.tags.length > 0 ? route.tags : undefined;
          const evidenceText = buildEvidenceText(route);
          const finding: RouteChangeFinding = {
            type: "route-change",
            kind: "route-change",
            category: "routes",
            confidence: "high",
            evidence: [createEvidence(file.path, evidenceText)],
            routeId: route.path,
            file: file.path,
            change: "deleted",
            routeType: route.routeType,
          };
          if (tags) finding.tags = tags;
          findings.push(finding);
        }
      }
    }

    // Deduplicate findings by routeId + change + file
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

/**
 * Build descriptive evidence text for a route.
 */
function buildEvidenceText(route: ExtractedRoute): string {
  const parts = [`Route: ${route.path}`];
  if (route.routeType !== "page") {
    parts.push(`(${route.routeType})`);
  }
  if (route.tags.length > 0) {
    parts.push(`[${route.tags.join(", ")}]`);
  }
  return parts.join(" ");
}
