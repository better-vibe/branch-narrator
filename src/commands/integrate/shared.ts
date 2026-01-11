/**
 * Shared content for branch-narrator integration.
 * This serves as the Single Source of Truth for tool usage instructions.
 */

export const BRANCH_NARRATOR_USAGE = `# branch-narrator CLI Reference

Use \`branch-narrator\` to get deterministic, repo-grounded context about changes
between git refs. It does not use an LLM and will not invent intent.

## Quick Start

Run \`branch-narrator --help\` for all options.

## Commands

### facts (Primary)

Get structured JSON analysis of changes. This is the primary command for understanding what changed.

**When to use:**
- User asks for a PR description or summary of changes
- You need structured data about routes, endpoints, dependencies, or config changes
- You want to understand the scope of modifications

**Example:**
\`\`\`bash
branch-narrator facts --mode branch --base main --head HEAD
\`\`\`

**Output:** JSON with categorized findings including file summaries, route changes, dependency updates, environment variables, and more.

---

### risk-report

Get a risk score (0-100) with evidence-backed security and stability flags.

**When to use:**
- User asks about security implications or risks
- Before merging changes that touch sensitive areas (auth, DB, infra)
- When reviewing PRs for potential issues

**Example:**
\`\`\`bash
branch-narrator risk-report --mode branch --base main --head HEAD
\`\`\`

**Output:** Risk score with categorized flags (high/medium/low) and evidence for each flag.

---

### zoom

Drill into a specific finding or risk flag by its stable ID.

**When to use:**
- You need more details about a specific finding from \`facts\`
- You want to understand a risk flag from \`risk-report\`
- You need to cite specific evidence in a PR description

**Examples:**
\`\`\`bash
# Zoom into a finding
branch-narrator zoom --finding <id> --mode branch --base main

# Zoom into a risk flag
branch-narrator zoom --flag <id> --mode branch --base main
\`\`\`

**Output:** Detailed information about the specific finding or flag, including file paths and line-level context.

---

### dump-diff

Get filtered diff output for line-level code review context.

**When to use:**
- You need raw diff content for precise code analysis
- Writing detailed PR descriptions that cite specific lines
- When \`facts\` doesn't provide enough detail

**Example:**
\`\`\`bash
branch-narrator dump-diff --mode branch --base main --head HEAD --unified 3 --out .ai/diff.txt
\`\`\`

**Output:** Unified diff written to the specified file, filtered to exclude noise (lockfiles, generated files).

---

### snap

Save and restore workspace snapshots for safe experimentation.

**When to use:**
- Before making risky or experimental changes
- When you want a restore point during complex refactoring
- To compare workspace states

**Examples:**
\`\`\`bash
# Save current state
branch-narrator snap save "before-refactor"

# List saved snapshots
branch-narrator snap list

# Restore a snapshot
branch-narrator snap restore <id>

# Show snapshot details
branch-narrator snap show <id>

# Compare two snapshots
branch-narrator snap diff <idA> <idB>
\`\`\`

---

## Decision Tree

Use this to decide which command to run:

\`\`\`
User asks to understand changes     → run \`facts\`
User asks about risks/security      → run \`risk-report\`
Need details on specific item       → run \`zoom --finding <id>\` or \`zoom --flag <id>\`
Need raw diff for code review       → run \`dump-diff\`
Before risky/experimental changes   → run \`snap save\`
\`\`\`

## Common Workflows

### PR Description
1. Run \`facts --mode branch --base main --head HEAD\`
2. Run \`dump-diff --mode branch --base main --head HEAD --out .ai/diff.txt\`
3. Use the structured facts and diff to write the PR description

### Risk Review
1. Run \`risk-report --mode branch --base main --head HEAD\`
2. For high-severity flags, run \`zoom --flag <id>\` to get details
3. Summarize risks with evidence citations

### Code Review Context
1. Run \`facts\` for overview
2. Run \`dump-diff\` for specific file changes
3. Use \`zoom\` for detailed investigation of specific findings

## Default Behavior

- **Mode:** Defaults to \`unstaged\` (local uncommitted changes) if no mode specified
- **Base/Head:** For branch mode, defaults to \`main\` and \`HEAD\` if not specified
- **For PR descriptions:** Always use \`--mode branch\`
`;

export const PR_DESCRIPTION_TEMPLATE = `# PR Description (use branch-narrator)

When the user asks to write a PR description, generate a Markdown PR body they
can copy-paste directly. Ground everything in the repo diff; do not invent
intent or outcomes.

## Required Steps

1. Get structured facts:
   \`branch-narrator facts --mode branch --base main --head HEAD\`

2. Dump a filtered diff:
   \`branch-narrator dump-diff --mode branch --base main --head HEAD --unified 3 --out .ai/diff.txt\`

3. Read the JSON output and \`.ai/diff.txt\` for evidence

If the user provides different refs, use them instead of \`main..HEAD\`.

## Writing Guidelines

- Output ONLY the final PR Markdown (no preamble, no tool logs)
- Use \`facts\` output to decide which sections are relevant
- Use diff to cite specifics (files, endpoints, migrations)
- Never claim "why" unless the user stated it
- If intent is unclear, add an "Open questions" section

## PR Structure

Include these sections based on what's relevant to the changes:

### Summary
2-6 bullets describing what changed (facts-based, no speculation).
Mention high-impact areas: routes, DB, env/config, dependencies, tests.

### Product Impact
User-visible changes from a product perspective.

### Testing
- Automated: relevant test commands
- Manual: checklist derived from routes/endpoints touched

### Technical Notes
Key implementation details for reviewers.

### Deployment Notes
Env vars, migrations, infrastructure changes (if applicable).

### Risks & Mitigations
Concrete risks with evidence and verification steps.
`;
