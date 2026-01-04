/**
 * Tests for logger module.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  configureLogger,
  getLoggerState,
  resetLogger,
  warn,
  info,
  debug,
  error as logError,
} from "../src/core/logger.js";

// Mock console.error to capture output
let capturedOutput: string[] = [];
const originalConsoleError = console.error;

function mockConsoleError() {
  console.error = (...args: any[]) => {
    capturedOutput.push(args.join(" "));
  };
}

function restoreConsoleError() {
  console.error = originalConsoleError;
}

describe("Logger", () => {
  beforeEach(() => {
    resetLogger();
    capturedOutput = [];
    mockConsoleError();
  });

  afterEach(() => {
    restoreConsoleError();
  });

  describe("configureLogger", () => {
    it("should set quiet flag", () => {
      configureLogger({ quiet: true });
      const state = getLoggerState();
      expect(state.quiet).toBe(true);
      expect(state.debug).toBe(false);
    });

    it("should set debug flag", () => {
      configureLogger({ debug: true });
      const state = getLoggerState();
      expect(state.quiet).toBe(false);
      expect(state.debug).toBe(true);
    });

    it("should prioritize quiet over debug", () => {
      configureLogger({ quiet: true, debug: true });
      const state = getLoggerState();
      expect(state.quiet).toBe(true);
      expect(state.debug).toBe(false);
    });
  });

  describe("warn", () => {
    it("should output warning by default", () => {
      warn("test warning");
      expect(capturedOutput).toEqual(["test warning"]);
    });

    it("should suppress warning with --quiet", () => {
      configureLogger({ quiet: true });
      warn("test warning");
      expect(capturedOutput).toEqual([]);
    });
  });

  describe("info", () => {
    it("should output info by default", () => {
      info("test info");
      expect(capturedOutput).toEqual(["test info"]);
    });

    it("should suppress info with --quiet", () => {
      configureLogger({ quiet: true });
      info("test info");
      expect(capturedOutput).toEqual([]);
    });
  });

  describe("debug", () => {
    it("should not output debug by default", () => {
      debug("test debug");
      expect(capturedOutput).toEqual([]);
    });

    it("should output debug with --debug", () => {
      configureLogger({ debug: true });
      debug("test debug");
      expect(capturedOutput).toEqual(["[DEBUG] test debug"]);
    });

    it("should suppress debug with --quiet even if --debug is set", () => {
      configureLogger({ quiet: true, debug: true });
      debug("test debug");
      expect(capturedOutput).toEqual([]);
    });
  });

  describe("error", () => {
    it("should output error by default", () => {
      logError("test error");
      expect(capturedOutput).toEqual(["test error"]);
    });

    it("should output error even with --quiet", () => {
      configureLogger({ quiet: true });
      logError("test error");
      expect(capturedOutput).toEqual(["test error"]);
    });
  });

  describe("resetLogger", () => {
    it("should reset to default state", () => {
      configureLogger({ quiet: true, debug: true });
      resetLogger();
      const state = getLoggerState();
      expect(state.quiet).toBe(false);
      expect(state.debug).toBe(false);
    });
  });
});
