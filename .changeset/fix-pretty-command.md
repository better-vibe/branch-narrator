---
"@better-vibe/branch-narrator": patch
---

Fix pretty command profile-specific test suggestions and modernize terminal output

- Replace hardcoded SvelteKit test suggestion with profile-aware system (fixes incorrect suggestion for library/other profiles)
- Integrate buildHighlights() for consistent, prioritized summary bullets
- Display detected profile name in summary box
- Add rendering for new finding types: Impact Analysis, Infrastructure, CI/CD Workflows, SQL Risks, Lockfile Mismatch, Stencil Components, Config Changes, Large Diff warnings
- Update test plan section to show test gaps and profile-specific commands

