import { describe, expect, it } from "bun:test";
import * as api from "../src/index.ts";

describe("public API exports", () => {
  it("exports runAnalyzersInParallel", () => {
    expect(typeof api.runAnalyzersInParallel).toBe("function");
  });
});
