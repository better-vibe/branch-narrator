/**
 * integrate command implementation.
 * Generates integration files for AI coding assistants (Cursor, etc.).
 */

import { mkdir, writeFile, access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { BranchNarratorError } from "../core/errors.js";

// ============================================================================
// Types
// ============================================================================

export type IntegrationProvider = "cursor";

export interface IntegrateOptions {
  provider: IntegrationProvider;
  dryRun: boolean;
  force: boolean;
  cwd?: string;
}

export interface RuleFile {
  path: string;
  content: string;
}

// ============================================================================
// File Content Constants
// ============================================================================

const CURSOR_BRANCH_NARRATOR_RULE = `# branch-narrator (local change analysis tool)

Use \`branch-narrator\` to get deterministic, repo-grounded context about changes
between git refs. It does not use an LLM and will not invent intent.

## When to use this tool
Call \`branch-narrator\` when the user asks for:
- A PR description / summary of what changed
- A changelog-style summary of modifications
- What routes/endpoints/config/dependencies changed
- A risk review based on the diff

If you need accurate context, run the commands below BEFORE writing conclusions.

---

## Primary commands

### 1) Get structured facts (preferred)
Run:
- \`branch-narrator facts --base main --head HEAD\`

This returns JSON findings. Use it to produce:
- A concise summary (facts-based)
- A list of key areas changed (routes, db, config, deps, tests, infra)
- Risks/notes that cite evidence from findings (file paths, patterns)

Do not guess "why" a change was made. If the user needs intent, ask them.

### 2) Get a prompt-ready diff (filtered)
Run:
- \`branch-narrator dump-diff --base main --head HEAD --out .ai/diff.txt\`

Then read \`.ai/diff.txt\` for line-level context.

If the diff seems too large or noisy, re-run with excludes/includes if supported
by the CLI (prefer excluding lockfiles, generated files, logs, and build output).

---

## Related rule
When asked to write a PR description, follow the \`PR Description\` rule and call
\`facts\` + \`dump-diff\` first.

---

## Default refs
If the user doesn't specify refs, use:
- base: \`main\`
- head: \`HEAD\`
`;

const CURSOR_PR_DESCRIPTION_RULE = `# PR Description (use branch-narrator)

When the user asks to write a PR description, generate a Markdown PR body they
can copy-paste directly. Ground everything in the repo diff; do not invent
intent or outcomes.

## Required tool calls (do this first)
1) Get structured facts:
   - \`branch-narrator facts --base main --head HEAD\`

2) Dump a filtered diff with unified context:
   - \`branch-narrator dump-diff --base main --head HEAD --unified 3 --out .ai/diff.txt\`

Read:
- the JSON output from \`facts\`
- \`.ai/diff.txt\` for exact line-level evidence

If the user provides different refs, use them instead of \`main..HEAD\`.

## How to write the PR description
- Output ONLY the final PR Markdown (no preamble, no tool logs).
- Use \`facts\` to decide which sections are relevant.
- Use \`.ai/diff.txt\` to cite specifics (files/paths, endpoints, migrations).
- Never claim "why" unless the user stated it. If intent is unclear, add a
  short "Open questions" section.

## PR body template (include sections based on scope)

### Title (suggested)
Provide a short title suggestion (one line). Keep it factual.

### Markdown PR description (copy-paste)
Use this structure (omit sections that are truly irrelevant; otherwise include
and write "N/A"):

## Summary
- 2–6 bullets describing what changed (facts-based, no speculation).
- Mention high-impact areas: routes/endpoints, DB migrations, env/config,
  Cloudflare/deploy, dependencies, tests.

## Product impact
Describe user-visible changes from a product perspective:
- What changes in behavior/UI/flows?
- What's new/removed/changed?
- Any feature-flagged behavior? (If unknown, say "Not detected in diff".)

## QA / Testing
### Automated
- List the most relevant commands (based on repo conventions):
  - \`pnpm test\` (if tests/Vitest are present)
  - \`pnpm check\` (SvelteKit typecheck, if applicable)

### Manual smoke test
- Provide a checklist of manual verification steps derived from the diff:
  - Routes/pages touched (from \`facts\` route-change findings)
  - Endpoints changed and methods (GET/POST/etc.)
  - Auth/session flows if relevant
  - Supabase-related flows if migrations/policies changed

### Edge cases / regressions to watch
- Bullet list of likely regressions based on what changed (cite evidence).

## Technical notes
- Key implementation details a reviewer should know (files/modules touched).
- Notable refactors, dependency upgrades, config changes.

## Deployment / Ops notes
Include if relevant (based on facts/diff):
- Env vars added/changed (names only; never include secret values)
- Supabase migrations (risk level + filenames)
- Cloudflare changes (wrangler/workflows/bindings)
- Backward compatibility / rollout considerations

## Risks & mitigations
- List concrete risks with evidence (file paths, migration keywords, major bumps).
- For each risk, add a mitigation or verification step.

## Open questions (only if needed)
- Ask for missing info required to finalize the PR description (e.g. intended
  product behavior, rollout plan, screenshots).

## Evidence (optional, short)
- 3–10 bullets pointing to the most important files changed.
`;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get rule files for a given provider.
 */
export function getRuleFiles(provider: IntegrationProvider): RuleFile[] {
  switch (provider) {
    case "cursor":
      return [
        {
          path: ".cursor/rules/branch-narrator.md",
          content: CURSOR_BRANCH_NARRATOR_RULE,
        },
        {
          path: ".cursor/rules/pr-description.md",
          content: CURSOR_PR_DESCRIPTION_RULE,
        },
      ];
    default:
      throw new BranchNarratorError(
        `Unknown integration provider: ${provider}. Supported: cursor`,
        1
      );
  }
}

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
 * Execute the integrate command.
 */
export async function executeIntegrate(
  options: IntegrateOptions
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const ruleFiles = getRuleFiles(options.provider);

  // Dry-run: print what would be written
  if (options.dryRun) {
    console.log(`[DRY RUN] Would create the following files:\n`);
    for (const file of ruleFiles) {
      const fullPath = join(cwd, file.path);
      console.log(`File: ${fullPath}`);
      console.log(`${"=".repeat(80)}`);
      console.log(file.content);
      console.log(`${"=".repeat(80)}\n`);
    }
    return;
  }

  // Check if files exist (unless force mode)
  if (!options.force) {
    for (const file of ruleFiles) {
      const fullPath = join(cwd, file.path);
      if (await fileExists(fullPath)) {
        throw new BranchNarratorError(
          `File already exists: ${file.path}\n` +
            `Use --force to overwrite existing files.`,
          1
        );
      }
    }
  }

  // Create directories and write files
  for (const file of ruleFiles) {
    const fullPath = join(cwd, file.path);
    const dir = dirname(fullPath);
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, file.content, "utf-8");
    console.log(`Created: ${file.path}`);
  }
}
