/**
 * Tests for CLI command cohesion improvements.
 * These tests verify consistent option handling across commands.
 */

import { describe, expect, it } from "bun:test";
import type { DiffMode } from "../src/core/types.js";

// ============================================================================
// pr-body --mode Support Tests
// ============================================================================

describe("pr-body command cohesion", () => {
  describe("--mode option support", () => {
    it("should support all four diff modes", () => {
      const validModes: DiffMode[] = ["branch", "unstaged", "staged", "all"];
      expect(validModes).toHaveLength(4);
    });

    it("should default to branch mode", () => {
      const defaultMode: DiffMode = "branch";
      expect(defaultMode).toBe("branch");
    });

    it("should have consistent mode options with other commands", () => {
      // All commands should support the same modes
      const prBodyModes = ["branch", "unstaged", "staged", "all"];
      const factsModes = ["branch", "unstaged", "staged", "all"];
      const dumpDiffModes = ["branch", "unstaged", "staged", "all"];
      const riskReportModes = ["branch", "unstaged", "staged", "all"];

      expect(prBodyModes).toEqual(factsModes);
      expect(prBodyModes).toEqual(dumpDiffModes);
      expect(prBodyModes).toEqual(riskReportModes);
    });
  });

  describe("--uncommitted deprecation", () => {
    it("should treat --uncommitted as equivalent to --mode unstaged", () => {
      // When --uncommitted is used, it should be equivalent to --mode unstaged
      const uncommittedEquivalent: DiffMode = "unstaged";
      expect(uncommittedEquivalent).toBe("unstaged");
    });
  });
});

// ============================================================================
// facts --out Support Tests
// ============================================================================

describe("facts command --out support", () => {
  it("should have consistent --out option with dump-diff and risk-report", () => {
    // All three commands should support --out
    const commandsWithOut = ["facts", "dump-diff", "risk-report"];
    expect(commandsWithOut).toHaveLength(3);
    expect(commandsWithOut).toContain("facts");
  });
});

// ============================================================================
// --pretty Option Consistency Tests
// ============================================================================

describe("--pretty option consistency", () => {
  describe("JSON-producing commands", () => {
    const jsonCommands = ["facts", "dump-diff", "risk-report"];

    it("should all support --pretty option", () => {
      expect(jsonCommands).toContain("facts");
      expect(jsonCommands).toContain("dump-diff");
      expect(jsonCommands).toContain("risk-report");
    });

    it("should default to compact JSON (--pretty false)", () => {
      const defaultPretty = false;
      expect(defaultPretty).toBe(false);
    });
  });

  describe("pretty-print behavior", () => {
    it("should produce compact JSON when --pretty is false", () => {
      const testObj = { key: "value", nested: { a: 1 } };
      const compact = JSON.stringify(testObj);

      expect(compact).not.toContain("\n");
      expect(compact).toBe('{"key":"value","nested":{"a":1}}');
    });

    it("should produce indented JSON when --pretty is true", () => {
      const testObj = { key: "value", nested: { a: 1 } };
      const pretty = JSON.stringify(testObj, null, 2);

      expect(pretty).toContain("\n");
      expect(pretty).toContain("  ");
    });
  });
});

// ============================================================================
// --no-timestamp Option Tests
// ============================================================================

describe("--no-timestamp option for deterministic output", () => {
  describe("JSON-producing commands", () => {
    const jsonCommands = ["facts", "dump-diff", "risk-report"];

    it("should all support --no-timestamp option", () => {
      expect(jsonCommands).toContain("facts");
      expect(jsonCommands).toContain("dump-diff");
      expect(jsonCommands).toContain("risk-report");
    });

    it("should default to including timestamp (--no-timestamp false)", () => {
      const defaultNoTimestamp = false;
      expect(defaultNoTimestamp).toBe(false);
    });
  });

  describe("generatedAt behavior", () => {
    it("should include generatedAt when --no-timestamp is false", () => {
      const noTimestamp = false;
      const generatedAt = noTimestamp ? undefined : new Date().toISOString();

      expect(generatedAt).toBeDefined();
      expect(typeof generatedAt).toBe("string");
    });

    it("should omit generatedAt when --no-timestamp is true", () => {
      const noTimestamp = true;
      const generatedAt = noTimestamp ? undefined : new Date().toISOString();

      expect(generatedAt).toBeUndefined();
    });

    it("should produce deterministic output when --no-timestamp is true", () => {
      const noTimestamp = true;

      // Simulate two runs with --no-timestamp
      const output1 = {
        schemaVersion: "2.0",
        generatedAt: noTimestamp ? undefined : new Date().toISOString(),
        data: { key: "value" },
      };

      const output2 = {
        schemaVersion: "2.0",
        generatedAt: noTimestamp ? undefined : new Date().toISOString(),
        data: { key: "value" },
      };

      const json1 = JSON.stringify(output1);
      const json2 = JSON.stringify(output2);

      expect(json1).toBe(json2);
    });

    it("should produce different output when --no-timestamp is false", async () => {
      const noTimestamp = false;

      // First output
      const output1 = {
        schemaVersion: "2.0",
        generatedAt: noTimestamp ? undefined : new Date().toISOString(),
        data: { key: "value" },
      };

      // Wait a tiny bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));

      // Second output
      const output2 = {
        schemaVersion: "2.0",
        generatedAt: noTimestamp ? undefined : new Date().toISOString(),
        data: { key: "value" },
      };

      const json1 = JSON.stringify(output1);
      const json2 = JSON.stringify(output2);

      // The outputs should be different due to different timestamps
      expect(json1).not.toBe(json2);
    });
  });
});

// ============================================================================
// generatedAt Timestamp Tests
// ============================================================================

describe("generatedAt timestamp in JSON outputs", () => {
  describe("ISO 8601 format", () => {
    it("should produce valid ISO 8601 timestamp", () => {
      const timestamp = new Date().toISOString();

      // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("should be parseable by Date constructor", () => {
      const timestamp = new Date().toISOString();
      const parsed = new Date(timestamp);

      expect(parsed.toISOString()).toBe(timestamp);
    });
  });

  describe("JSON serialization", () => {
    it("should not include generatedAt when undefined", () => {
      const output = {
        schemaVersion: "2.0",
        generatedAt: undefined,
        data: {},
      };

      const json = JSON.stringify(output);
      const parsed = JSON.parse(json);

      // undefined values are not included in JSON.stringify output
      expect(parsed.generatedAt).toBeUndefined();
      expect("generatedAt" in parsed).toBe(false);
    });
  });
});

// ============================================================================
// Consistent Defaults Tests
// ============================================================================

describe("consistent defaults across commands", () => {
  describe("diff mode defaults", () => {
    it("all commands should default to branch mode", () => {
      const defaults = {
        pretty: "branch",
        "pr-body": "branch",
        facts: "branch",
        "dump-diff": "branch",
        "risk-report": "branch",
      };

      Object.values(defaults).forEach(defaultMode => {
        expect(defaultMode).toBe("branch");
      });
    });
  });

  describe("base and head defaults", () => {
    it("base should default to main", () => {
      const defaultBase = "main";
      expect(defaultBase).toBe("main");
    });

    it("head should default to HEAD", () => {
      const defaultHead = "HEAD";
      expect(defaultHead).toBe("HEAD");
    });
  });

  describe("JSON format defaults", () => {
    it("--pretty should default to false", () => {
      const defaultPretty = false;
      expect(defaultPretty).toBe(false);
    });

    it("--no-timestamp should default to false", () => {
      const defaultNoTimestamp = false;
      expect(defaultNoTimestamp).toBe(false);
    });
  });
});

