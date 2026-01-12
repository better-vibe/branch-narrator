---
"@better-vibe/branch-narrator": minor
---

Add SARIF 2.1.0 output format for GitHub Code Scanning integration

**New Features:**
- Add `--format sarif` option to `facts` command for SARIF 2.1.0 output
- Enhance diff parsing to track line numbers for added lines (enables precise location reporting)
- Map findings to stable SARIF rules (BNR001-BNR006):
  - BNR001: Dangerous SQL in migration (error level)
  - BNR002: Non-destructive migration changed (warning level)
  - BNR003: Major dependency bump in critical frameworks (warning level)
  - BNR004: New environment variable reference (warning level)
  - BNR005: Cloudflare configuration changed (note level)
  - BNR006: API endpoint changed (note level)

**Use Cases:**
- Upload findings to GitHub Code Scanning for PR annotations
- Integrate with CI/CD pipelines using standard SARIF tooling
- Export findings to any SARIF-compatible analysis platform

**Implementation Details:**
- Deterministic and offline (no LLM calls, no network requests)
- Line numbers included when evidence is based on added diff lines
- Stable ordering of rules and results for reproducibility
- Full SARIF 2.1.0 compliance with tool metadata and location tracking
