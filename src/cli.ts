#!/usr/bin/env node
/**
 * branch-narrator CLI entry point.
 */

import { Command } from "commander";
import { createInterface } from "readline";
import ora from "ora";
import chalk from "chalk";
import { BranchNarratorError } from "./core/errors.js";
import { getVersion } from "./core/version.js";
import type { DiffMode, Finding, ProfileName, RenderContext } from "./core/types.js";
import { runAnalyzersInParallel } from "./core/analyzer-runner.js";
import { executeDumpDiff } from "./commands/dump-diff/index.js";
import { collectChangeSet, getDefaultBranch } from "./git/collector.js";
import { getProfile, resolveProfileName, detectProfileWithReasons } from "./profiles/index.js";
import { renderMarkdown, renderTerminal } from "./render/index.js";
import { computeRiskScore } from "./render/risk-score.js";
import { configureLogger, error as logError, warn, info } from "./core/logger.js";

const program = new Command();

// Load version from package.json
const version = await getVersion();

program
  .name("branch-narrator")
  .description(
    "A local-first CLI that reads git diff and generates structured PR descriptions"
  )
  .version(version)
  .option("--quiet", "Suppress all non-fatal diagnostic output (warnings, info)")
  .option("--debug", "Show debug diagnostics on stderr")
  .hook("preAction", (thisCommand) => {
    // Configure logger from global options
    const opts = thisCommand.opts();
    configureLogger({
      quiet: opts.quiet,
      debug: opts.debug,
    });
  });

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
 * Resolve base/head refs for branch mode.
 * Auto-detects base branch if not provided.
 */
async function resolveDiffOptions(options: {
  mode: DiffMode;
  base?: string;
  head?: string;
}): Promise<{ base?: string; head?: string }> {
  if (options.mode === "branch") {
    let base = options.base;
    let head = options.head;

    if (!base) {
      base = await getDefaultBranch();
    }
    if (!head) {
      head = "HEAD";
    }
    return { base, head };
  }

  // Warn if base/head provided with non-branch mode
  const baseProvided = options.base !== undefined;
  const headProvided = options.head !== undefined;
  if (baseProvided || headProvided) {
    warn(
      `Warning: --base and --head are ignored when --mode is "${options.mode}"`
    );
  }

  return { base: undefined, head: undefined };
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
    includeUntracked: options.mode === "all" || options.mode === "unstaged",
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

  // Run analyzers in parallel for better performance
  const findings = await runAnalyzersInParallel(profile.analyzers, changeSet);

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
    "unstaged"
  )
  .option("--base <ref>", "Base branch to compare against (branch mode; auto-detected if omitted)")
  .option("--head <ref>", "Head branch (branch mode; defaults to HEAD)")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit|react|stencil|next)",
    "auto"
  )
  .action(async (options) => {
    try {
      const startTime = Date.now();
      // Validate mode
      const mode = options.mode as DiffMode;
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        logError(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const { base, head } = await resolveDiffOptions({
        mode,
        base: options.base,
        head: options.head,
      });

      const { findings, resolvedProfile } = await runAnalysisWithMode({
        mode,
        base,
        head,
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
      // Show duration (greyish color for subtlety)
      const durationMs = Date.now() - startTime;
      console.error(chalk.gray(`[${durationMs}ms]`));
      return;
    } catch (error) {
      handleError(error);
    }
  });

// pr-body command - raw markdown for GitHub PRs
program
  .command("pr-body")
  .description("Generate a Markdown PR description")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "unstaged"
  )
  .option("--base <ref>", "Base branch to compare against (branch mode; auto-detected if omitted)")
  .option("--head <ref>", "Head branch (branch mode; defaults to HEAD)")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit|react|stencil|next)",
    "auto"
  )
  .option("--interactive", "Prompt for additional context", false)
  .action(async (options) => {
    try {
      const mode = options.mode as DiffMode;

      // Validate mode
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        logError(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const { base, head } = await resolveDiffOptions({
        mode,
        base: options.base,
        head: options.head,
      });

      const { findings, resolvedProfile } = await runAnalysisWithMode({
        mode,
        base,
        head,
        profile: options.profile as ProfileName,
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
      return;
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
    "unstaged"
  )
  .option("--base <ref>", "Base git reference (branch mode only; auto-detected if omitted)")
  .option("--head <ref>", "Head git reference (branch mode only; defaults to HEAD)")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit|react|stencil|next)",
    "auto"
  )
  .option("--format <type>", "Output format: json|sarif", "json")
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
  .option("--out <path>", "Write output to file instead of stdout")
  .option("--no-timestamp", "Omit generatedAt for deterministic output")
  .option("--since <path>", "Compare current output to a previous JSON file")
  .option("--since-strict", "Exit with code 1 on scope/tool/schema mismatch", false)
  .option("--test-parity", "Enable test parity checking (opt-in, may be slow on large repos)", false)
  .action(async (options) => {
    try {
      // Import executeFacts dynamically to avoid circular dependencies
      const { executeFacts } = await import("./commands/facts/index.js");
      const { getRepoRoot, isWorkingDirDirty } = await import("./git/collector.js");
      const { computeFactsDelta } = await import("./commands/facts/delta.js");

      // Validate mode
      const mode = options.mode as DiffMode;
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        logError(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const { base, head } = await resolveDiffOptions({
        mode,
        base: options.base,
        head: options.head,
      });

      // Validate format
      if (options.format !== "json" && options.format !== "sarif") {
        logError(`Invalid format: ${options.format}. Use json or sarif.`);
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
        base,
        head,
        includeUntracked: mode === "all" || mode === "unstaged",
      });

      // Compute git metadata once (parallel for efficiency)
      const [repoRoot, isDirty] = await Promise.all([
        getRepoRoot(),
        isWorkingDirDirty(),
      ]);

      // Resolve profile with detection reasons
      const requestedProfile = options.profile as ProfileName;
      let detectedProfile: ProfileName;
      let profileConfidence: "high" | "medium" | "low";
      let profileReasons: string[];

      if (requestedProfile === "auto") {
        const detection = detectProfileWithReasons(changeSet, process.cwd());
        detectedProfile = detection.profile;
        profileConfidence = detection.confidence;
        profileReasons = detection.reasons;
      } else {
        // User explicitly requested a profile
        detectedProfile = requestedProfile;
        profileConfidence = "high";
        profileReasons = [`Profile explicitly set to ${requestedProfile}`];
      }

      const profile = getProfile(detectedProfile);

      // Run analyzers in parallel for better performance
      const findings = await runAnalyzersInParallel(profile.analyzers, changeSet);

      // Run test parity analyzer if explicitly enabled (opt-in)
      if (options.testParity) {
        const { testParityAnalyzer } = await import("./analyzers/test-parity.js");
        const testParityFindings = await testParityAnalyzer.analyze(changeSet);
        findings.push(...testParityFindings);
      }

      // Compute risk
      const riskScore = computeRiskScore(findings);

      // Build facts output
      const facts = await executeFacts({
        changeSet,
        findings,
        riskScore,
        requestedProfile,
        detectedProfile,
        profileConfidence,
        profileReasons,
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
        noTimestamp: options.timestamp === false,
        repoRoot,
        isDirty,
        mode,
      });

      // If --since is provided, compute delta instead
      let output: any;
      if (options.since) {
        const delta = await computeFactsDelta({
          sincePath: options.since,
          currentFacts: facts,
          mode,
          base: base || null,
          head: head || null,
          profile: detectedProfile,
          include: options.include,
          exclude: options.exclude,
          sinceStrict: options.sinceStrict,
        });
        output = delta;
      } else {
        output = facts;
      }

      // Validate format compatibility
      if (options.format === "sarif" && options.since) {
        throw new BranchNarratorError(
          "The --since option cannot be used with --format sarif. Remove --since or choose a different output format.",
          1
        );
      }

      // Output JSON or SARIF
      let outputText: string;
      if (options.format === "sarif") {
        const { renderSarif } = await import("./render/sarif.js");
        const sarif = renderSarif(output, changeSet);
        outputText = options.pretty
          ? JSON.stringify(sarif, null, 2)
          : JSON.stringify(sarif);
      } else {
        outputText = options.pretty
          ? JSON.stringify(output, null, 2)
          : JSON.stringify(output);
      }

      // Write to file or stdout
      if (options.out) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(options.out), { recursive: true });
        await writeFile(options.out, outputText, "utf-8");
        info(`Facts written to ${options.out}`);
      } else {
        console.log(outputText);
      }
      return;
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
    "unstaged"
  )
  .option("--base <ref>", "Base git reference (branch mode only; auto-detected if omitted)")
  .option("--head <ref>", "Head git reference (branch mode only; defaults to HEAD)")
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
  .option("--name-only", "Output only file list (no diffs)", false)
  .option("--stat", "Output file statistics (additions/deletions)", false)
  .option("--patch-for <path>", "Output diff for a specific file only")
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .option("--no-timestamp", "Omit generatedAt for deterministic output", false)
  .action(async (options) => {
    try {
      // Validate mode
      const mode = options.mode as "branch" | "unstaged" | "staged" | "all";
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        logError(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const { base, head } = await resolveDiffOptions({
        mode,
        base: options.base,
        head: options.head,
      });

      const format = options.format as "text" | "md" | "json";
      if (!["text", "md", "json"].includes(format)) {
        logError(`Invalid format: ${options.format}. Use text, md, or json.`);
        process.exit(1);
      }

      const unified = parseInt(options.unified, 10);
      if (isNaN(unified) || unified < 0) {
        logError(`Invalid unified context: ${options.unified}. Must be a non-negative integer.`);
        process.exit(1);
      }

      const maxChars = options.maxChars
        ? parseInt(options.maxChars, 10)
        : undefined;
      if (maxChars !== undefined && (isNaN(maxChars) || maxChars <= 0)) {
        logError(`Invalid max-chars: ${options.maxChars}. Must be a positive integer.`);
        process.exit(1);
      }

      // Validate mutual exclusivity of --name-only, --stat, and --patch-for
      const nameOnly = options.nameOnly === true;
      const stat = options.stat === true;
      const patchFor = options.patchFor !== undefined;

      const exclusiveCount = [nameOnly, stat, patchFor].filter(Boolean).length;
      if (exclusiveCount > 1) {
        logError(
          "Options --name-only, --stat, and --patch-for are mutually exclusive. " +
          "Use only one at a time."
        );
        process.exit(1);
      }

      await executeDumpDiff({
        mode,
        base,
        head,
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
        nameOnly,
        stat,
        patchFor: options.patchFor,
        pretty: options.pretty,
        noTimestamp: options.timestamp === false,
      });

      return;
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
    "unstaged"
  )
  .option("--base <ref>", "Base git reference (branch mode only; auto-detected if omitted)")
  .option("--head <ref>", "Head git reference (branch mode only; defaults to HEAD)")
  .option("--format <type>", "Output format: json|md|text", "json")
  .option("--out <path>", "Write output to file instead of stdout")
  .option("--fail-on-score <n>", "Exit with code 2 if risk score >= threshold")
  .option("--only <categories>", "Only include these categories (comma-separated)")
  .option("--exclude <categories>", "Exclude these categories (comma-separated)")
  .option("--max-evidence-lines <n>", "Max evidence lines per flag", "5")
  .option("--redact", "Redact secret values in evidence", false)
  .option("--explain-score", "Include score breakdown in output", false)
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .option("--no-timestamp", "Omit generatedAt for deterministic output", false)
  .option("--since <path>", "Compare current output to a previous JSON file")
  .option("--since-strict", "Exit with code 1 on scope/tool/schema mismatch", false)
  .option("--test-parity", "Enable test parity checking (opt-in, may be slow on large repos)", false)
  .action(async (options) => {
    try {
      // Import risk report command dynamically
      const { executeRiskReport, renderRiskReportJSON, renderRiskReportMarkdown, renderRiskReportText } = await import("./commands/risk/index.js");
      const { computeRiskReportDelta } = await import("./commands/risk/delta.js");

      // Validate mode
      const mode = options.mode as DiffMode;
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        logError(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const { base, head } = await resolveDiffOptions({
        mode,
        base: options.base,
        head: options.head,
      });

      // Validate format
      const format = options.format as "json" | "md" | "text";
      if (!["json", "md", "text"].includes(format)) {
        logError(`Invalid format: ${options.format}. Use json, md, or text.`);
        process.exit(1);
      }

      // Parse options
      const maxEvidenceLines = parseInt(options.maxEvidenceLines, 10);
      if (isNaN(maxEvidenceLines) || maxEvidenceLines < 1) {
        logError(`Invalid max-evidence-lines: ${options.maxEvidenceLines}. Must be a positive integer.`);
        process.exit(1);
      }

      const failOnScore = options.failOnScore
        ? parseInt(options.failOnScore, 10)
        : undefined;
      if (failOnScore !== undefined && (isNaN(failOnScore) || failOnScore < 0 || failOnScore > 100)) {
        logError(`Invalid fail-on-score: ${options.failOnScore}. Must be 0-100.`);
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
        base,
        head,
        includeUntracked: mode === "all" || mode === "unstaged",
      });

      // Execute risk report command
      const report = await executeRiskReport(changeSet, {
        only,
        exclude,
        maxEvidenceLines,
        redact: options.redact,
        explainScore: options.explainScore,
        noTimestamp: options.timestamp === false,
        mode,
        testParity: options.testParity,
      });

      // If --since is provided, compute delta and force JSON format
      let output: string;
      if (options.since) {
        // Validate format - --since only supports JSON for v1
        if (format !== "json") {
          logError(`--since requires --format json (other formats not supported in v1)`);
          process.exit(1);
        }

        const delta = await computeRiskReportDelta({
          sincePath: options.since,
          currentReport: report,
          mode,
          base: base || null,
          head: head || null,
          only: only || null,
          exclude: exclude || null,
          sinceStrict: options.sinceStrict,
        });

        output = options.pretty
          ? JSON.stringify(delta, null, 2)
          : JSON.stringify(delta);
      } else {
        // Normal rendering without delta
        switch (format) {
          case "json":
            output = renderRiskReportJSON(report, options.pretty);
            break;
          case "md":
            output = renderRiskReportMarkdown(report);
            break;
          case "text":
            output = renderRiskReportText(report);
            break;
        }
      }

      // Write to file or stdout
      if (options.out) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(options.out), { recursive: true });
        await writeFile(options.out, output, "utf-8");
        info(`Risk report written to ${options.out}`);
      } else {
        console.log(output);
      }

      // Check fail-on-score threshold (use current score regardless of delta mode)
      if (failOnScore !== undefined && report.riskScore >= failOnScore) {
        logError(`Risk score ${report.riskScore} >= threshold ${failOnScore}`);
        process.exitCode = 2;
        return;
      }

      return;
    } catch (error) {
      handleError(error);
    }
  });

// zoom command - targeted drill-down for findings and flags
program
  .command("zoom")
  .description("Zoom into a specific finding or flag for detailed context")
  .option("--finding <id>", "Finding ID to zoom into")
  .option("--flag <id>", "Flag ID to zoom into")
  .option(
    "--mode <type>",
    "Diff mode: branch|unstaged|staged|all",
    "unstaged"
  )
  .option("--base <ref>", "Base git reference (branch mode only; auto-detected if omitted)")
  .option("--head <ref>", "Head git reference (branch mode only; defaults to HEAD)")
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit|react|stencil|next)",
    "auto"
  )
  .option("--format <type>", "Output format: json|md|text", "json")
  .option("--unified <n>", "Lines of unified context for patch hunks", "3")
  .option("--no-patch", "Do not include patch context, only evidence")
  .option("--max-evidence-lines <n>", "Max evidence excerpt lines to show", "8")
  .option("--redact", "Redact obvious secret values in evidence excerpts", false)
  .option("--out <path>", "Write output to file instead of stdout")
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .option("--no-timestamp", "Omit generatedAt for deterministic output")
  .action(async (options) => {
    try {
      // Import zoom command dynamically
      const { executeZoom } = await import("./commands/zoom/index.js");
      const { renderZoomJSON, renderZoomMarkdown, renderZoomText } = await import("./commands/zoom/renderers.js");

      // Validate mode
      const mode = options.mode as DiffMode;
      if (!["branch", "unstaged", "staged", "all"].includes(mode)) {
        logError(`Invalid mode: ${options.mode}. Use branch, unstaged, staged, or all.`);
        process.exit(1);
      }

      const { base, head } = await resolveDiffOptions({
        mode,
        base: options.base,
        head: options.head,
      });

      // Validate format
      const format = options.format as "json" | "md" | "text";
      if (!["json", "md", "text"].includes(format)) {
        logError(`Invalid format: ${options.format}. Use json, md, or text.`);
        process.exit(1);
      }

      // Parse unified context
      const unified = parseInt(options.unified, 10);
      if (isNaN(unified) || unified < 0) {
        logError(`Invalid unified context: ${options.unified}. Must be a non-negative integer.`);
        process.exit(1);
      }

      // Parse max evidence lines
      const maxEvidenceLines = parseInt(options.maxEvidenceLines, 10);
      if (isNaN(maxEvidenceLines) || maxEvidenceLines < 1) {
        logError(`Invalid max-evidence-lines: ${options.maxEvidenceLines}. Must be a positive integer.`);
        process.exit(1);
      }

      // Collect git data using mode-based options
      const changeSet = await collectChangeSet({
        mode,
        base,
        head,
        includeUntracked: mode === "all" || mode === "unstaged",
      });

      // Execute zoom command
      const zoomOutput = await executeZoom(changeSet, {
        findingId: options.finding,
        flagId: options.flag,
        mode,
        base,
        head,
        profile: options.profile as ProfileName,
        includePatch: options.patch !== false,
        unified,
        maxEvidenceLines,
        redact: options.redact,
        noTimestamp: options.timestamp === false,
      });

      // Render output
      let output: string;
      switch (format) {
        case "json":
          output = renderZoomJSON(zoomOutput, options.pretty);
          break;
        case "md":
          output = renderZoomMarkdown(zoomOutput);
          break;
        case "text":
          output = renderZoomText(zoomOutput);
          break;
      }

      // Write to file or stdout
      if (options.out) {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { dirname } = await import("node:path");
        await mkdir(dirname(options.out), { recursive: true });
        await writeFile(options.out, output, "utf-8");
        info(`Zoom output written to ${options.out}`);
      } else {
        console.log(output);
      }

      return;
    } catch (error) {
      handleError(error);
    }
  });

// integrate command - generate provider rules (Cursor, Jules, etc.)
program
  .command("integrate [target]")
  .description("Generate provider-specific rules (auto-detects when omitted)")
  .option("--dry-run", "Preview what would be written without creating files", false)
  .option("--force", "Overwrite existing files", false)
  .action(async (target, options) => {
    try {
      const { executeIntegrate } = await import("./commands/integrate.js");

      await executeIntegrate({
        target: target,
        dryRun: options.dryRun,
        force: options.force,
      });

      return;
    } catch (error) {
      handleError(error);
    }
  });

// snap command - local workspace snapshots for agent iteration
const snap = program
  .command("snap")
  .description("Manage local workspace snapshots for agent iteration");

snap
  .command("save [label]")
  .description("Create a new snapshot of current workspace state")
  .option("--out <path>", "Write snapshotId to file instead of stdout")
  .action(async (label: string | undefined, options: { out?: string }) => {
    try {
      const { executeSnapSave } = await import("./commands/snap/index.js");
      const result = await executeSnapSave({
        label,
        out: options.out,
      });

      // Print snapshotId to stdout (unless --out is used)
      if (!options.out) {
        console.log(result.snapshotId);
      } else {
        info(`Snapshot ${result.snapshotId} saved to ${options.out}`);
      }

      return;
    } catch (error) {
      handleError(error);
    }
  });

snap
  .command("list")
  .description("List all snapshots")
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .action(async (options: { pretty: boolean }) => {
    try {
      const { executeSnapList, renderSnapListJSON } = await import("./commands/snap/index.js");
      const index = await executeSnapList();
      console.log(renderSnapListJSON(index, options.pretty));
      return;
    } catch (error) {
      handleError(error);
    }
  });

snap
  .command("show <snapshotId>")
  .description("Show snapshot details")
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .action(async (snapshotId: string, options: { pretty: boolean }) => {
    try {
      const { executeSnapShow, renderSnapShowJSON } = await import("./commands/snap/index.js");
      const snapshot = await executeSnapShow(snapshotId);
      console.log(renderSnapShowJSON(snapshot, options.pretty));
      return;
    } catch (error) {
      handleError(error);
    }
  });

snap
  .command("diff <idA> <idB>")
  .description("Compare two snapshots")
  .option("--pretty", "Pretty-print JSON with 2-space indentation", false)
  .action(async (idA: string, idB: string, options: { pretty: boolean }) => {
    try {
      const { executeSnapDiff, renderSnapDiffJSON } = await import("./commands/snap/index.js");
      const delta = await executeSnapDiff(idA, idB);
      console.log(renderSnapDiffJSON(delta, options.pretty));
      return;
    } catch (error) {
      handleError(error);
    }
  });

snap
  .command("restore <snapshotId>")
  .description("Restore workspace to snapshot state (creates automatic backup first)")
  .action(async (snapshotId: string) => {
    try {
      const { executeSnapRestore } = await import("./commands/snap/index.js");
      const result = await executeSnapRestore(snapshotId);

      info(`Restored to snapshot ${result.snapshotId}`);
      info(`Pre-restore backup: ${result.backupSnapshotId}`);

      if (result.verified) {
        info("Verification: passed");
      } else {
        warn("Verification: patch hashes differ (this may be expected for empty patches)");
      }

      return;
    } catch (error) {
      handleError(error);
    }
  });

/**
 * Handle errors and exit with appropriate code.
 */
function handleError(error: unknown): never {
  if (error instanceof BranchNarratorError) {
    logError(`Error: ${error.message}`);
    process.exit(error.exitCode);
  }

  if (error instanceof Error) {
    logError(`Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      logError(error.stack || "");
    }
  } else {
    logError("An unexpected error occurred");
  }

  process.exit(1);
}

await program.parseAsync();
