---
"@better-vibe/branch-narrator": minor
---

Improve human-facing output for `pretty` and `pr-body` commands

- Remove emojis from all human-facing output for cleaner, professional display
- Summary section now shows explicit diffstat (e.g., "Files: 3 changed (1 added, 2 modified)")
- Add "Review attention" indicator based on blast radius, separate from risk score
- Add findings-by-category summary (e.g., "code=1, tests=1, docs=1")
- Replace separate "Key highlights" and "Impact analysis" sections with unified "Top findings" (max 5 items)
- Top findings include capped example file lists with "(+N more)" suffix
- "What changed" section separates Changesets from Documentation category
- "What changed" shows "Primary files" for small changes (1-3 code files)
- Suggested test plan includes rationales (e.g., "(SvelteKit profile)", "(targeted)")
- Notes section shows only new information or "No elevated risks detected"
- PR body (`pr-body` command) now uses a collapsible `<details>` block for extended information
