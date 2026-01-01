/**
 * branch-narrator CLI entry point.
 */

import { Command } from "commander";
import { createInterface } from "readline";
import ora from "ora";
import chalk from "chalk";
import { BranchNarratorError } from "./core/errors.js";
import type { DiffMode, Finding, ProfileName, RenderContext } from "./core/types.js";
import { executeDumpDiff } from "./commands/dump-diff/index.js";
import { collectChangeSet } from "./git/collector.js";
import { getProfile, resolveProfileName } from "./profiles/index.js";
import { aggregateFindingsByType, renderJson, renderMarkdown, renderTerminal } from "./render/index.js";
import { computeRiskScore } from "./render/risk-score.js";

const program = new Command();

program
  .name("branch-narrator")
  .description(
    "A local-first CLI that reads git diff and generates structured PR descriptions"
  )
  .version("0.1.0");

/**
 * Prompt user for input.
 */
async function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Run analysis with mode-based options.
 */
async function runAnalysisWithMode(options: {
  mode: DiffMode;
  base?: string;
  head?: string;
  profile: ProfileName;
  showSpinner?: boolean;
}): Promise<{ findings: Finding[]; resolvedProfile: ProfileName }> {
  const spinner = options.showSpinner
    ? ora({
        text: "Collecting git changes...",
        color: "cyan",
      }).start()
    : null;

  // Collect git data using mode-based options
  const changeSet = await collectChangeSet({
    mode: options.mode,
    base: options.base,
    head: options.head,
    includeUntracked: options.mode === "all",
  });

  if (spinner) {
    spinner.text = "Resolving profile...";
  }

  // Resolve profile
  const resolvedProfile = resolveProfileName(
    options.profile,
    changeSet,
    process.cwd()
  );
  const profile = getProfile(resolvedProfile);

  if (spinner) {
    spinner.text = `Running analyzers (${profile.analyzers.length})...`;
  }

  // Run analyzers
  const findings: Finding[] = [];
  for (const analyzer of profile.analyzers) {
    const analyzerFindings = analyzer.analyze(changeSet);
    findings.push(...analyzerFindings);
  }

  if (spinner) {
    spinner.succeed(
      chalk.green(`Analysis complete (${findings.length} findings)`)
    );
  }

  return { findings, resolvedProfile };
}

/**
 * Run analysis with legacy options (for pr-body command).
 */
async function runAnalysis(options: {
  base: string;
  head: string;
  profile: ProfileName;
  uncommitted?: boolean;
  showSpinner?: boolean;
}): Promise<{ findings: Finding[]; resolvedProfile: ProfileName }> {
  const spinner = options.showSpinner
    ? ora({
        text: "Collecting git changes...",
        color: "cyan",
      }).start()
    : null;

  // Collect git data
  const changeSet = await collectChangeSet({
    base: options.base,
    head: options.head,
    uncommitted: options.uncommitted,
  });

  if (spinner) {
    spinner.text = "Resolving profile...";
  }

  // Resolve profile
  const resolvedProfile = resolveProfileName(
    options.profile,
    changeSet,
    process.cwd()
  );
  const profile = getProfile(resolvedProfile);

  if (spinner) {
    spinner.text = `Running analyzers (${profile.analyzers.length})...`;
  }

  // Run analyzers
  const findings: Finding[] = [];
  for (const analyzer of profile.analyzers) {
    const analyzerFindings = analyzer.analyze(changeSet);
    findings.push(...analyzerFindings);
  }

  if (spinner) {
    spinner.succeed(
      chalk.green(`Analysis complete (${findings.length} findings)`)
    );
  }

  return { findings, resolvedProfile };
}

// pretty command - colorized terminal output for humans
program
  .command("pretty")
  .description("Display a colorized summary of changes (for humans)")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "branch"
  )
  .option("--base <ref>", "Base branch to compare against (branch mode)", "main")
  .option("--head <ref>", "Head branch (branch mode)", "HEAD")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit)",
    "auto"
  )
  .action(async (options) => {
    try {
      // Validate mode
      const mode = options.mode as DiffMode;
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        console.error(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      // Warn if base/head provided with non-branch mode
      if (mode !== "branch") {
        const baseProvided = options.base !== "main";
        const headProvided = options.head !== "HEAD";
        if (baseProvided || headProvided) {
          console.error(
            `Warning: --base and --head are ignored when --mode is "${mode}"`
          );
        }
      }

      const { findings, resolvedProfile } = await runAnalysisWithMode({
        mode,
        base: mode === "branch" ? options.base : undefined,
        head: mode === "branch" ? options.head : undefined,
        profile: options.profile as ProfileName,
        showSpinner: true,
      });

      const riskScore = computeRiskScore(findings);

      const renderContext: RenderContext = {
        findings,
        riskScore,
        profile: resolvedProfile,
      };

      console.log(renderTerminal(renderContext));
      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  });

// pr-body command - raw markdown for GitHub PRs
program
  .command("pr-body")
  .description("Generate a Markdown PR description")
  .option("--base <ref>", "Base branch to compare against", "main")
  .option("--head <ref>", "Head branch (current by default)", "HEAD")
  .option("-u, --uncommitted", "Include uncommitted changes", false)
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit)",
    "auto"
  )
  .option("--interactive", "Prompt for additional context", false)
  .action(async (options) => {
    try {
      const { findings, resolvedProfile } = await runAnalysis({
        base: options.base,
        head: options.head,
        profile: options.profile as ProfileName,
        uncommitted: options.uncommitted,
        showSpinner: false,
      });

      const riskScore = computeRiskScore(findings);

      let interactive: RenderContext["interactive"];

      if (options.interactive) {
        const context = await prompt(
          "Context/Why (1-3 sentences, press Enter to skip): "
        );
        const testNotes = await prompt(
          "Special manual test notes (press Enter to skip): "
        );

        interactive = {
          context: context || undefined,
          testNotes: testNotes || undefined,
        };
      }

      const renderContext: RenderContext = {
        findings,
        riskScore,
        profile: resolvedProfile,
        interactive,
      };

      console.log(renderMarkdown(renderContext));
      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  });

// facts command - JSON output for machine consumption
program
  .command("facts")
  .description("Output JSON findings (for piping to other tools)")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "branch"
  )
  .option("--base <ref>", "Base branch to compare against (branch mode)", "main")
  .option("--head <ref>", "Head branch (branch mode)", "HEAD")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit)",
    "auto"
  )
  .option("--out <path>", "Write output to file (creates directories as needed)")
  .option(
    "--format <type>",
    "Output format: json|compact",
    "json"
  )
  .option("--dry-run", "Preview analysis without full output", false)
  .action(async (options) => {
    try {
      // Validate mode
      const mode = options.mode as DiffMode;
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        console.error(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      // Validate format
      const format = options.format as "json" | "compact";
      if (!["json", "compact"].includes(format)) {
        console.error(`Invalid format: ${options.format}. Use json or compact.`);
        process.exit(1);
      }

      // Warn if base/head provided with non-branch mode
      if (mode !== "branch") {
        const baseProvided = options.base !== "main";
        const headProvided = options.head !== "HEAD";
        if (baseProvided || headProvided) {
          console.warn(
            `Warning: --base and --head are ignored when --mode is "${mode}"`
          );
        }
      }

      const { findings, resolvedProfile } = await runAnalysisWithMode({
        mode,
        base: mode === "branch" ? options.base : undefined,
        head: mode === "branch" ? options.head : undefined,
        profile: options.profile as ProfileName,
        showSpinner: !options.dryRun,
      });

      const riskScore = computeRiskScore(findings);

      // Dry run - just show what would be output
      if (options.dryRun) {
        console.log("=== Dry Run ===\n");
        console.log(`Mode: ${mode}`);
        if (mode === "branch") {
          console.log(`Base: ${options.base}`);
          console.log(`Head: ${options.head}`);
        }
        console.log(`Profile: ${resolvedProfile}`);
        console.log(`Format: ${format}`);
        console.log(`\nFindings: ${findings.length}`);
        console.log(`Risk Score: ${riskScore.score}/100 (${riskScore.level})`);
        
        // Group findings by type using shared utility
        const findingsByType = aggregateFindingsByType(findings);
        
        console.log("\nFindings by type:");
        for (const [type, count] of Object.entries(findingsByType)) {
          console.log(`  - ${type}: ${count}`);
        }
        
        if (options.out) {
          console.log(`\nOutput would be written to: ${options.out}`);
        } else {
          console.log("\nOutput would be written to: stdout");
        }
        
        process.exit(0);
      }

      const renderContext: RenderContext = {
        findings,
        riskScore,
        profile: resolvedProfile,
      };

      const output = renderJson(renderContext, {
        mode,
        base: mode === "branch" ? options.base : null,
        head: mode === "branch" ? options.head : null,
        format,
      });

      if (options.out) {
        const { mkdir, writeFile } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        const dir = dirname(options.out);
        await mkdir(dir, { recursive: true });
        await writeFile(options.out, output, "utf-8");
        const formatDesc = format === "compact" ? "compact JSON" : "JSON";
        console.log(`Wrote ${formatDesc} output to ${options.out}`);
      } else {
        console.log(output);
      }
      
      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  });

// Helper to collect repeatable options into an array
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

// dump-diff command - prompt-ready git diff for AI agents
program
  .command("dump-diff")
  .description("Output prompt-ready git diff with smart exclusions (for AI agents)")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "branch"
  )
  .option("--base <ref>", "Base git reference (branch mode only)", "main")
  .option("--head <ref>", "Head git reference (branch mode only)", "HEAD")
  .option("--no-untracked", "Exclude untracked files (non-branch modes)")
  .option("--out <path>", "Write output to file (creates directories as needed)")
  .option(
    "--format <type>",
    "Output format: text|md|json",
    "text"
  )
  .option("--unified <n>", "Lines of unified context (git diff -U)", "0")
  .option(
    "--include <glob>",
    "Include only files matching glob (repeatable)",
    collect,
    []
  )
  .option(
    "--exclude <glob>",
    "Additional exclusion glob (repeatable)",
    collect,
    []
  )
  .option("--max-chars <n>", "Chunk output if it exceeds this size")
  .option(
    "--chunk-dir <path>",
    "Directory for chunk files",
    ".ai/diff-chunks"
  )
  .option("--name <prefix>", "Chunk file name prefix", "diff")
  .option("--dry-run", "Preview what would be included/excluded", false)
  .action(async (options) => {
    try {
      // Validate mode
      const mode = options.mode as "branch" | "unstaged" | "staged" | "all";
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        console.error(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const format = options.format as "text" | "md" | "json";
      if (!["text", "md", "json"].includes(format)) {
        console.error(`Invalid format: ${options.format}. Use text, md, or json.`);
        process.exit(1);
      }

      const unified = parseInt(options.unified, 10);
      if (isNaN(unified) || unified < 0) {
        console.error(`Invalid unified context: ${options.unified}. Must be a non-negative integer.`);
        process.exit(1);
      }

      const maxChars = options.maxChars
        ? parseInt(options.maxChars, 10)
        : undefined;
      if (maxChars !== undefined && (isNaN(maxChars) || maxChars <= 0)) {
        console.error(`Invalid max-chars: ${options.maxChars}. Must be a positive integer.`);
        process.exit(1);
      }

      await executeDumpDiff({
        mode,
        base: options.base,
        head: options.head,
        out: options.out,
        format,
        unified,
        include: options.include,
        exclude: options.exclude,
        maxChars,
        chunkDir: options.chunkDir,
        name: options.name,
        dryRun: options.dryRun,
        includeUntracked: options.untracked !== false, // default true, --no-untracked sets to false
      });

      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  });

/**
 * Handle errors and exit with appropriate code.
 */
function handleError(error: unknown): never {
  if (error instanceof BranchNarratorError) {
    console.error(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    console.error(`Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
  } else {
    console.error("An unexpected error occurred");
  }

  process.exit(1);
}

program.parse();
