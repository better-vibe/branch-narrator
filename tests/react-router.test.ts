/**
 * React Router analyzer tests.
 */

import { describe, expect, it, beforeEach, mock, type Mock, afterAll, spyOn } from "bun:test";
import {
  extractJsxRoutes,
  extractDataRoutes,
  extractRoutesFromContent,
  normalizePath,
  joinPaths,
  dependencies,
} from "../src/analyzers/reactRouterRoutes.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import { reactRouterRoutesAnalyzer } from "../src/analyzers/reactRouterRoutes.js";
import { createChangeSet, createFileDiff } from "./fixtures/index.js";

const batchGetFileContentMock = mock();
const spy = spyOn(dependencies, "batchGetFileContent").mockImplementation(batchGetFileContentMock);

afterAll(() => {
  spy.mockRestore();
});

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
// New Fixture Content for Enhanced Features
// ============================================================================

const catchAllRouteFixture = `
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
`;

const errorBoundaryJsxFixture = `
import { Routes, Route } from 'react-router-dom';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} errorElement={<ErrorPage />}>
        <Route path="dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}
`;

const dataRouterWithFeaturesFixture = `
import { createBrowserRouter } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: "/",
    element: <Root />,
    errorElement: <ErrorPage />,
    loader: rootLoader,
    children: [
      {
        index: true,
        element: <Home />,
        loader: homeLoader,
      },
      {
        path: "contacts/:id",
        element: <Contact />,
        loader: contactLoader,
        action: contactAction,
      },
      {
        path: "settings",
        lazy: () => import("./routes/settings"),
      },
      {
        path: "*",
        element: <NotFound />,
      },
    ],
  },
]);
`;

const dataRouterWithHandleFixture = `
import { createBrowserRouter } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: "/admin",
    element: <Admin />,
    handle: { crumb: "Admin" },
    shouldRevalidate: ({ currentUrl }) => currentUrl.pathname === "/admin",
    children: [
      {
        path: "users",
        element: <Users />,
        handle: { crumb: "Users" },
      },
    ],
  },
]);
`;

const createRoutesFromElementsFixture = `
import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';

const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<Root />}>
      <Route path="home" element={<Home />} />
      <Route path="about" element={<About />} />
    </Route>
  )
);
`;

const componentPropFixture = `
import { createBrowserRouter } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    ErrorBoundary: GlobalError,
    HydrateFallback: Loading,
    children: [
      {
        path: "dashboard",
        Component: Dashboard,
      },
    ],
  },
]);
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

  // ============================================================================
  // Route Type Detection Tests
  // ============================================================================

  describe("Route type detection", () => {
    it("should detect layout routes (JSX routes with children)", () => {
      const routes = extractRoutesFromContent(jsxRoutesFixture, "App.tsx");
      const settingsRoute = routes.find((r) => r.path === "/settings" && r.routeType === "layout");
      expect(settingsRoute).toBeDefined();
      expect(settingsRoute!.routeType).toBe("layout");
    });

    it("should detect leaf routes as page type", () => {
      const routes = extractRoutesFromContent(jsxRoutesFixture, "App.tsx");
      const usersRoute = routes.find((r) => r.path === "/users/:id");
      expect(usersRoute).toBeDefined();
      expect(usersRoute!.routeType).toBe("page");
    });

    it("should detect catch-all routes as error type", () => {
      const routes = extractRoutesFromContent(catchAllRouteFixture, "App.tsx");
      const catchAllRoute = routes.find((r) => r.path === "/*");
      expect(catchAllRoute).toBeDefined();
      expect(catchAllRoute!.routeType).toBe("error");
      expect(catchAllRoute!.tags).toContain("catch-all");
    });

    it("should detect error boundary routes from errorElement attribute (JSX)", () => {
      const routes = extractRoutesFromContent(errorBoundaryJsxFixture, "App.tsx");
      const rootRoute = routes.find((r) => r.path === "/");
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.routeType).toBe("error");
      expect(rootRoute!.tags).toContain("error-boundary");
    });

    it("should detect error boundary routes in data router config", () => {
      const routes = extractRoutesFromContent(dataRouterWithFeaturesFixture, "router.tsx");
      const rootRoute = routes.find((r) => r.path === "/");
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.routeType).toBe("error");
      expect(rootRoute!.tags).toContain("error-boundary");
    });

    it("should detect layout routes with children in data router", () => {
      const routes = extractRoutesFromContent(dataRouterWithHandleFixture, "router.tsx");
      const adminRoute = routes.find((r) => r.path === "/admin");
      expect(adminRoute).toBeDefined();
      expect(adminRoute!.routeType).toBe("layout");
    });

    it("should detect catch-all in data router", () => {
      const routes = extractRoutesFromContent(dataRouterWithFeaturesFixture, "router.tsx");
      const catchAll = routes.find((r) => r.tags.includes("catch-all"));
      expect(catchAll).toBeDefined();
      expect(catchAll!.routeType).toBe("error");
      expect(catchAll!.path).toBe("/*");
    });

    it("should detect ErrorBoundary component prop as error type", () => {
      const routes = extractRoutesFromContent(componentPropFixture, "router.tsx");
      const rootRoute = routes.find((r) => r.path === "/");
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.routeType).toBe("error");
      expect(rootRoute!.tags).toContain("error-boundary");
    });
  });

  // ============================================================================
  // Tags Detection Tests
  // ============================================================================

  describe("Tags detection", () => {
    it("should detect loader tag in data router", () => {
      const routes = extractRoutesFromContent(dataRouterWithFeaturesFixture, "router.tsx");
      const rootRoute = routes.find((r) => r.path === "/");
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.tags).toContain("has-loader");
    });

    it("should detect action tag in data router", () => {
      const routes = extractRoutesFromContent(dataRouterWithFeaturesFixture, "router.tsx");
      const contactRoute = routes.find((r) => r.path === "/contacts/:id");
      expect(contactRoute).toBeDefined();
      expect(contactRoute!.tags).toContain("has-action");
      expect(contactRoute!.tags).toContain("has-loader");
    });

    it("should detect lazy tag in data router", () => {
      const routes = extractRoutesFromContent(dataRouterWithFeaturesFixture, "router.tsx");
      const settingsRoute = routes.find((r) => r.path === "/settings");
      expect(settingsRoute).toBeDefined();
      expect(settingsRoute!.tags).toContain("lazy");
    });

    it("should detect handle tag in data router", () => {
      const routes = extractRoutesFromContent(dataRouterWithHandleFixture, "router.tsx");
      const adminRoute = routes.find((r) => r.path === "/admin");
      expect(adminRoute).toBeDefined();
      expect(adminRoute!.tags).toContain("has-handle");
    });

    it("should detect shouldRevalidate tag", () => {
      const routes = extractRoutesFromContent(dataRouterWithHandleFixture, "router.tsx");
      const adminRoute = routes.find((r) => r.path === "/admin");
      expect(adminRoute).toBeDefined();
      expect(adminRoute!.tags).toContain("custom-revalidation");
    });

    it("should detect Component and HydrateFallback tags", () => {
      const routes = extractRoutesFromContent(componentPropFixture, "router.tsx");
      const rootRoute = routes.find((r) => r.path === "/");
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.tags).toContain("component-prop");
      expect(rootRoute!.tags).toContain("hydrate-fallback");
    });

    it("should detect multiple loader tags on index route", () => {
      const routes = extractRoutesFromContent(dataRouterWithFeaturesFixture, "router.tsx");
      // Index route at "/" should have loader tag
      const indexRoutes = routes.filter((r) => r.path === "/");
      const indexWithLoader = indexRoutes.find((r) => r.tags.includes("has-loader") && r.routeType === "page");
      expect(indexWithLoader).toBeDefined();
    });
  });

  // ============================================================================
  // createRoutesFromElements Tests
  // ============================================================================

  describe("createRoutesFromElements", () => {
    it("should extract routes from createRoutesFromElements with JSX", () => {
      const routes = extractRoutesFromContent(createRoutesFromElementsFixture, "router.tsx");
      const paths = routes.map((r) => r.path).sort();

      expect(paths).toContain("/");
      expect(paths).toContain("/home");
      expect(paths).toContain("/about");
    });

    it("should detect layout type for parent route in createRoutesFromElements", () => {
      const routes = extractRoutesFromContent(createRoutesFromElementsFixture, "router.tsx");
      const rootRoute = routes.find((r) => r.path === "/");
      expect(rootRoute).toBeDefined();
      expect(rootRoute!.routeType).toBe("layout");
    });
  });
});

// ============================================================================
// Analyzer Integration Tests
// ============================================================================

describe("reactRouterRoutesAnalyzer", () => {
  beforeEach(() => {
    batchGetFileContentMock.mockClear();
    batchGetFileContentMock.mockResolvedValue(new Map());
  });

  it("should return empty array for non-candidate files", async () => {
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

    const findings = await reactRouterRoutesAnalyzer.analyze(changeSet);
    expect(findings).toEqual([]);
    expect(batchGetFileContentMock).not.toHaveBeenCalled();
  });

  it("should deduplicate routes", async () => {
    const changeSet = createChangeSet({
      files: [{ path: "App.tsx", status: "modified" }],
      diffs: [createFileDiff("App.tsx", ["<Route path='/test' />"])],
    });

    const contentMap = new Map<string, string>();
    contentMap.set("main:App.tsx", "");
    contentMap.set("HEAD:App.tsx", `
      import { Routes, Route } from 'react-router-dom';
      export const App = () => (
        <Routes>
          <Route path="/test" element={<Test />} />
        </Routes>
      );
    `);

    batchGetFileContentMock.mockResolvedValue(contentMap);

    const findings = await reactRouterRoutesAnalyzer.analyze(changeSet);
    const routeIds = findings.map((f) => (f as RouteChangeFinding).routeId);

    expect(routeIds).toEqual(["/test"]);
  });

  it("should sort routes deterministically", async () => {
    const changeSet = createChangeSet({
      files: [{ path: "App.tsx", status: "modified" }],
      diffs: [createFileDiff("App.tsx", ["..."])],
    });

    const contentMap = new Map<string, string>();
    contentMap.set("main:App.tsx", "");
    contentMap.set("HEAD:App.tsx", `
      import { Routes, Route } from 'react-router-dom';
      export const App = () => (
        <Routes>
          <Route path="/b" element={<B />} />
          <Route path="/a" element={<A />} />
        </Routes>
      );
    `);

    batchGetFileContentMock.mockResolvedValue(contentMap);

    const findings = await reactRouterRoutesAnalyzer.analyze(changeSet);
    const routeIds = findings.map((f) => (f as RouteChangeFinding).routeId);

    expect(routeIds).toEqual(["/a", "/b"]);
  });

  it("should emit tags on findings", async () => {
    const changeSet = createChangeSet({
      files: [{ path: "router.tsx", status: "modified" }],
      diffs: [createFileDiff("router.tsx", ["createBrowserRouter"])],
    });

    const contentMap = new Map<string, string>();
    contentMap.set("main:router.tsx", "");
    contentMap.set("HEAD:router.tsx", dataRouterWithFeaturesFixture);

    batchGetFileContentMock.mockResolvedValue(contentMap);

    const findings = await reactRouterRoutesAnalyzer.analyze(changeSet);
    const contactFinding = findings.find(
      (f) => (f as RouteChangeFinding).routeId === "/contacts/:id"
    ) as RouteChangeFinding;

    expect(contactFinding).toBeDefined();
    expect(contactFinding.tags).toContain("has-loader");
    expect(contactFinding.tags).toContain("has-action");
  });

  it("should emit correct route types on findings", async () => {
    const changeSet = createChangeSet({
      files: [{ path: "router.tsx", status: "modified" }],
      diffs: [createFileDiff("router.tsx", ["createBrowserRouter"])],
    });

    const contentMap = new Map<string, string>();
    contentMap.set("main:router.tsx", "");
    contentMap.set("HEAD:router.tsx", dataRouterWithFeaturesFixture);

    batchGetFileContentMock.mockResolvedValue(contentMap);

    const findings = await reactRouterRoutesAnalyzer.analyze(changeSet);

    // Root route "/" appears twice (error parent + index child), dedup keeps one
    const rootFinding = findings.find(
      (f) => (f as RouteChangeFinding).routeId === "/"
    ) as RouteChangeFinding;
    expect(rootFinding).toBeDefined();

    // Settings route has lazy → page type (no children)
    const settingsFinding = findings.find(
      (f) => (f as RouteChangeFinding).routeId === "/settings"
    ) as RouteChangeFinding;
    expect(settingsFinding).toBeDefined();
    expect(settingsFinding.routeType).toBe("page");
    expect(settingsFinding.tags).toContain("lazy");

    // Catch-all route → error type
    const catchAllFinding = findings.find(
      (f) => (f as RouteChangeFinding).tags?.includes("catch-all")
    ) as RouteChangeFinding;
    expect(catchAllFinding).toBeDefined();
    expect(catchAllFinding.routeType).toBe("error");
  });

  it("should include evidence with route type and tags", async () => {
    const changeSet = createChangeSet({
      files: [{ path: "router.tsx", status: "modified" }],
      diffs: [createFileDiff("router.tsx", ["createBrowserRouter"])],
    });

    const contentMap = new Map<string, string>();
    contentMap.set("main:router.tsx", "");
    contentMap.set("HEAD:router.tsx", dataRouterWithFeaturesFixture);

    batchGetFileContentMock.mockResolvedValue(contentMap);

    const findings = await reactRouterRoutesAnalyzer.analyze(changeSet);

    const contactFinding = findings.find(
      (f) => (f as RouteChangeFinding).routeId === "/contacts/:id"
    ) as RouteChangeFinding;

    expect(contactFinding.evidence[0].excerpt).toContain("Route: /contacts/:id");
    expect(contactFinding.evidence[0].excerpt).toContain("has-loader");
    expect(contactFinding.evidence[0].excerpt).toContain("has-action");
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
  beforeEach(() => {
    batchGetFileContentMock.mockClear();
    batchGetFileContentMock.mockResolvedValue(new Map());
  });

  it("should only process .ts, .tsx, .js, .jsx files", async () => {
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

    await reactRouterRoutesAnalyzer.analyze(changeSet);

    expect(batchGetFileContentMock).toHaveBeenCalled();
    const args = batchGetFileContentMock.mock.calls[0][0];
    const requestedPaths = new Set(args.map((a: any) => a.path));

    expect(requestedPaths.has("App.tsx")).toBe(true);
    expect(requestedPaths.has("routes.ts")).toBe(true);
    expect(requestedPaths.has("config.json")).toBe(false);
    expect(requestedPaths.has("README.md")).toBe(false);
  });
});
