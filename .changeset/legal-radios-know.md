---
"@better-vibe/branch-narrator": minor
---

Improve pr-body and pretty command output

**pr-body improvements:**
- Add Security-Sensitive Files section showing files that touch auth, permissions, or security-critical code
- Add Vite Config rendering in Configuration Changes section
- Improve Summary section using prioritized highlights system for consistent, impact-ordered bullets
- Remove redundant Tests section (tests already shown in "What Changed" and "Suggested Test Plan")

**pretty command improvements:**
- Add dedicated KEY HIGHLIGHTS section with categorized display (Risks & Breaking Changes, Changes, Info)
- Simplify Summary box to focus on file counts, profile, and risk level
- Highlights now shown in their own section with appropriate styling

**Other fixes:**
- Fix emoji consistency: use ⚡ only for KEY HIGHLIGHTS header, ℹ️ for informational risk bullets
- Remove deprecated --uncommitted flag (use --mode unstaged instead)
