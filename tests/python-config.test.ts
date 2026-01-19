/**
 * Tests for Python config analyzer.
 */

import { describe, it, expect } from "bun:test";
import { pythonConfigAnalyzer, isPythonConfigFile, getConfigInfo } from "../src/analyzers/python-config.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("pythonConfigAnalyzer", () => {
  describe("isPythonConfigFile", () => {
    it("should detect pyproject.toml", () => {
      expect(isPythonConfigFile("pyproject.toml")).toBe(true);
    });

    it("should detect setup files", () => {
      expect(isPythonConfigFile("setup.py")).toBe(true);
      expect(isPythonConfigFile("setup.cfg")).toBe(true);
    });

    it("should detect test config files", () => {
      expect(isPythonConfigFile("tox.ini")).toBe(true);
      expect(isPythonConfigFile("pytest.ini")).toBe(true);
      expect(isPythonConfigFile("conftest.py")).toBe(true);
      expect(isPythonConfigFile(".coveragerc")).toBe(true);
    });

    it("should detect type checking config files", () => {
      expect(isPythonConfigFile("mypy.ini")).toBe(true);
      expect(isPythonConfigFile(".mypy.ini")).toBe(true);
      expect(isPythonConfigFile("pyrightconfig.json")).toBe(true);
    });

    it("should detect linting config files", () => {
      expect(isPythonConfigFile(".flake8")).toBe(true);
      expect(isPythonConfigFile(".pylintrc")).toBe(true);
      expect(isPythonConfigFile("ruff.toml")).toBe(true);
      expect(isPythonConfigFile(".ruff.toml")).toBe(true);
    });

    it("should detect pre-commit config", () => {
      expect(isPythonConfigFile(".pre-commit-config.yaml")).toBe(true);
    });

    it("should not detect non-config files", () => {
      expect(isPythonConfigFile("main.py")).toBe(false);
      expect(isPythonConfigFile("requirements.txt")).toBe(false);
    });
  });

  describe("getConfigInfo", () => {
    it("should return correct info for pyproject.toml", () => {
      const info = getConfigInfo("pyproject.toml");
      expect(info).toEqual({ configType: "pyproject", category: "build" });
    });

    it("should return correct info for tox.ini", () => {
      const info = getConfigInfo("tox.ini");
      expect(info).toEqual({ configType: "tox", category: "testing" });
    });

    it("should return correct info for mypy.ini", () => {
      const info = getConfigInfo("mypy.ini");
      expect(info).toEqual({ configType: "mypy", category: "typing" });
    });

    it("should return correct info for .flake8", () => {
      const info = getConfigInfo(".flake8");
      expect(info).toEqual({ configType: "flake8", category: "linting" });
    });

    it("should return null for non-config files", () => {
      const info = getConfigInfo("main.py");
      expect(info).toBe(null);
    });
  });

  describe("analyze", () => {
    it("should detect pyproject.toml changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("pyproject.toml", "modified")],
        diffs: [
          createFileDiff("pyproject.toml", [
            "[tool.poetry]",
            'name = "my-package"',
            'version = "1.0.0"',
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect(findings[0].type).toBe("python-config");
      expect((findings[0] as any).configType).toBe("pyproject");
      expect((findings[0] as any).configCategory).toBe("build");
    });

    it("should detect breaking changes in pyproject.toml", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("pyproject.toml", "modified")],
        diffs: [
          createFileDiff("pyproject.toml", [
            "[project]",
            'requires-python = ">=3.10"',
            "[build-system]",
            'requires = ["setuptools>=61.0"]',
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).isBreaking).toBe(true);
      expect((findings[0] as any).breakingReasons.length).toBeGreaterThan(0);
    });

    it("should detect affected sections", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("pyproject.toml", "modified")],
        diffs: [
          createFileDiff("pyproject.toml", [
            "[tool.pytest.ini_options]",
            'testpaths = ["tests"]',
            "[tool.ruff]",
            'line-length = 100',
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect((findings[0] as any).affectedSections).toContain("tool.pytest.ini_options");
      expect((findings[0] as any).affectedSections).toContain("tool.ruff");
    });

    it("should detect tox.ini changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("tox.ini", "modified")],
        diffs: [
          createFileDiff("tox.ini", [
            "[tox]",
            "envlist = py39,py310,py311",
            "[testenv]",
            "deps = pytest",
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).configType).toBe("tox");
      expect((findings[0] as any).configCategory).toBe("testing");
    });

    it("should detect mypy.ini changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("mypy.ini", "modified")],
        diffs: [
          createFileDiff("mypy.ini", [
            "[mypy]",
            "strict = true",
            "warn_return_any = true",
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).configType).toBe("mypy");
      expect((findings[0] as any).configCategory).toBe("typing");
    });

    it("should detect ruff.toml changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("ruff.toml", "modified")],
        diffs: [
          createFileDiff("ruff.toml", [
            "[lint]",
            'select = ["E", "F", "W"]',
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).configType).toBe("ruff");
      expect((findings[0] as any).configCategory).toBe("linting");
    });

    it("should detect pre-commit config changes", () => {
      const changeSet = createChangeSet({
        files: [createFileChange(".pre-commit-config.yaml", "modified")],
        diffs: [
          createFileDiff(".pre-commit-config.yaml", [
            "repos:",
            "  - repo: https://github.com/pre-commit/pre-commit-hooks",
          ]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).configType).toBe("pre-commit");
      expect((findings[0] as any).configCategory).toBe("hooks");
    });

    it("should handle multiple config files", () => {
      const changeSet = createChangeSet({
        files: [
          createFileChange("pyproject.toml", "modified"),
          createFileChange("tox.ini", "added"),
          createFileChange(".flake8", "modified"),
        ],
        diffs: [
          createFileDiff("pyproject.toml", ["[project]"]),
          createFileDiff("tox.ini", ["[tox]"], [], "added"),
          createFileDiff(".flake8", ["[flake8]"]),
        ],
      });

      const findings = pythonConfigAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(3);
      const configTypes = findings.map((f: any) => f.configType);
      expect(configTypes).toContain("pyproject");
      expect(configTypes).toContain("tox");
      expect(configTypes).toContain("flake8");
    });
  });
});
