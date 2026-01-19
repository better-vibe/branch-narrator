/**
 * Tests for Python dependencies analyzer.
 */

import { describe, it, expect } from "bun:test";
import { pythonDependenciesAnalyzer, isPythonDependencyFile, getDependencyFileType } from "../src/analyzers/python-dependencies.js";
import { createChangeSet, createFileDiff, createFileChange } from "./fixtures/index.js";

describe("pythonDependenciesAnalyzer", () => {
  describe("isPythonDependencyFile", () => {
    it("should detect requirements.txt", () => {
      expect(isPythonDependencyFile("requirements.txt")).toBe(true);
      expect(isPythonDependencyFile("requirements-dev.txt")).toBe(true);
      expect(isPythonDependencyFile("requirements-test.txt")).toBe(true);
    });

    it("should detect pyproject.toml", () => {
      expect(isPythonDependencyFile("pyproject.toml")).toBe(true);
    });

    it("should detect setup.py and setup.cfg", () => {
      expect(isPythonDependencyFile("setup.py")).toBe(true);
      expect(isPythonDependencyFile("setup.cfg")).toBe(true);
    });

    it("should detect Pipfile", () => {
      expect(isPythonDependencyFile("Pipfile")).toBe(true);
      expect(isPythonDependencyFile("Pipfile.lock")).toBe(true);
    });

    it("should detect poetry.lock", () => {
      expect(isPythonDependencyFile("poetry.lock")).toBe(true);
    });

    it("should not detect non-Python files", () => {
      expect(isPythonDependencyFile("package.json")).toBe(false);
      expect(isPythonDependencyFile("main.py")).toBe(false);
    });
  });

  describe("getDependencyFileType", () => {
    it("should return correct type for requirements files", () => {
      expect(getDependencyFileType("requirements.txt")).toBe("requirements");
      expect(getDependencyFileType("requirements-dev.txt")).toBe("requirements");
    });

    it("should return correct type for pyproject.toml", () => {
      expect(getDependencyFileType("pyproject.toml")).toBe("pyproject");
    });

    it("should return correct type for setup files", () => {
      expect(getDependencyFileType("setup.py")).toBe("setup");
      expect(getDependencyFileType("setup.cfg")).toBe("setup");
    });

    it("should return correct type for Pipfile", () => {
      expect(getDependencyFileType("Pipfile")).toBe("pipfile");
    });

    it("should return correct type for poetry.lock", () => {
      expect(getDependencyFileType("poetry.lock")).toBe("poetry");
    });
  });

  describe("analyze", () => {
    it("should detect added packages in requirements.txt", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("requirements.txt", "modified")],
        diffs: [
          createFileDiff("requirements.txt", [
            "django==4.2.0",
            "fastapi>=0.100.0",
            "sqlalchemy[asyncio]~=2.0.0",
          ]),
        ],
      });

      const findings = pythonDependenciesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(3);
      expect(findings[0].type).toBe("dependency-change");
      expect((findings[0] as any).name).toBe("django");
      expect((findings[0] as any).to).toBe("4.2.0");
      expect((findings[0] as any).riskCategory).toBe("database");
    });

    it("should detect removed packages", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("requirements.txt", "modified")],
        diffs: [
          createFileDiff("requirements.txt", [], ["flask==2.0.0"]),
        ],
      });

      const findings = pythonDependenciesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect(findings[0].type).toBe("dependency-change");
      expect((findings[0] as any).name).toBe("flask");
      expect((findings[0] as any).impact).toBe("removed");
    });

    it("should detect version updates", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("requirements.txt", "modified")],
        diffs: [
          createFileDiff(
            "requirements.txt",
            ["django==5.0.0"],
            ["django==4.2.0"]
          ),
        ],
      });

      const findings = pythonDependenciesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).name).toBe("django");
      expect((findings[0] as any).from).toBe("4.2.0");
      expect((findings[0] as any).to).toBe("5.0.0");
      expect((findings[0] as any).impact).toBe("major");
    });

    it("should detect risky packages", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("requirements.txt", "modified")],
        diffs: [
          createFileDiff("requirements.txt", [
            "stripe==5.0.0",
            "pyjwt==2.8.0",
            "cryptography==41.0.0",
          ]),
        ],
      });

      const findings = pythonDependenciesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(3);
      expect((findings[0] as any).riskCategory).toBe("payment");
      expect((findings[1] as any).riskCategory).toBe("auth");
      expect((findings[2] as any).riskCategory).toBe("native");
    });

    it("should handle pyproject.toml", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("pyproject.toml", "modified")],
        diffs: [
          createFileDiff("pyproject.toml", [
            '"fastapi>=0.100.0"',
            '"sqlalchemy>=2.0.0"',
          ]),
        ],
      });

      const findings = pythonDependenciesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(2);
      expect((findings[0] as any).name).toBe("fastapi");
      expect((findings[1] as any).name).toBe("sqlalchemy");
    });

    it("should skip comments and blank lines", () => {
      const changeSet = createChangeSet({
        files: [createFileChange("requirements.txt", "modified")],
        diffs: [
          createFileDiff("requirements.txt", [
            "# This is a comment",
            "",
            "-r base.txt",
            "flask==2.0.0",
          ]),
        ],
      });

      const findings = pythonDependenciesAnalyzer.analyze(changeSet);

      expect(findings.length).toBe(1);
      expect((findings[0] as any).name).toBe("flask");
    });
  });
});
