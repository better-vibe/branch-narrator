# PR Description (use branch-narrator)

When the user asks to write a PR description, generate a Markdown PR body they
can copy-paste directly. Ground everything in the repo diff; do not invent
intent or outcomes.

## Required tool calls (do this first)
1) Get structured facts:
   - `branch-narrator facts --mode branch --base main --head HEAD`

2) Dump a filtered diff with unified context:
   - `branch-narrator dump-diff --mode branch --base main --head HEAD --unified 3 --out .ai/diff.txt`

Read:
- the JSON output from `facts`
- `.ai/diff.txt` for exact line-level evidence

If the user provides different refs, use them instead of `main..HEAD`.

## How to write the PR description
- Output ONLY the final PR Markdown (no preamble, no tool logs).
- Use `facts` to decide which sections are relevant.
- Use `.ai/diff.txt` to cite specifics (files/paths, endpoints, migrations).
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
  - `pnpm test` (if tests/Vitest are present)
  - `pnpm check` (SvelteKit typecheck, if applicable)

### Manual smoke test
- Provide a checklist of manual verification steps derived from the diff:
  - Routes/pages touched (from `facts` route-change findings)
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
