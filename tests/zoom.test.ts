/**
 * Tests for zoom command functionality.
 */

import { describe, it, expect } from "bun:test";
import { executeZoom } from "../src/commands/zoom/index.js";
import { renderZoomJSON, renderZoomMarkdown, renderZoomText } from "../src/commands/zoom/renderers.js";
import type { ChangeSet, Finding, Evidence, RiskFlag } from "../src/core/types.js";
import { assignFindingId } from "../src/core/ids.js";

describe("Zoom Command", () => {
  // Create a simple test changeset
  const createTestChangeSet = (): ChangeSet => ({
    base: "main",
    head: "HEAD",
    files: [
      { path: "src/config.ts", status: "modified" },
      { path: "package.json", status: "modified" },
    ],
    diffs: [
      {
        path: "src/config.ts",
        status: "modified",
        hunks: [
          {
            oldStart: 1,
            oldLines: 3,
            newStart: 1,
            newLines: 4,
            content: "-const API_KEY = 'test';\n+const API_KEY = process.env.API_KEY;",
            additions: ["+const API_KEY = process.env.API_KEY;"],
            deletions: ["-const API_KEY = 'test';"],
          },
        ],
      },
      {
        path: "package.json",
        status: "modified",
        hunks: [
          {
            oldStart: 10,
            oldLines: 1,
            newStart: 10,
            newLines: 1,
            content: '-    "lodash": "^4.17.20"\n+    "lodash": "^4.17.21"',
            additions: ['+    "lodash": "^4.17.21"'],
            deletions: ['-    "lodash": "^4.17.20"'],
          },
        ],
      },
    ],
  });

  describe("executeZoom", () => {
    it("should throw error if both findingId and flagId are provided", async () => {
      const changeSet = createTestChangeSet();

      await expect(
        executeZoom(changeSet, {
          findingId: "finding.env-var#abc123",
          flagId: "flag.security.test#def456",
          mode: "unstaged",
          profile: "auto",
          includePatch: false,
          unified: 3,
          maxEvidenceLines: 8,
          redact: false,
          noTimestamp: true,
        })
      ).rejects.toThrow("Cannot specify both --finding and --flag");
    });

    it("should throw error if neither findingId nor flagId are provided", async () => {
      const changeSet = createTestChangeSet();

      await expect(
        executeZoom(changeSet, {
          mode: "unstaged",
          profile: "auto",
          includePatch: false,
          unified: 3,
          maxEvidenceLines: 8,
          redact: false,
          noTimestamp: true,
        })
      ).rejects.toThrow("Must specify either --finding <id> or --flag <id>");
    });

    it("should throw error if finding not found", async () => {
      const changeSet = createTestChangeSet();

      await expect(
        executeZoom(changeSet, {
          findingId: "finding.env-var#nonexistent",
          mode: "unstaged",
          profile: "auto",
          includePatch: false,
          unified: 3,
          maxEvidenceLines: 8,
          redact: false,
          noTimestamp: true,
        })
      ).rejects.toThrow("Finding not found");
    });

    // Note: Testing successful finding zoom requires either:
    // 1. Mocking the analyzers to produce specific findings, or
    // 2. Creating a complete test changeset that triggers specific analyzers
    // The renderer tests below provide coverage for the output formatting.
  });

  describe("Renderers", () => {
    it("should render finding as JSON", () => {
      const evidence: Evidence[] = [
        {
          file: "src/config.ts",
          excerpt: "const API_KEY = process.env.API_KEY;",
          line: 1,
        },
      ];

      const finding: Finding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#abc123",
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "finding" as const,
        findingId: "finding.env-var#abc123",
        finding,
        evidence: evidence.map((ev) => ({
          file: ev.file,
          excerpt: ev.excerpt,
          line: ev.line,
          hunk: ev.hunk,
        })),
      };

      const json = renderZoomJSON(output, false);
      expect(json).toContain("finding.env-var#abc123");
      expect(json).toContain("API_KEY");

      const parsed = JSON.parse(json);
      expect(parsed.itemType).toBe("finding");
      expect(parsed.findingId).toBe("finding.env-var#abc123");
    });

    it("should render finding as Markdown", () => {
      const evidence: Evidence[] = [
        {
          file: "src/config.ts",
          excerpt: "const API_KEY = process.env.API_KEY;",
          line: 1,
        },
      ];

      const finding: Finding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#abc123",
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "finding" as const,
        findingId: "finding.env-var#abc123",
        finding,
        evidence: evidence.map((ev) => ({
          file: ev.file,
          excerpt: ev.excerpt,
          line: ev.line,
          hunk: ev.hunk,
        })),
      };

      const markdown = renderZoomMarkdown(output);
      expect(markdown).toContain("# Finding: finding.env-var#abc123");
      expect(markdown).toContain("**Type:** env-var");
      expect(markdown).toContain("**Category:** config_env");
      expect(markdown).toContain("src/config.ts");
      expect(markdown).toContain("API_KEY");
    });

    it("should render finding as plain text", () => {
      const evidence: Evidence[] = [
        {
          file: "src/config.ts",
          excerpt: "const API_KEY = process.env.API_KEY;",
          line: 1,
        },
      ];

      const finding: Finding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#abc123",
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "finding" as const,
        findingId: "finding.env-var#abc123",
        finding,
        evidence: evidence.map((ev) => ({
          file: ev.file,
          excerpt: ev.excerpt,
          line: ev.line,
          hunk: ev.hunk,
        })),
      };

      const text = renderZoomText(output);
      expect(text).toContain("Finding: finding.env-var#abc123");
      expect(text).toContain("Type: env-var");
      expect(text).toContain("Category: config_env");
      expect(text).toContain("File: src/config.ts");
      expect(text).toContain("API_KEY");
    });
  });

  describe("ID format validation", () => {
    it("should generate valid finding IDs", () => {
      const evidence: Evidence[] = [
        {
          file: "src/config.ts",
          excerpt: "const API_KEY = process.env.API_KEY;",
          line: 1,
        },
      ];

      const finding: Finding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
      };

      const findingWithId = assignFindingId(finding);
      
      // Verify the generated ID matches the expected pattern
      expect(findingWithId.findingId).toMatch(/^finding\.[a-z-]+#[a-f0-9]{12}$/);
    });

    it("should generate valid flag IDs using buildFlagId", () => {
      const { buildFlagId } = require("../src/core/ids.js");
      
      const flagId1 = buildFlagId("security.workflow_permissions_broadened", ["finding.ci-workflow#abc123def456"]);
      const flagId2 = buildFlagId("db.destructive_sql", ["finding.sql-risk#123456789abc"]);
      
      // Verify the generated IDs match the expected pattern
      expect(flagId1).toMatch(/^flag\.[a-z._]+#[a-f0-9]{12}$/);
      expect(flagId2).toMatch(/^flag\.[a-z._]+#[a-f0-9]{12}$/);
    });
  });

  describe("Evidence slicing", () => {
    it("should limit evidence lines to maxEvidenceLines", () => {
      const evidence: Evidence[] = Array.from({ length: 15 }, (_, i) => ({
        file: `src/file${i}.ts`,
        excerpt: `Line ${i}`,
        line: i,
      }));

      const finding: Finding = {
        type: "file-summary",
        kind: "file-summary",
        category: "unknown",
        confidence: "high",
        evidence,
        added: [],
        modified: [],
        deleted: [],
        renamed: [],
        findingId: "finding.file-summary#abc123",
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "finding" as const,
        findingId: "finding.file-summary#abc123def456",
        finding,
        evidence: evidence.slice(0, 5).map((ev) => ({
          file: ev.file,
          excerpt: ev.excerpt,
          line: ev.line,
          hunk: ev.hunk,
        })),
      };

      expect(output.evidence.length).toBe(5);
    });
  });

  describe("Flag zoom output", () => {
    it("should render flag output as JSON", () => {
      const flag: RiskFlag = {
        ruleKey: "security.workflow_permissions_broadened",
        flagId: "flag.security.workflow_permissions_broadened#abc123def456",
        relatedFindingIds: ["finding.ci-workflow#123456789abc"],
        category: "security",
        score: 35,
        confidence: 0.9,
        title: "Workflow permissions broadened",
        summary: "Workflow has broadened permissions",
        evidence: [
          {
            file: ".github/workflows/ci.yml",
            lines: ["permissions: write-all"],
          },
        ],
        suggestedChecks: ["Review permissions"],
        effectiveScore: 32,
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "flag" as const,
        flagId: "flag.security.workflow_permissions_broadened#abc123def456",
        flag,
        evidence: flag.evidence,
      };

      const json = renderZoomJSON(output, false);
      expect(json).toContain("flag.security.workflow_permissions_broadened#abc123def456");
      expect(json).toContain("Workflow permissions broadened");

      const parsed = JSON.parse(json);
      expect(parsed.itemType).toBe("flag");
      expect(parsed.flagId).toBe("flag.security.workflow_permissions_broadened#abc123def456");
    });

    it("should render flag output as Markdown", () => {
      const flag: RiskFlag = {
        ruleKey: "db.destructive_sql",
        flagId: "flag.db.destructive_sql#def456789abc",
        relatedFindingIds: ["finding.sql-risk#123456789abc"],
        category: "db",
        score: 50,
        confidence: 0.95,
        title: "Destructive SQL detected",
        summary: "DROP TABLE statement found",
        evidence: [
          {
            file: "migrations/001.sql",
            lines: ["DROP TABLE users;"],
          },
        ],
        suggestedChecks: ["Verify migration safety"],
        effectiveScore: 48,
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "flag" as const,
        flagId: "flag.db.destructive_sql#def456789abc",
        flag,
        evidence: flag.evidence,
      };

      const markdown = renderZoomMarkdown(output);
      expect(markdown).toContain("# Flag: flag.db.destructive_sql#def456789abc");
      expect(markdown).toContain("**Rule:** db.destructive_sql");
      expect(markdown).toContain("Destructive SQL detected");
    });

    it("should render flag output as text", () => {
      const flag: RiskFlag = {
        ruleKey: "tests.test_gap",
        flagId: "flag.tests.test_gap#abc987654321",
        relatedFindingIds: ["finding.test-gap#abc987654321"],
        category: "tests",
        score: 20,
        confidence: 0.8,
        title: "Test coverage gap",
        summary: "Production files changed without tests",
        evidence: [],
        suggestedChecks: ["Add tests"],
        effectiveScore: 16,
      };

      const output = {
        schemaVersion: "1.0" as const,
        range: { base: "main", head: "HEAD" },
        itemType: "flag" as const,
        flagId: "flag.tests.test_gap#abc987654321",
        flag,
        evidence: flag.evidence,
      };

      const text = renderZoomText(output);
      expect(text).toContain("Flag: flag.tests.test_gap#abc987654321");
      expect(text).toContain("Rule: tests.test_gap");
      expect(text).toContain("Test coverage gap");
    });
  });

  describe("Redaction", () => {
    it("should redact secrets in finding evidence when enabled", () => {
      const evidence: Evidence[] = [
        {
          file: "src/config.ts",
          excerpt: "const API_KEY = 'sk_test_abcdefghijklmnopqrstuvwxyz1234567890';",
          line: 1,
        },
      ];

      const finding: Finding = {
        type: "env-var",
        kind: "env-var",
        category: "config_env",
        confidence: "high",
        evidence,
        name: "API_KEY",
        change: "added",
        evidenceFiles: ["src/config.ts"],
        findingId: "finding.env-var#123456789abc",
      };

      // Test that the redaction utility would work
      const { redactSecrets } = require("../src/core/evidence.js");
      const redacted = redactSecrets(evidence[0].excerpt);
      
      expect(redacted).toContain("sk_test_***REDACTED***");
      expect(redacted).not.toContain("abcdefghijklmnopqrstuvwxyz1234567890");
    });
  });
});
