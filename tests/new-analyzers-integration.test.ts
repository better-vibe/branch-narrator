/**
 * Integration test for all 5 new analyzers (Drizzle, TanStack Query, tRPC, Svelte 5 Runes, RSC Boundary)
 */

import { describe, it, expect } from "bun:test";
import {
  drizzleAnalyzer,
  tanstackQueryAnalyzer,
  trpcRouterAnalyzer,
  svelte5RunesAnalyzer,
  rscBoundaryAnalyzer,
} from "../src/analyzers/index.js";

describe("New Analyzers Integration", () => {
  it("exports all 5 new analyzers", () => {
    expect(drizzleAnalyzer).toBeDefined();
    expect(drizzleAnalyzer.name).toBe("drizzle");
    expect(tanstackQueryAnalyzer).toBeDefined();
    expect(tanstackQueryAnalyzer.name).toBe("tanstack-query");
    expect(trpcRouterAnalyzer).toBeDefined();
    expect(trpcRouterAnalyzer.name).toBe("trpc-router");
    expect(svelte5RunesAnalyzer).toBeDefined();
    expect(svelte5RunesAnalyzer.name).toBe("svelte5-runes");
    expect(rscBoundaryAnalyzer).toBeDefined();
    expect(rscBoundaryAnalyzer.name).toBe("rsc-boundary");
  });
});
