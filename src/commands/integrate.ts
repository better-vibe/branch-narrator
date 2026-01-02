/**
 * integrate command implementation.
 * Generates provider-specific rules (e.g., Cursor, Jules).
 */

import { mkdir, writeFile, access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BranchNarratorError } from "../core/errors.js";
import type { IntegrateOptions, Provider, FileOperation } from "./integrate/types.js";
import { cursorProvider } from "./integrate/providers/cursor.js";
import { julesProvider } from "./integrate/providers/jules.js";

// ============================================================================
// Registry
// ============================================================================

const providers: Record<string, Provider> = {
  cursor: cursorProvider,
  jules: julesProvider,
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

// ============================================================================
// Command Handler
// ============================================================================

/**
 * Execute the integrate command.
 */
export async function executeIntegrate(options: IntegrateOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const provider = providers[options.target];

  // Validate target
  if (!provider) {
    throw new BranchNarratorError(
      `Unknown integration target: ${options.target}\n` +
        `Supported targets: ${Object.keys(providers).join(", ")}`,
      1
    );
  }

  // Generate file operations
  const operations = await provider.generate(cwd);

  // Dry run mode
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

  // Write files
  console.log(`Integration for ${provider.name}:`);
  await writeRuleFiles(operations, cwd, options.force);
}
