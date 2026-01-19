/**
 * Tests for Python routes analyzer.
 */

import { describe, it, expect } from "bun:test";
import { pythonRoutesAnalyzer, isPythonRouteFile } from "../src/analyzers/python-routes.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("pythonRoutesAnalyzer", () => {
  describe("isPythonRouteFile", () => {
    it("should detect FastAPI route files", () => {
      expect(isPythonRouteFile("routers.py")).toBe(true);
      expect(isPythonRouteFile("endpoints.py")).toBe(true);
      expect(isPythonRouteFile("api.py")).toBe(true);
      expect(isPythonRouteFile("app/routers.py")).toBe(true);
    });

    it("should detect Django route files", () => {
      expect(isPythonRouteFile("urls.py")).toBe(true);
      expect(isPythonRouteFile("myapp/urls.py")).toBe(true);
    });

    it("should detect Flask route files", () => {
      expect(isPythonRouteFile("views.py")).toBe(true);
      expect(isPythonRouteFile("routes.py")).toBe(true);
      expect(isPythonRouteFile("app.py")).toBe(true);
    });

    it("should not detect non-route Python files", () => {
      expect(isPythonRouteFile("models.py")).toBe(false);
      expect(isPythonRouteFile("utils.py")).toBe(false);
    });

    it("should not detect non-Python files", () => {
      expect(isPythonRouteFile("routes.ts")).toBe(false);
      expect(isPythonRouteFile("urls.txt")).toBe(false);
    });
  });

  describe("analyze - FastAPI", () => {
    it("should detect FastAPI route decorators", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("app/routers.py", "modified")],
        diffs: [
          createFileDiff("app/routers.py", [
            "from fastapi import APIRouter",
            '@router.get("/users")',
            "async def get_users():",
            '@router.post("/items")',
            "async def create_item():",
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(2);
      expect(findings[0].type).toBe("route-change");
      expect((findings[0] as any).routeId).toBe("/users");
      expect((findings[0] as any).methods).toContain("GET");
      expect((findings[1] as any).routeId).toBe("/items");
      expect((findings[1] as any).methods).toContain("POST");
    });

    it("should detect multiple HTTP methods on same endpoint", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("api.py", "modified")],
        diffs: [
          createFileDiff("api.py", [
            "from fastapi import FastAPI",
            '@app.get("/items")',
            '@app.put("/items/{id}")',
            '@app.delete("/users/{id}")',
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(3);
      // Each unique route path results in a finding
      const routeIds = findings.map((f: any) => f.routeId);
      expect(routeIds).toContain("/items");
      expect(routeIds).toContain("/items/{id}");
      expect(routeIds).toContain("/users/{id}");
    });
  });

  describe("analyze - Django", () => {
    it("should detect Django path() patterns", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("myapp/urls.py", "modified")],
        diffs: [
          createFileDiff("myapp/urls.py", [
            "from django.urls import path",
            "urlpatterns = [",
            "    path('users/', views.list_users),",
            "    path('users/<int:pk>/', views.user_detail),",
            "]",
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(2);
      expect(findings[0].type).toBe("route-change");
      expect((findings[0] as any).routeId).toBe("/users");
    });

    it("should detect Django re_path() patterns", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("urls.py", "modified")],
        diffs: [
          createFileDiff("urls.py", [
            "from django.urls import re_path",
            "urlpatterns = [",
            "    re_path(r'^api/v1/items/$', views.items),",
            "]",
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).routeId).toBe("/api/v1/items");
    });
  });

  describe("analyze - Flask", () => {
    it("should detect Flask route decorators", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("app.py", "modified")],
        diffs: [
          createFileDiff("app.py", [
            "from flask import Flask",
            "app = Flask(__name__)",
            '@app.route("/hello")',
            "def hello():",
            "    return 'Hello!'",
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect(findings[0].type).toBe("route-change");
      expect((findings[0] as any).routeId).toBe("/hello");
      expect((findings[0] as any).methods).toContain("GET");
    });

    it("should detect Flask routes with methods", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("views.py", "modified")],
        diffs: [
          createFileDiff("views.py", [
            "from flask import Blueprint",
            '@bp.route("/api/users", methods=["GET", "POST"])',
            "def users():",
            "    pass",
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).methods).toContain("GET");
      expect((findings[0] as any).methods).toContain("POST");
    });
  });

  describe("analyze - deleted routes", () => {
    it("should detect deleted routes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("routers.py", "modified")],
        diffs: [
          createFileDiff("routers.py", [], [
            "from fastapi import APIRouter",
            '@router.get("/deprecated")',
            "async def deprecated_endpoint():",
          ]),
        ],
      });

      const findings = pythonRoutesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).change).toBe("deleted");
      expect((findings[0] as any).routeId).toBe("/deprecated");
    });
  });
});
