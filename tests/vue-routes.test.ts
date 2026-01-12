/**
 * Vue/Nuxt routes analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  vueRoutesAnalyzer,
  isNuxtPage,
  isNuxtServerRoute,
  isNuxtLayout,
  isVueRouterConfig,
  nuxtFileToRoute,
} from "../src/analyzers/vue-routes.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange, createFileDiff } from "./fixtures/index.js";

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

describe("isVueRouterConfig", () => {
  it("should identify Vue Router config files", () => {
    expect(isVueRouterConfig("router.ts")).toBe(true);
    expect(isVueRouterConfig("routes.js")).toBe(true);
    expect(isVueRouterConfig("src/router/index.ts")).toBe(true);
  });

  it("should reject non-router files", () => {
    expect(isVueRouterConfig("src/routes/index.vue")).toBe(false);
    expect(isVueRouterConfig("router-config.ts")).toBe(false);
  });
});

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

  it("should handle nested index files", () => {
    expect(nuxtFileToRoute("pages/users/index.vue")).toBe("/users");
    expect(nuxtFileToRoute("pages/blog/posts/index.vue")).toBe("/blog/posts");
  });
});

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

  it("should detect Vue Router config changes", () => {
    const changeSet = createChangeSet({
      files: [createFileChange("src/router/index.ts", "modified")],
      diffs: [
        createFileDiff(
          "src/router/index.ts",
          ["{ path: '/new-route', component: NewPage }"],
          [],
          "modified"
        ),
      ],
    });

    const findings = vueRoutesAnalyzer.analyze(changeSet);
    const finding = findings[0] as RouteChangeFinding;

    expect(finding.routeId).toBe("vue-router-config");
    expect(finding.routeType).toBe("unknown");
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
});
