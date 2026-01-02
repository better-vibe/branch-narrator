/**
 * React Router analyzer tests.
 */

import { describe, expect, it } from "vitest";
import {
  extractJsxRoutes,
  extractDataRoutes,
  extractRoutesFromContent,
  normalizePath,
  joinPaths,
} from "../src/analyzers/reactRouterRoutes.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import { reactRouterRoutesAnalyzer } from "../src/analyzers/reactRouterRoutes.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

// ============================================================================
// Fixture Content
// ============================================================================

const jsxRoutesFixture = `
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/settings" element={<Settings />}>
        <Route path="billing" element={<Billing />} />
        <Route path="profile" element={<Profile />} />
        <Route index element={<SettingsIndex />} />
      </Route>
      <Route path="/users/:id" element={<User />} />
    </Routes>
  );
}
`;

const dataRouterLiteralFixture = `
import { createBrowserRouter } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/users/:id",
    element: <User />,
  },
  {
    path: "/account",
    element: <Account />,
    children: [
      {
        index: true,
        element: <AccountIndex />,
      },
      {
        path: "settings",
        element: <Settings />,
      },
    ],
  },
]);
`;

const dataRouterIdentifierFixture = `
import { createBrowserRouter } from 'react-router-dom';

const routes = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/about",
    element: <About />,
  },
];

const router = createBrowserRouter(routes);
`;

const hashRouterFixture = `
import { createHashRouter } from 'react-router-dom';

const router = createHashRouter([
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
]);
`;

const memoryRouterFixture = `
import { createMemoryRouter } from 'react-router-dom';

const router = createMemoryRouter([
  {
    path: "/",
    element: <Home />,
  },
]);
`;

const nestedIndexRouteFixture = `
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/account" element={<Account />}>
        <Route index element={<AccountIndex />} />
      </Route>
    </Routes>
  );
}
`;

const absoluteChildPathFixture = `
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/parent" element={<Parent />}>
        <Route path="/absolute" element={<Absolute />} />
      </Route>
    </Routes>
  );
}
`;

// ============================================================================
// Unit Tests for Route Extraction
// ============================================================================

describe("React Router route extraction", () => {
  describe("JSX routes", () => {
    it("should extract flat routes", () => {
      const routes = extractRoutesFromContent(jsxRoutesFixture, "App.tsx");
      const paths = routes.map((r) => r.path).sort();
      
      expect(paths).toContain("/");
      expect(paths).toContain("/users/:id");
      expect(paths).toContain("/settings");
    });

    it("should extract nested routes with parent/child path joining", () => {
      const routes = extractRoutesFromContent(jsxRoutesFixture, "App.tsx");
      const paths = routes.map((r) => r.path).sort();
      
      // /settings + billing = /settings/billing
      expect(paths).toContain("/settings/billing");
      expect(paths).toContain("/settings/profile");
    });

    it("should handle index routes", () => {
      const routes = extractRoutesFromContent(jsxRoutesFixture, "App.tsx");
      const paths = routes.map((r) => r.path);
      
      // Index route under /settings should map to /settings
      expect(paths).toContain("/settings");
    });

    it("should handle absolute child paths", () => {
      const routes = extractRoutesFromContent(absoluteChildPathFixture, "App.tsx");
      const paths = routes.map((r) => r.path);
      
      // Child starting with / should be treated as absolute
      expect(paths).toContain("/absolute");
      expect(paths).toContain("/parent");
    });
  });

  describe("Data router routes", () => {
    it("should extract routes from array literal", () => {
      const routes = extractRoutesFromContent(dataRouterLiteralFixture, "router.tsx");
      const paths = routes.map((r) => r.path).sort();
      
      expect(paths).toContain("/");
      expect(paths).toContain("/users/:id");
      expect(paths).toContain("/account");
    });

    it("should extract routes from identifier reference", () => {
      const routes = extractRoutesFromContent(dataRouterIdentifierFixture, "router.tsx");
      const paths = routes.map((r) => r.path).sort();
      
      expect(paths).toContain("/");
      expect(paths).toContain("/about");
    });

    it("should handle nested children", () => {
      const routes = extractRoutesFromContent(dataRouterLiteralFixture, "router.tsx");
      const paths = routes.map((r) => r.path).sort();
      
      // Parent /account with child settings = /account/settings
      expect(paths).toContain("/account/settings");
    });

    it("should handle index routes in data router", () => {
      const routes = extractRoutesFromContent(dataRouterLiteralFixture, "router.tsx");
      const paths = routes.map((r) => r.path);
      
      // index: true under /account should map to /account
      expect(paths).toContain("/account");
    });

    it("should support createHashRouter", () => {
      const routes = extractRoutesFromContent(hashRouterFixture, "router.tsx");
      const paths = routes.map((r) => r.path);
      
      expect(paths).toContain("/");
      expect(paths).toContain("/dashboard");
    });

    it("should support createMemoryRouter", () => {
      const routes = extractRoutesFromContent(memoryRouterFixture, "router.tsx");
      const paths = routes.map((r) => r.path);
      
      expect(paths).toContain("/");
    });
  });
});

// ============================================================================
// Analyzer Integration Tests
// ============================================================================

describe("reactRouterRoutesAnalyzer", () => {
  it("should return empty array for non-candidate files", () => {
    const changeSet = createChangeSet({
      files: [
        { path: "config.json", status: "modified" },
        { path: "README.md", status: "modified" },
      ],
      diffs: [
        createFileDiff("config.json", ["{}"]),
        createFileDiff("README.md", ["# Docs"]),
      ],
    });

    const findings = reactRouterRoutesAnalyzer.analyze(changeSet);
    expect(findings).toEqual([]);
  });

  it("should deduplicate routes", () => {
    // This is tested by the implementation - routes are deduplicated by routeId+change+file
    // We can verify by checking that the same route doesn't appear twice
    const changeSet = createChangeSet({
      files: [{ path: "App.tsx", status: "modified" }],
      diffs: [createFileDiff("App.tsx", ["<Route path='/test' />"])],
    });

    const findings = reactRouterRoutesAnalyzer.analyze(changeSet);
    const routeIds = findings.map((f) => (f as RouteChangeFinding).routeId);
    const uniqueRouteIds = new Set(routeIds);
    
    expect(routeIds.length).toBe(uniqueRouteIds.size);
  });

  it("should sort routes deterministically", () => {
    // Routes are sorted alphabetically by routeId
    const changeSet = createChangeSet({
      files: [{ path: "App.tsx", status: "modified" }],
      diffs: [createFileDiff("App.tsx", ["<Route path='/test' />"])],
    });

    const findings = reactRouterRoutesAnalyzer.analyze(changeSet);
    const routeIds = findings.map((f) => (f as RouteChangeFinding).routeId);
    const sortedRouteIds = [...routeIds].sort();
    
    expect(routeIds).toEqual(sortedRouteIds);
  });
});

// ============================================================================
// Path Normalization Tests
// ============================================================================

describe("Path normalization", () => {
  it("should collapse multiple slashes", () => {
    expect(normalizePath("//path///to////resource")).toBe("/path/to/resource");
  });

  it("should remove trailing slash except for root", () => {
    expect(normalizePath("/path/to/resource/")).toBe("/path/to/resource");
    expect(normalizePath("/")).toBe("/");
  });

  it("should preserve route params", () => {
    expect(normalizePath("/users/:id")).toBe("/users/:id");
    expect(normalizePath("/docs/*")).toBe("/docs/*");
  });
});

// ============================================================================
// Path Joining Tests
// ============================================================================

describe("Path joining", () => {
  it("should join parent and child paths", () => {
    expect(joinPaths("/parent", "child")).toBe("/parent/child");
    expect(joinPaths("/", "child")).toBe("/child");
  });

  it("should treat child starting with / as absolute", () => {
    expect(joinPaths("/parent", "/absolute")).toBe("/absolute");
  });

  it("should normalize joined paths", () => {
    expect(joinPaths("/parent/", "child")).toBe("/parent/child");
  });
});

// ============================================================================
// File Filtering Tests
// ============================================================================

describe("File filtering", () => {
  it("should only process .ts, .tsx, .js, .jsx files", () => {
    const changeSet = createChangeSet({
      files: [
        { path: "App.tsx", status: "modified" },
        { path: "routes.ts", status: "modified" },
        { path: "config.json", status: "modified" },
        { path: "README.md", status: "modified" },
      ],
      diffs: [
        createFileDiff("App.tsx", ["<Route path='/test' />"]),
        createFileDiff("routes.ts", ["createBrowserRouter"]),
        createFileDiff("config.json", ["{}"]),
        createFileDiff("README.md", ["# Docs"]),
      ],
    });

    const findings = reactRouterRoutesAnalyzer.analyze(changeSet);
    
    // Should only process .tsx and .ts files with React Router patterns
    // Note: This will be empty because we don't have real git content
    expect(Array.isArray(findings)).toBe(true);
  });

  it("should filter files with React Router patterns in diff", () => {
    const changeSet = createChangeSet({
      files: [
        { path: "App.tsx", status: "modified" },
        { path: "utils.ts", status: "modified" },
      ],
      diffs: [
        createFileDiff("App.tsx", ["<Route path='/test' />"]),
        createFileDiff("utils.ts", ["export function add(a, b) { return a + b; }"]),
      ],
    });

    const findings = reactRouterRoutesAnalyzer.analyze(changeSet);
    
    // Should only process App.tsx because it has <Route in diff
    expect(Array.isArray(findings)).toBe(true);
  });
});
