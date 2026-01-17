/**
 * integrate command implementation.
 * Generates provider-specific rules (e.g., Cursor, Jules).
 */

import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BranchNarratorError } from "../core/errors.js";
import type { IntegrateOptions, Provider, FileOperation } from "./integrate/types.js";
import { claudeProvider } from "./integrate/providers/claude.js";
import { cursorProvider } from "./integrate/providers/cursor.js";
import { julesRulesProvider } from "./integrate/providers/jules-rules.js";
import { julesProvider } from "./integrate/providers/jules.js";
import { opencodeProvider } from "./integrate/providers/opencode.js";

// ============================================================================
// Registry
// ============================================================================

const providers: Record<string, Provider> = {
  cursor: cursorProvider,
  jules: julesProvider,
  claude: claudeProvider,
  "jules-rules": julesRulesProvider,
  opencode: opencodeProvider,
};

export { generateCursorRules } from "./integrate/commands/legacy_stub.js"; // For backward compatibility if needed, or remove

export type { IntegrateOptions };

// ============================================================================
// File System Operations
// ============================================================================

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Write rule files to disk using generic "Append by Default" strategy.
 */
async function writeRuleFiles(
  operations: FileOperation[],
  cwd: string,
  force: boolean
): Promise<void> {
  for (const op of operations) {
    const fullPath = join(cwd, op.path);
    const exists = await fileExists(fullPath);

    await mkdir(dirname(fullPath), { recursive: true });

    if (exists && !force) {
      // Append strategy
      const existingContent = await readFile(fullPath, "utf-8");

      // Ensure newline separator if needed
      const separator = existingContent.endsWith("\n") ? "" : "\n";
      const newContent = existingContent + separator + op.content;

      await writeFile(fullPath, newContent, "utf-8");
      console.log(`  - ${op.path} (appended)`);
    } else {
      // Create or Overwrite (if force=true) strategy
      await writeFile(fullPath, op.content, "utf-8");
      const action = exists ? "overwritten" : "created";
      console.log(`  - ${op.path} (${action})`);
    }
  }
}

async function runIntegration(
  provider: Provider,
  options: IntegrateOptions,
  cwd: string
): Promise<void> {
  const operations = await provider.generate(cwd);

  if (options.dryRun) {
    console.log("=".repeat(80));
    console.log(`DRY RUN: Integration for ${provider.name}`);
    console.log("=".repeat(80));
    console.log();

    for (const op of operations) {
      console.log(`File: ${op.path}`);
      console.log("-".repeat(80));
      console.log(op.content);
      console.log("-".repeat(80));
      console.log();
    }
    return;
  }

  console.log(`Integration for ${provider.name}:`);
  await writeRuleFiles(operations, cwd, options.force);
}

async function detectTargets(cwd: string): Promise<string[]> {
  const detected: string[] = [];

  for (const [target, provider] of Object.entries(providers)) {
    if (!provider.detect) {
      continue;
    }

    try {
      if (await provider.detect(cwd)) {
        detected.push(target);
      }
    } catch {
      // Ignore detection failures and keep scanning.
    }
  }

  return detected;
}

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Execute the integrate command.
 */
export async function executeIntegrate(options: IntegrateOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const supportedTargets = Object.keys(providers);

  if (!options.target) {
    const detectedTargets = await detectTargets(cwd);

    if (detectedTargets.length === 0) {
      console.log("No supported agent guide files detected in this repo.");
      console.log(
        `Run "branch-narrator integrate <target>" with one of: ${supportedTargets.join(", ")}`
      );
      return;
    }

    console.log(`Auto-detected guides: ${detectedTargets.join(", ")}`);

    for (const target of detectedTargets) {
      const provider = providers[target];
      await runIntegration(provider, options, cwd);
    }

    return;
  }

  const provider = providers[options.target];

  // Validate target
  if (!provider) {
    throw new BranchNarratorError(
      `Unknown integration target: ${options.target}\n` +
        `Supported targets: ${supportedTargets.join(", ")}`,
      1
    );
  }

  await runIntegration(provider, options, cwd);
}
