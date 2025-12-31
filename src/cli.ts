/**
 * branch-narrator CLI entry point.
 */

import { Command } from "commander";
import { createInterface } from "readline";
import { BranchNarratorError } from "./core/errors.js";
import type { Finding, ProfileName, RenderContext } from "./core/types.js";
import { collectChangeSet } from "./git/collector.js";
import { getProfile, resolveProfileName } from "./profiles/index.js";
import { renderJson, renderMarkdown } from "./render/index.js";
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
 * Run analysis and return findings.
 */
async function runAnalysis(options: {
  base: string;
  head: string;
  profile: ProfileName;
  uncommitted?: boolean;
}): Promise<{ findings: Finding[]; resolvedProfile: ProfileName }> {
  // Collect git data
  const changeSet = await collectChangeSet({
    base: options.base,
    head: options.head,
    uncommitted: options.uncommitted,
  });

  // Resolve profile
  const resolvedProfile = resolveProfileName(
    options.profile,
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

  return { findings, resolvedProfile };
}

// pr-body command
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

      const markdown = renderMarkdown(renderContext);
      console.log(markdown);

      process.exit(0);
    } catch (error) {
      handleError(error);
    }
  });

// facts command
program
  .command("facts")
  .description("Output JSON findings")
  .option("--base <ref>", "Base branch to compare against", "main")
  .option("--head <ref>", "Head branch (current by default)", "HEAD")
  .option("-u, --uncommitted", "Include uncommitted changes", false)
  .option(
    "--profile <name>",
    "Profile to use (auto|sveltekit)",
    "auto"
  )
  .action(async (options) => {
    try {
      const { findings, resolvedProfile } = await runAnalysis({
        base: options.base,
        head: options.head,
        profile: options.profile as ProfileName,
        uncommitted: options.uncommitted,
      });

      const riskScore = computeRiskScore(findings);

      const renderContext: RenderContext = {
        findings,
        riskScore,
        profile: resolvedProfile,
      };

      const json = renderJson(renderContext);
      console.log(json);

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
