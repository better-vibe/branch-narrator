# Product Overview

## What is branch-narrator?

**branch-narrator** is a deterministic code analysis CLI that reads git diffs and produces:

1. **Markdown PR descriptions** - Human-readable summaries for pull requests
2. **JSON facts** - Machine-readable findings for automation

## Problem Statement

Writing good PR descriptions is tedious but important:
- Reviewers need context to understand changes
- Teams need to track what changed and why
- Automation needs structured data about changes

## Solution

branch-narrator automates PR description generation by:
- Analyzing git diffs using heuristics
- Detecting framework-specific patterns (SvelteKit routes, Supabase migrations)
- Categorizing files and assessing risk
- Generating structured, evidence-based output

## Key Differentiators

| Feature | branch-narrator | LLM-based tools |
|---------|-----------------|-----------------|
| Determinism | ✅ Same input = same output | ❌ Varies per request |
| Speed | ✅ < 1 second | ❌ 5-30 seconds |
| Offline | ✅ No network required | ❌ Requires API |
| Privacy | ✅ Code stays local | ❌ Sent to external API |
| Cost | ✅ Free | ❌ API costs |

## Target Users

- **Individual developers** - Quick PR descriptions
- **Teams** - Consistent PR format across team
- **CI/CD pipelines** - Automated PR comments
- **Code review** - Risk assessment before merge

## Supported Frameworks

| Framework | Status | Features |
|-----------|--------|----------|
| SvelteKit | ✅ Full | Routes, layouts, endpoints, methods |
| Generic | ✅ Full | Dependencies, env vars, tests |
| Next.js | 🔮 Planned | App router, API routes |
| Astro | 🔮 Planned | Islands, content collections |

