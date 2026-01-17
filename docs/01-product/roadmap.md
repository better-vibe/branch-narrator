# Roadmap

## Current Version: 0.2.0

### Completed Features ✅

- [x] File summary analyzer
- [x] File category classifier (with database category)
- [x] SvelteKit route detection
- [x] Supabase migration scanner
- [x] Environment variable detection
- [x] Cloudflare config detection
- [x] Vitest test detection
- [x] Dependency analysis with semver
- [x] Security file detection
- [x] Risky package detection
- [x] Risk scoring with evidence
- [x] Markdown PR body generation
- [x] JSON facts output
- [x] Uncommitted changes support
- [x] Interactive mode
- [x] React profile (React Router support)
- [x] Test parity analyzer
- [x] Impact/blast radius analyzer
- [x] Package manager detection for actions (bun/pnpm/yarn/npm)
- [x] `bun.lock` lockfile detection
- [x] Improved test file detection (src/tests/ paths)
- [x] Integrate auto-detects agent guides and supports multiple targets

---

## v0.3.0 - Enhanced Detection

### Planned Features

- [ ] **Prisma migration support**
  - Detect `prisma/migrations/` changes
  - Scan for destructive schema changes
  - Flag model renames and deletions

- [ ] **OpenAPI/GraphQL detection**
  - Detect `openapi.yaml`, `schema.graphql` changes
  - Summarize added/removed endpoints
  - Flag breaking changes

- [ ] **API surface analyzer**
  - Track exported symbols from entry points
  - Detect removed exports (breaking)
  - Detect changed function signatures

- [ ] **Configuration file support**
  - `.branchnarratorrc.json` for custom rules
  - Profile overrides per project
  - Custom risk scoring weights

---

## v0.4.0 - New Profiles

### Planned Features

- [ ] **Next.js profile**
  - App router detection
  - API routes analysis
  - Middleware detection
  - Server components vs client

- [ ] **Astro profile**
  - Islands detection
  - Content collections
  - Integration changes

- [ ] **Express/Fastify profile**
  - Router definitions
  - Middleware chains
  - Route schemas

---

## v1.0.0 - Stable Release

### Planned Features

- [ ] **Stable API**
  - Documented public exports
  - Semantic versioning guarantees
  - Migration guides

- [ ] **Plugin system**
  - Custom analyzer hooks
  - Third-party analyzers
  - Output format plugins

- [ ] **GitHub Action**
  - Official action for CI
  - Auto-comment on PRs
  - Status checks based on risk

- [ ] **VS Code extension**
  - Preview PR description
  - Risk indicators in editor
  - Quick actions

---

## Known Issues

| Issue | Status | Workaround |
|-------|--------|------------|
| Monorepo support limited | 🔧 In Progress | Run from package root |
| Large diffs slow | 📋 Backlog | Use `--uncommitted` for incremental |

---

## Feature Requests

To request a feature, open an issue with:
- Use case description
- Expected behavior
- Framework/tooling involved

