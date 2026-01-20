/**
 * Angular routes analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  angularRoutesAnalyzer,
  normalizePath,
  joinPaths,
  extractAngularRoutes,
  extractRoutesFromContent,
} from "../src/analyzers/angular-routes.js";
import type { RouteChangeFinding } from "../src/core/types.js";
import { createChangeSet, createFileChange, createFileDiff } from "./fixtures/index.js";

describe("normalizePath", () => {
  it("should normalize paths", () => {
    expect(normalizePath("/users")).toBe("/users");
    expect(normalizePath("/users/")).toBe("/users");
    expect(normalizePath("//users///profile//")).toBe("/users/profile");
    expect(normalizePath("/")).toBe("/");
  });
});

describe("joinPaths", () => {
  it("should join parent and child paths", () => {
    expect(joinPaths("/", "users")).toBe("/users");
    expect(joinPaths("/users", "profile")).toBe("/users/profile");
    expect(joinPaths("/users", "/profile")).toBe("/profile");
    expect(joinPaths("/", "")).toBe("/");
  });
});

describe("extractAngularRoutes", () => {
  it("should extract routes from RouterModule.forRoot", () => {
    const content = `
      import { RouterModule, Routes } from '@angular/router';

      const routes: Routes = [
        { path: '', component: HomeComponent },
        { path: 'about', component: AboutComponent },
        { path: 'users/:id', component: UserComponent }
      ];

      @NgModule({
        imports: [RouterModule.forRoot(routes)]
      })
      export class AppRoutingModule {}
    `;

    const routes = extractRoutesFromContent(content, "app-routing.module.ts");
    expect(routes.length).toBe(3);
    expect(routes[0].path).toBe("/");
    expect(routes[1].path).toBe("/about");
    expect(routes[2].path).toBe("/users/:id");
  });

  it("should extract routes from RouterModule.forChild", () => {
    const content = `
      import { RouterModule, Routes } from '@angular/router';

      const routes: Routes = [
        { path: 'feature', component: FeatureComponent }
      ];

      @NgModule({
        imports: [RouterModule.forChild(routes)]
      })
      export class FeatureRoutingModule {}
    `;

    const routes = extractRoutesFromContent(content, "feature-routing.module.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/feature");
  });

  it("should extract routes with loadChildren", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'admin',
          loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/admin");
    expect(routes[0].loadChildren).toBe(true);
  });

  it("should extract nested routes with children", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'users',
          component: UsersComponent,
          children: [
            { path: '', component: UserListComponent },
            { path: ':id', component: UserDetailComponent }
          ]
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(3);
    expect(routes[0].path).toBe("/users");
    expect(routes[1].path).toBe("/users");
    expect(routes[2].path).toBe("/users/:id");
  });

  it("should extract routes with redirectTo", () => {
    const content = `
      const routes: Routes = [
        { path: '', redirectTo: '/home', pathMatch: 'full' },
        { path: 'home', component: HomeComponent }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(2);
    expect(routes[0].path).toBe("/");
    expect(routes[0].redirectTo).toBe("/home");
  });

  it("should extract routes from provideRouter (standalone API)", () => {
    const content = `
      import { provideRouter, Routes } from '@angular/router';

      const routes: Routes = [
        { path: '', component: HomeComponent },
        { path: 'about', component: AboutComponent }
      ];

      export const appConfig = {
        providers: [provideRouter(routes)]
      };
    `;

    const routes = extractRoutesFromContent(content, "app.config.ts");
    expect(routes.length).toBe(2);
    expect(routes[0].path).toBe("/");
    expect(routes[1].path).toBe("/about");
  });
});

describe("angularRoutesAnalyzer", () => {
  it("should detect added routes", async () => {
    const baseContent = `
      const routes: Routes = [
        { path: '', component: HomeComponent }
      ];
    `;

    const headContent = `
      const routes: Routes = [
        { path: '', component: HomeComponent },
        { path: 'about', component: AboutComponent }
      ];
    `;

    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/app.routes.ts", "modified")],
      diffs: [createFileDiff("src/app/app.routes.ts", "modified")],
    });

    // Mock the batch content fetcher
    const originalDeps = (angularRoutesAnalyzer as any).dependencies;
    (angularRoutesAnalyzer as any).dependencies = {
      batchGetFileContent: async () => {
        const map = new Map();
        map.set("base-ref:src/app/app.routes.ts", baseContent);
        map.set("head-ref:src/app/app.routes.ts", headContent);
        return map;
      },
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);

    // Restore original dependencies
    (angularRoutesAnalyzer as any).dependencies = originalDeps;

    expect(findings.length).toBe(1);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.type).toBe("route-change");
    expect(finding.routeId).toBe("/about");
    expect(finding.change).toBe("added");
  });

  it("should detect deleted routes", async () => {
    const baseContent = `
      const routes: Routes = [
        { path: '', component: HomeComponent },
        { path: 'about', component: AboutComponent }
      ];
    `;

    const headContent = `
      const routes: Routes = [
        { path: '', component: HomeComponent }
      ];
    `;

    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/app.routes.ts", "modified")],
      diffs: [createFileDiff("src/app/app.routes.ts", "modified")],
    });

    // Mock the batch content fetcher
    const originalDeps = (angularRoutesAnalyzer as any).dependencies;
    (angularRoutesAnalyzer as any).dependencies = {
      batchGetFileContent: async () => {
        const map = new Map();
        map.set("base-ref:src/app/app.routes.ts", baseContent);
        map.set("head-ref:src/app/app.routes.ts", headContent);
        return map;
      },
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);

    // Restore original dependencies
    (angularRoutesAnalyzer as any).dependencies = originalDeps;

    expect(findings.length).toBe(1);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.type).toBe("route-change");
    expect(finding.routeId).toBe("/about");
    expect(finding.change).toBe("deleted");
  });

  it("should skip files without Angular router keywords", async () => {
    const content = `
      export class MyService {
        getData() { return []; }
      }
    `;

    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/my.service.ts", "modified")],
      diffs: [createFileDiff("src/app/my.service.ts", "modified")],
    });

    // Mock the batch content fetcher
    const originalDeps = (angularRoutesAnalyzer as any).dependencies;
    (angularRoutesAnalyzer as any).dependencies = {
      batchGetFileContent: async () => {
        const map = new Map();
        map.set("base-ref:src/app/my.service.ts", content);
        map.set("head-ref:src/app/my.service.ts", content);
        return map;
      },
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);

    // Restore original dependencies
    (angularRoutesAnalyzer as any).dependencies = originalDeps;

    expect(findings.length).toBe(0);
  });

  it("should return empty array for non-routing files", async () => {
    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/README.md", "modified")],
      diffs: [createFileDiff("src/app/README.md", "modified")],
    });

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    expect(findings.length).toBe(0);
  });
});
