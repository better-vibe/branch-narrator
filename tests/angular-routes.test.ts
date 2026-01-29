/**
 * Angular routes analyzer tests.
 */

import { describe, expect, it } from "bun:test";
import {
  angularRoutesAnalyzer,
  dependencies,
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
    expect(routes[0].tags).toContain("lazy-loading");
  });

  it("should extract routes with loadComponent", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'dashboard',
          loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent)
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/dashboard");
    expect(routes[0].loadComponent).toBe(true);
    expect(routes[0].tags).toContain("lazy-component");
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
    expect(routes[0].routeType).toBe("layout");
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
    expect(routes[0].tags).toContain("has-redirect");
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

  it("should extract route guards", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'admin',
          component: AdminComponent,
          canActivate: [AuthGuard],
          canDeactivate: [UnsavedChangesGuard]
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].guards).toEqual(["canActivate", "canDeactivate"]);
    expect(routes[0].tags).toContain("has-guard");
    expect(routes[0].tags).toContain("guard:canActivate");
    expect(routes[0].tags).toContain("guard:canDeactivate");
  });

  it("should extract route resolvers", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'profile',
          component: ProfileComponent,
          resolve: { user: UserResolver }
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].hasResolvers).toBe(true);
    expect(routes[0].tags).toContain("has-resolver");
  });

  it("should extract route data and title", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'settings',
          component: SettingsComponent,
          title: 'Settings Page',
          data: { breadcrumb: 'Settings' }
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].title).toBe("Settings Page");
    expect(routes[0].hasData).toBe(true);
    expect(routes[0].tags).toContain("has-title");
    expect(routes[0].tags).toContain("has-route-data");
  });

  it("should detect wildcard catch-all routes", () => {
    const content = `
      const routes: Routes = [
        { path: '**', component: NotFoundComponent }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].path).toBe("/**");
    expect(routes[0].routeType).toBe("error");
    expect(routes[0].tags).toContain("catch-all");
  });

  it("should detect canMatch guard", () => {
    const content = `
      const routes: Routes = [
        {
          path: 'feature',
          component: FeatureComponent,
          canMatch: [FeatureFlagGuard]
        }
      ];
    `;

    const routes = extractRoutesFromContent(content, "app.routes.ts");
    expect(routes.length).toBe(1);
    expect(routes[0].guards).toEqual(["canMatch"]);
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
      diffs: [createFileDiff("src/app/app.routes.ts", [], [], "modified")],
    });

    const originalBatchGetFileContent = dependencies.batchGetFileContent;
    dependencies.batchGetFileContent = async () => {
      const map = new Map();
      map.set("base-ref:src/app/app.routes.ts", baseContent);
      map.set("head-ref:src/app/app.routes.ts", headContent);
      return map;
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    dependencies.batchGetFileContent = originalBatchGetFileContent;

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
      diffs: [createFileDiff("src/app/app.routes.ts", [], [], "modified")],
    });

    const originalBatchGetFileContent = dependencies.batchGetFileContent;
    dependencies.batchGetFileContent = async () => {
      const map = new Map();
      map.set("base-ref:src/app/app.routes.ts", baseContent);
      map.set("head-ref:src/app/app.routes.ts", headContent);
      return map;
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    dependencies.batchGetFileContent = originalBatchGetFileContent;

    expect(findings.length).toBe(1);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.type).toBe("route-change");
    expect(finding.routeId).toBe("/about");
    expect(finding.change).toBe("deleted");
  });

  it("should detect modified routes (guard changes)", async () => {
    const baseContent = `
      const routes: Routes = [
        { path: 'admin', component: AdminComponent }
      ];
    `;

    const headContent = `
      const routes: Routes = [
        { path: 'admin', component: AdminComponent, canActivate: [AuthGuard] }
      ];
    `;

    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/app.routes.ts", "modified")],
      diffs: [createFileDiff("src/app/app.routes.ts", ["canActivate: [AuthGuard]"], [], "modified")],
    });

    const originalBatchGetFileContent = dependencies.batchGetFileContent;
    dependencies.batchGetFileContent = async () => {
      const map = new Map();
      map.set("base-ref:src/app/app.routes.ts", baseContent);
      map.set("head-ref:src/app/app.routes.ts", headContent);
      return map;
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    dependencies.batchGetFileContent = originalBatchGetFileContent;

    expect(findings.length).toBe(1);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.type).toBe("route-change");
    expect(finding.routeId).toBe("/admin");
    expect(finding.change).toBe("modified");
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
      diffs: [createFileDiff("src/app/my.service.ts", [], [], "modified")],
    });

    const originalBatchGetFileContent = dependencies.batchGetFileContent;
    dependencies.batchGetFileContent = async () => {
      const map = new Map();
      map.set("base-ref:src/app/my.service.ts", content);
      map.set("head-ref:src/app/my.service.ts", content);
      return map;
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    dependencies.batchGetFileContent = originalBatchGetFileContent;

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

  it("should include diff-level tags when adding routes", async () => {
    const baseContent = `
      const routes: Routes = [];
    `;

    const headContent = `
      const routes: Routes = [
        { path: 'admin', component: AdminComponent }
      ];
    `;

    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/app.routes.ts", "modified")],
      diffs: [createFileDiff("src/app/app.routes.ts", [
        "canActivate: [AuthGuard],",
        "provideRouter(routes)",
      ], [], "modified")],
    });

    const originalBatchGetFileContent = dependencies.batchGetFileContent;
    dependencies.batchGetFileContent = async () => {
      const map = new Map();
      map.set("base-ref:src/app/app.routes.ts", baseContent);
      map.set("head-ref:src/app/app.routes.ts", headContent);
      return map;
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    dependencies.batchGetFileContent = originalBatchGetFileContent;

    expect(findings.length).toBe(1);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.tags).toBeDefined();
    expect(finding.tags).toContain("has-guard");
    expect(finding.tags).toContain("standalone-api");
  });

  it("should detect loadComponent routes in app.config files", async () => {
    const baseContent = `
      const routes: Routes = [];
    `;

    const headContent = `
      const routes: Routes = [
        {
          path: 'dashboard',
          loadComponent: () => import('./dashboard.component')
        }
      ];
    `;

    const changeSet = createChangeSet({
      base: "base-ref",
      head: "head-ref",
      files: [createFileChange("src/app/app.config.ts", "modified")],
      diffs: [createFileDiff("src/app/app.config.ts", [], [], "modified")],
    });

    const originalBatchGetFileContent = dependencies.batchGetFileContent;
    dependencies.batchGetFileContent = async () => {
      const map = new Map();
      map.set("base-ref:src/app/app.config.ts", baseContent);
      map.set("head-ref:src/app/app.config.ts", headContent);
      return map;
    };

    const findings = await angularRoutesAnalyzer.analyze(changeSet);
    dependencies.batchGetFileContent = originalBatchGetFileContent;

    expect(findings.length).toBe(1);
    const finding = findings[0] as RouteChangeFinding;
    expect(finding.routeId).toBe("/dashboard");
    expect(finding.change).toBe("added");
  });
});
