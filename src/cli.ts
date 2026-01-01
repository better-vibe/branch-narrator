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
import { renderMarkdown, renderTerminal } from "./render/index.js";
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
  .description("Output structured JSON facts (agent-grade output)")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "branch"
  )
  .option("--base <ref>", "Base git reference (branch mode only)", "main")
  .option("--head <ref>", "Head git reference (branch mode only)", "HEAD")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit)",
    "auto"
  )
  .option("--format <type>", "Output format: json", "json")
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .option("--redact", "Redact obvious secret values in evidence excerpts", false)
  .option(
    "--exclude <glob>",
    "Additional exclusion glob (repeatable)",
    collect,
    []
  )
  .option(
    "--include <glob>",
    "Include only files matching glob (repeatable)",
    collect,
    []
  )
  .option(
    "--max-file-bytes <n>",
    "Maximum file size in bytes to analyze",
    "1048576"
  )
  .option(
    "--max-diff-bytes <n>",
    "Maximum diff size in bytes to analyze",
    "5242880"
  )
  .option(
    "--max-findings <n>",
    "Maximum number of findings to include"
  )
  .action(async (options) => {
    try {
      // Import buildFacts dynamically to avoid circular dependencies
      const { buildFacts } = await import("./facts/index.js");

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

      // Validate format
      if (options.format !== "json") {
        console.error(`Invalid format: ${options.format}. Only json is supported.`);
        process.exit(1);
      }

      // Parse numeric options
      const maxFileBytes = parseInt(options.maxFileBytes, 10);
      const maxDiffBytes = parseInt(options.maxDiffBytes, 10);
      const maxFindings = options.maxFindings
        ? parseInt(options.maxFindings, 10)
        : undefined;

      // Collect git data using mode-based options
      const changeSet = await collectChangeSet({
        mode,
        base: mode === "branch" ? options.base : undefined,
        head: mode === "branch" ? options.head : undefined,
        includeUntracked: mode === "all",
      });

      // Resolve profile
      const resolvedProfile = resolveProfileName(
        options.profile as ProfileName,
        changeSet,
        process.cwd()
      );
      const profile = getProfile(resolvedProfile);

      // Run analyzers
      const findings: Finding[] = [];
      for (const analyzer of profile.analyzers) {
        const analyzerFindings = analyzer.analyze(changeSet);
        findings.push(...analyzerFindings);
      }

      // Compute risk
      const riskScore = computeRiskScore(findings);

      // Build facts output
      const facts = await buildFacts({
        changeSet,
        findings,
        riskScore,
        requestedProfile: options.profile as ProfileName,
        detectedProfile: resolvedProfile,
        profileConfidence: "high",
        profileReasons: [`Detected ${resolvedProfile} project`],
        filters: {
          excludes: options.exclude,
          includes: options.include,
          redact: options.redact,
          maxFileBytes,
          maxDiffBytes,
          maxFindings,
        },
        skippedFiles: [],
        warnings: [],
      });

      // Output JSON
      const json = options.pretty
        ? JSON.stringify(facts, null, 2)
        : JSON.stringify(facts);
      
      console.log(json);
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

// risk-report command - general-purpose risk analysis
program
  .command("risk-report")
  .description("Analyze git diff and emit risk score (0-100) with evidence-backed flags")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "branch"
  )
  .option("--base <ref>", "Base git reference (branch mode only)", "main")
  .option("--head <ref>", "Head git reference (branch mode only)", "HEAD")
  .option("--format <type>", "Output format: json|md|text", "json")
  .option("--out <path>", "Write output to file instead of stdout")
  .option("--fail-on-score <n>", "Exit with code 2 if risk score >= threshold")
  .option("--only <categories>", "Only include these categories (comma-separated)")
  .option("--exclude <categories>", "Exclude these categories (comma-separated)")
  .option("--max-evidence-lines <n>", "Max evidence lines per flag", "5")
  .option("--redact", "Redact secret values in evidence", false)
  .option("--explain-score", "Include score breakdown in output", false)
  .action(async (options) => {
    try {
      // Import risk report dynamically
      const { generateRiskReport, renderRiskReportJSON, renderRiskReportMarkdown, renderRiskReportText } = await import("./risk/index.js");

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

      // Validate format
      const format = options.format as "json" | "md" | "text";
      if (!["json", "md", "text"].includes(format)) {
        console.error(`Invalid format: ${options.format}. Use json, md, or text.`);
        process.exit(1);
      }

      // Parse options
      const maxEvidenceLines = parseInt(options.maxEvidenceLines, 10);
      if (isNaN(maxEvidenceLines) || maxEvidenceLines < 1) {
        console.error(`Invalid max-evidence-lines: ${options.maxEvidenceLines}. Must be a positive integer.`);
        process.exit(1);
      }

      const failOnScore = options.failOnScore
        ? parseInt(options.failOnScore, 10)
        : undefined;
      if (failOnScore !== undefined && (isNaN(failOnScore) || failOnScore < 0 || failOnScore > 100)) {
        console.error(`Invalid fail-on-score: ${options.failOnScore}. Must be 0-100.`);
        process.exit(1);
      }

      const only = options.only
        ? options.only.split(",").map((s: string) => s.trim())
        : undefined;
      const exclude = options.exclude
        ? options.exclude.split(",").map((s: string) => s.trim())
        : undefined;

      // Collect git data using mode-based options
      const changeSet = await collectChangeSet({
        mode,
        base: mode === "branch" ? options.base : undefined,
        head: mode === "branch" ? options.head : undefined,
        includeUntracked: mode === "all",
      });

      // Generate risk report
      const report = generateRiskReport(changeSet, {
        only,
        exclude,
        maxEvidenceLines,
        redact: options.redact,
        explainScore: options.explainScore,
      });

      // Render output
      let output: string;
      switch (format) {
        case "json":
          output = renderRiskReportJSON(report, true);
          break;
        case "md":
          output = renderRiskReportMarkdown(report);
          break;
        case "text":
          output = renderRiskReportText(report);
          break;
      }

      // Write to file or stdout
      if (options.out) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(options.out), { recursive: true });
        await writeFile(options.out, output, "utf-8");
        console.error(`Risk report written to ${options.out}`);
      } else {
        console.log(output);
      }

      // Check fail-on-score threshold
      if (failOnScore !== undefined && report.riskScore >= failOnScore) {
        console.error(`Risk score ${report.riskScore} >= threshold ${failOnScore}`);
        process.exit(2);
      }

      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  });

// integrate command - generate provider rules (Cursor, etc.)
program
  .command("integrate <target>")
  .description("Generate provider-specific rules (e.g., cursor)")
  .option("--dry-run", "Preview what would be written without creating files", false)
  .option("--force", "Overwrite existing files", false)
  .action(async (target, options) => {
    try {
      const { executeIntegrate } = await import("./commands/integrate.js");

      await executeIntegrate({
        target: target as "cursor",
        dryRun: options.dryRun,
        force: options.force,
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
