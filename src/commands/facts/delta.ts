/**
 * Delta computation for facts --since feature.
 */

import type {
  FactsOutput,
  FactsDelta,
  Finding,
  FindingChange,
  ScopeMetadata,
} from "../../core/types.js";
import {
  loadJson,
  diffById,
  compareScopeMetadata,
  extractFactsScope,
} from "../../core/delta.js";
import { BranchNarratorError } from "../../core/errors.js";

/**
 * Options for computing facts delta.
 */
export interface ComputeFactsDeltaOptions {
  sincePath: string;
  currentFacts: FactsOutput;
  mode: string;
  base: string | null;
  head: string | null;
  profile: string;
  include: string[];
  exclude: string[];
  sinceStrict: boolean;
}

/**
 * Compute delta between current facts and a previous facts output.
 */
export async function computeFactsDelta(
  options: ComputeFactsDeltaOptions
): Promise<FactsDelta> {
  const {
    sincePath,
    currentFacts,
    mode,
    base,
    head,
    profile,
    include,
    exclude,
    sinceStrict,
  } = options;

  // Load previous facts
  let previousFacts: FactsOutput;
  try {
    previousFacts = await loadJson(sincePath);
  } catch (error) {
    throw new BranchNarratorError(
      `Failed to load previous facts from ${sincePath}: ${error}`,
      1
    );
  }

  // Validate it looks like a FactsOutput
  if (!previousFacts.schemaVersion || !previousFacts.findings) {
    throw new BranchNarratorError(
      `File ${sincePath} does not appear to be a valid facts output`,
      1
    );
  }

  // Extract version metadata
  const previousVersion = {
    toolVersion: "1.1.0", // TODO: Extract from package.json or build info
    schemaVersion: previousFacts.schemaVersion,
  };

  const currentVersion = {
    toolVersion: "1.1.0", // TODO: Extract from package.json or build info
    schemaVersion: currentFacts.schemaVersion,
  };

  // Build scope metadata for current run
  const currentScope: ScopeMetadata = {
    mode,
    base,
    head,
    profile,
    include,
    exclude,
  };

  // Extract scope from previous run
  const previousScope = extractFactsScope(previousFacts);

  // Compare scopes and generate warnings
  const warnings = compareScopeMetadata(previousScope, currentScope);

  // If strict mode and warnings exist, error out
  if (sinceStrict && warnings.length > 0) {
    throw new BranchNarratorError(
      `Scope mismatch detected (--since-strict): ${warnings.map(w => w.message).join("; ")}`,
      1
    );
  }

  // Compute delta
  const { added, removed, changed } = diffById({
    beforeItems: previousFacts.findings,
    afterItems: currentFacts.findings,
  });

  // Build FindingChange objects
  const findingChanges: FindingChange[] = changed.map(c => ({
    findingId: c.id,
    before: c.before as Finding,
    after: c.after as Finding,
  }));

  // Build command metadata
  const commandArgs = ["--mode", mode];
  if (base) commandArgs.push("--base", base);
  if (head) commandArgs.push("--head", head);
  commandArgs.push("--since", sincePath);
  if (sinceStrict) commandArgs.push("--since-strict");

  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    command: {
      name: "facts",
      args: commandArgs,
    },
    since: {
      path: sincePath,
      toolVersion: previousVersion.toolVersion,
      schemaVersion: previousVersion.schemaVersion,
    },
    current: currentVersion,
    scope: currentScope,
    warnings,
    delta: {
      added,
      removed,
      changed: findingChanges,
    },
    summary: {
      addedCount: added.length,
      removedCount: removed.length,
      changedCount: findingChanges.length,
    },
  };
}
