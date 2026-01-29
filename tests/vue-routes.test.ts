/**
 * Vue/Nuxt routes analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  vueRoutesAnalyzer,
  isNuxtPage,
  isNuxtServerRoute,
  isNuxtLayout,
  isNuxtMiddleware,
  isNuxtErrorPage,
  isVueRouterConfig,
  isNuxtAppFile,
  nuxtFileToRoute,
  nuxtServerFileToRoute,
  extractRoutesFromDiff,
} from "../src/analyzers/vue-routes.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange, createFileDiff } from "./fixtures/index.js";

// ============================================================================
// File Detection Tests
// ============================================================================

describe("isNuxtPage", () => {
  it("should identify Nuxt page files", () => {
    expect(isNuxtPage("pages/index.vue")).toBe(true);
    expect(isNuxtPage("pages/about.vue")).toBe(true);
    expect(isNuxtPage("pages/users/[id].vue")).toBe(true);
    expect(isNuxtPage("src/pages/index.vue")).toBe(true);
  });

  it("should identify TypeScript page files", () => {
    expect(isNuxtPage("pages/api.ts")).toBe(true);
    expect(isNuxtPage("pages/handler.tsx")).toBe(true);
  });

  it("should reject non-page files", () => {
    expect(isNuxtPage("components/Button.vue")).toBe(false);
    expect(isNuxtPage("src/routes/index.vue")).toBe(false);
  });
});

describe("isNuxtServerRoute", () => {
  it("should identify Nuxt server routes", () => {
    expect(isNuxtServerRoute("server/api/users.ts")).toBe(true);
    expect(isNuxtServerRoute("server/routes/health.ts")).toBe(true);
    expect(isNuxtServerRoute("server/middleware/auth.ts")).toBe(true);
  });

  it("should reject non-server files", () => {
    expect(isNuxtServerRoute("pages/api/users.ts")).toBe(false);
    expect(isNuxtServerRoute("server/utils/db.ts")).toBe(false);
  });
});

describe("isNuxtLayout", () => {
  it("should identify Nuxt layout files", () => {
    expect(isNuxtLayout("layouts/default.vue")).toBe(true);
    expect(isNuxtLayout("layouts/admin.vue")).toBe(true);
    expect(isNuxtLayout("src/layouts/default.vue")).toBe(true);
  });

  it("should reject non-layout files", () => {
    expect(isNuxtLayout("pages/layout.vue")).toBe(false);
    expect(isNuxtLayout("layouts/default.ts")).toBe(false);
  });
});

describe("isNuxtMiddleware", () => {
  it("should identify Nuxt middleware files", () => {
    expect(isNuxtMiddleware("middleware/auth.ts")).toBe(true);
    expect(isNuxtMiddleware("middleware/redirect.js")).toBe(true);
    expect(isNuxtMiddleware("src/middleware/auth.ts")).toBe(true);
  });

  it("should reject non-middleware files", () => {
    expect(isNuxtMiddleware("server/middleware/auth.ts")).toBe(false);
    expect(isNuxtMiddleware("middleware/auth.vue")).toBe(false);
  });
});

describe("isNuxtErrorPage", () => {
  it("should identify Nuxt error page", () => {
    expect(isNuxtErrorPage("error.vue")).toBe(true);
    expect(isNuxtErrorPage("src/error.vue")).toBe(true);
  });

  it("should reject non-error files", () => {
    expect(isNuxtErrorPage("pages/error.vue")).toBe(false);
    expect(isNuxtErrorPage("error.ts")).toBe(false);
  });
});

describe("isNuxtAppFile", () => {
  it("should identify Nuxt app files", () => {
    expect(isNuxtAppFile("app.vue")).toBe(true);
    expect(isNuxtAppFile("src/app.vue")).toBe(true);
    expect(isNuxtAppFile("app.config.ts")).toBe(true);
    expect(isNuxtAppFile("app.config.js")).toBe(true);
  });

  it("should reject non-app files", () => {
    expect(isNuxtAppFile("pages/app.vue")).toBe(false);
    expect(isNuxtAppFile("app.ts")).toBe(false);
  });
});

describe("isVueRouterConfig", () => {
  it("should identify Vue Router config files", () => {
    expect(isVueRouterConfig("router.ts")).toBe(true);
    expect(isVueRouterConfig("routes.js")).toBe(true);
    expect(isVueRouterConfig("src/router/index.ts")).toBe(true);
    expect(isVueRouterConfig("src/router/routes.ts")).toBe(true);
  });

  it("should reject non-router files", () => {
    expect(isVueRouterConfig("src/routes/index.vue")).toBe(false);
    expect(isVueRouterConfig("router-config.ts")).toBe(false);
  });
});

// ============================================================================
// Route Path Conversion Tests
// ============================================================================

describe("nuxtFileToRoute", () => {
  it("should convert index.vue to /", () => {
    expect(nuxtFileToRoute("pages/index.vue")).toBe("/");
    expect(nuxtFileToRoute("src/pages/index.vue")).toBe("/");
  });

  it("should convert simple paths", () => {
    expect(nuxtFileToRoute("pages/about.vue")).toBe("/about");
    expect(nuxtFileToRoute("pages/users.vue")).toBe("/users");
  });

  it("should convert nested paths", () => {
    expect(nuxtFileToRoute("pages/users/profile.vue")).toBe("/users/profile");
    expect(nuxtFileToRoute("pages/blog/posts/latest.vue")).toBe("/blog/posts/latest");
  });

  it("should convert dynamic segments", () => {
    expect(nuxtFileToRoute("pages/users/[id].vue")).toBe("/users/:id");
    expect(nuxtFileToRoute("pages/blog/[slug]/edit.vue")).toBe("/blog/:slug/edit");
  });

  it("should convert catch-all segments", () => {
    expect(nuxtFileToRoute("pages/[...slug].vue")).toBe("/:slug*");
    expect(nuxtFileToRoute("pages/docs/[...path].vue")).toBe("/docs/:path*");
  });

  it("should convert optional dynamic segments", () => {
    expect(nuxtFileToRoute("pages/users/[[id]].vue")).toBe("/users/:id?");
  });

  it("should handle nested index files", () => {
    expect(nuxtFileToRoute("pages/users/index.vue")).toBe("/users");
    expect(nuxtFileToRoute("pages/blog/posts/index.vue")).toBe("/blog/posts");
  });
});

describe("nuxtServerFileToRoute", () => {
  it("should convert API routes", () => {
    expect(nuxtServerFileToRoute("server/api/users.ts")).toBe("/api/users");
    expect(nuxtServerFileToRoute("server/api/users/[id].ts")).toBe("/api/users/:id");
  });

  it("should convert server routes", () => {
    expect(nuxtServerFileToRoute("server/routes/health.ts")).toBe("/health");
  });

  it("should strip HTTP method suffix", () => {
    expect(nuxtServerFileToRoute("server/api/users.get.ts")).toBe("/api/users");
    expect(nuxtServerFileToRoute("server/api/users.post.ts")).toBe("/api/users");
  });

  it("should handle dynamic segments in server routes", () => {
    expect(nuxtServerFileToRoute("server/api/users/[id].get.ts")).toBe("/api/users/:id");
  });

  it("should handle index server routes", () => {
    expect(nuxtServerFileToRoute("server/api/index.ts")).toBe("/api/");
  });
});

// ============================================================================
// Router Config Route Extraction Tests
// ============================================================================

describe("extractRoutesFromDiff", () => {
  it("should extract added routes from diff additions", () => {
    const additions = [
      "const routes = [",
      "  { path: '/dashboard', component: Dashboard },",
      "  { path: '/settings', component: Settings },",
      "]",
    ];

    const { added, removed } = extractRoutesFromDiff(additions, []);
    expect(added).toHaveLength(2);
    expect(added[0].path).toBe("/dashboard");
    expect(added[1].path).toBe("/settings");
  });

  it("should extract removed routes from diff deletions", () => {
    const deletions = [
      "  { path: '/old-page', component: OldPage },",
    ];

    const { added, removed } = extractRoutesFromDiff([], deletions);
    expect(removed).toHaveLength(1);
    expect(removed[0].path).toBe("/old-page");
  });

  it("should detect nested routes as layout type", () => {
    const additions = [
      "  { path: '/admin', component: AdminLayout, children: [",
      "    { path: 'users', component: Users },",
      "  ]}",
    ];

    const { added } = extractRoutesFromDiff(additions, []);
    const adminRoute = added.find((r) => r.path === "/admin");
    expect(adminRoute?.routeType).toBe("layout");
    expect(adminRoute?.tags).toContain("nested-routes");
  });

  it("should detect catch-all routes", () => {
    const additions = [
      "  { path: '/:pathMatch(.*)*', component: NotFound },",
    ];

    const { added } = extractRoutesFromDiff(additions, []);
    expect(added[0].routeType).toBe("error");
    expect(added[0].tags).toContain("catch-all");
  });

  it("should detect route features (meta, guards, lazy loading)", () => {
    const additions = [
      "  {",
      "    path: '/protected',",
      "    meta: { requiresAuth: true },",
      "    beforeEnter: authGuard,",
      "    component: () => import('./Protected.vue'),",
      "  }",
    ];

    const { added } = extractRoutesFromDiff(additions, []);
    expect(added[0].tags).toContain("has-meta");
    expect(added[0].tags).toContain("route-guard");
    expect(added[0].tags).toContain("lazy-loading");
  });

  it("should extract named routes", () => {
    const additions = [
      "  { path: '/profile', name: 'user-profile', component: Profile },",
    ];

    const { added } = extractRoutesFromDiff(additions, []);
    expect(added[0].name).toBe("user-profile");
  });
});

// ============================================================================
// Full Analyzer Tests
// ============================================================================

describe("vueRoutesAnalyzer", () => {
  it("should detect Nuxt page additions", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("pages/dashboard.vue", "added")],
      diffs: [
        createFileDiff(
          "pages/dashboard.vue",
          ["<template>", "  <div>Dashboard</div>", "</template>"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as RouteChangeFinding;
    expect(finding.type).toBe("route-change");
    expect(finding.routeId).toBe("/dashboard");
    expect(finding.routeType).toBe("page");
    expect(finding.change).toBe("added");
  });

  it("should detect Nuxt server route with method", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("server/api/users.get.ts", "added")],
      diffs: [
        createFileDiff(
          "server/api/users.get.ts",
          ["export default defineEventHandler(() => [])"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeType).toBe("endpoint");
    expect(finding.methods).toContain("GET");
    expect(finding.routeId).toBe("/api/users");
  });

  it("should detect Nuxt layout changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("layouts/admin.vue", "modified")],
      diffs: [
        createFileDiff(
          "layouts/admin.vue",
          ["<slot />"],
          [],
          "modified"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeType).toBe("layout");
  });

  it("should detect default layout with 'default' route type", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("layouts/default.vue", "modified")],
      diffs: [
        createFileDiff("layouts/default.vue", ["<slot />"], [], "modified"),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeType).toBe("default");
  });

  it("should detect Vue Router config changes with route extraction", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/router/index.ts", "modified")],
      diffs: [
        createFileDiff(
          "src/router/index.ts",
          [
            "import { createRouter, createWebHistory } from 'vue-router'",
            "const router = createRouter({",
            "  history: createWebHistory(),",
            "  routes: [",
            "    { path: '/new-route', component: NewPage },",
            "    { path: '/dashboard', component: Dashboard },",
            "  ]",
            "})",
          ],
          [
            "  { path: '/old-route', component: OldPage },",
          ],
          "modified"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);

    // Should have: /dashboard (added), /new-route (added), /old-route (deleted), vue-router-config
    expect(findings.length).toBeGreaterThanOrEqual(3);

    const routeIds = findings.map((f) => (f as RouteChangeFinding).routeId);
    expect(routeIds).toContain("/new-route");
    expect(routeIds).toContain("/dashboard");
    expect(routeIds).toContain("/old-route");
    expect(routeIds).toContain("vue-router-config");

    // Check that config-level finding has tags
    const configFinding = findings.find(
      (f) => (f as RouteChangeFinding).routeId === "vue-router-config"
    ) as RouteChangeFinding;
    expect(configFinding.tags).toContain("creates-router");
    expect(configFinding.tags).toContain("history-mode");
  });

  it("should return empty for non-route files", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("components/Button.vue", "added")],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(0);
  });

  it("should detect dynamic route parameters", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("pages/users/[id]/posts/[postId].vue", "added")],
      diffs: [
        createFileDiff(
          "pages/users/[id]/posts/[postId].vue",
          ["<template><div>Post</div></template>"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeId).toBe("/users/:id/posts/:postId");
  });

  it("should detect Nuxt middleware files", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("middleware/auth.ts", "added")],
      diffs: [
        createFileDiff(
          "middleware/auth.ts",
          [
            "export default defineNuxtRouteMiddleware((to, from) => {",
            "  if (!isAuthenticated()) return navigateTo('/login')",
            "})",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as RouteChangeFinding;
    expect(finding.routeType).toBe("metadata");
    expect(finding.routeId).toBe("middleware:auth");
    expect(finding.tags).toContain("route-middleware");
    expect(finding.tags).toContain("has-navigation");
  });

  it("should detect Nuxt error page", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("error.vue", "added")],
      diffs: [
        createFileDiff(
          "error.vue",
          ["<template><div>Error: {{ error.message }}</div></template>"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as RouteChangeFinding;
    expect(finding.routeType).toBe("error");
    expect(finding.routeId).toBe("error");
  });

  it("should detect Nuxt app.vue changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("app.vue", "modified")],
      diffs: [
        createFileDiff(
          "app.vue",
          ["<template><NuxtPage /></template>"],
          [],
          "modified"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as RouteChangeFinding;
    expect(finding.routeType).toBe("template");
    expect(finding.routeId).toBe("app.vue");
  });

  it("should detect Nuxt app.config.ts changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("app.config.ts", "modified")],
      diffs: [
        createFileDiff(
          "app.config.ts",
          ["export default defineAppConfig({ theme: 'dark' })"],
          [],
          "modified"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    expect(findings).toHaveLength(1);

    const finding = findings[0] as RouteChangeFinding;
    expect(finding.routeType).toBe("template");
  });

  it("should extract feature tags from page content", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("pages/dashboard.vue", "added")],
      diffs: [
        createFileDiff(
          "pages/dashboard.vue",
          [
            "<script setup>",
            "definePageMeta({ middleware: 'auth', layout: 'admin' })",
            "const { data } = await useFetch('/api/stats')",
            "const route = useRoute()",
            "</script>",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.tags).toContain("has-page-meta");
    expect(finding.tags).toContain("has-middleware");
    expect(finding.tags).toContain("has-fetch");
    expect(finding.tags).toContain("uses-route");
  });

  it("should extract feature tags from server route content", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("server/api/users.post.ts", "added")],
      diffs: [
        createFileDiff(
          "server/api/users.post.ts",
          [
            "export default defineEventHandler(async (event) => {",
            "  const body = await readValidatedBody(event, schema.parse)",
            "  setResponseStatus(event, 201)",
            "  return { created: true }",
            "})",
          ],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.tags).toContain("event-handler");
    expect(finding.tags).toContain("validated-input");
    expect(finding.tags).toContain("sets-status");
  });

  it("should detect server route with proper API path", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("server/api/users/[id].get.ts", "added")],
      diffs: [
        createFileDiff(
          "server/api/users/[id].get.ts",
          ["export default defineEventHandler(() => {})"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeId).toBe("/api/users/:id");
    expect(finding.methods).toContain("GET");
  });

  it("should detect Vue Router config with navigation guards", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/router/index.ts", "modified")],
      diffs: [
        createFileDiff(
          "src/router/index.ts",
          [
            "const router = createRouter({",
            "  history: createWebHistory(),",
            "  scrollBehavior(to, from, savedPosition) {",
            "    return savedPosition || { top: 0 }",
            "  },",
            "  routes,",
            "})",
            "router.beforeEach((to, from) => {",
            "  if (to.meta.requiresAuth) return '/login'",
            "})",
          ],
          [],
          "modified"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const configFinding = findings.find(
      (f) => (f as RouteChangeFinding).routeId === "vue-router-config"
    ) as RouteChangeFinding;

    expect(configFinding.tags).toContain("creates-router");
    expect(configFinding.tags).toContain("history-mode");
    expect(configFinding.tags).toContain("global-guard");
    expect(configFinding.tags).toContain("scroll-behavior");
  });

  it("should deduplicate findings by routeId + change + file", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("pages/about.vue", "modified"),
        createFileChange("pages/about.vue", "modified"),
      ],
      diffs: [
        createFileDiff("pages/about.vue", ["<div>About</div>"], [], "modified"),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const aboutFindings = findings.filter(
      (f) => (f as RouteChangeFinding).routeId === "/about"
    );
    expect(aboutFindings).toHaveLength(1);
  });

  it("should sort findings by routeId for deterministic output", () => {
    const changeSet = createChangeSet({
      files: [
        createFileChange("pages/zebra.vue", "added"),
        createFileChange("pages/alpha.vue", "added"),
        createFileChange("pages/middle.vue", "added"),
      ],
      diffs: [
        createFileDiff("pages/zebra.vue", ["<div/>"], [], "added"),
        createFileDiff("pages/alpha.vue", ["<div/>"], [], "added"),
        createFileDiff("pages/middle.vue", ["<div/>"], [], "added"),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const routeIds = findings.map((f) => (f as RouteChangeFinding).routeId);

    expect(routeIds).toEqual(["/alpha", "/middle", "/zebra"]);
  });

  it("should detect cached event handler in server routes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("server/api/stats.ts", "added")],
      diffs: [
        createFileDiff(
          "server/api/stats.ts",
          ["export default defineCachedEventHandler(() => ({ count: 42 }), { maxAge: 60 })"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.tags).toContain("cached-handler");
  });

  it("should detect websocket handler in server routes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("server/api/ws.ts", "added")],
      diffs: [
        createFileDiff(
          "server/api/ws.ts",
          ["export default defineWebSocketHandler({ open(peer) {} })"],
          [],
          "added"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.tags).toContain("websocket-handler");
  });

  it("should handle optional dynamic segments", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("pages/users/[[id]].vue", "added")],
      diffs: [
        createFileDiff("pages/users/[[id]].vue", ["<div/>"], [], "added"),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.routeId).toBe("/users/:id?");
  });
});
