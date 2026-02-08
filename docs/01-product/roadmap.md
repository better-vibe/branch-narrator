# Roadmap

## Current Version: 1.6.0

### MVP Exit (v1.7.x) — Polish

- [ ] Align docs/README/CLI help with current behavior and schemas
- [ ] Complete analyzer documentation coverage (infra/CI/sql/lockfiles/large-diff/API contracts)
- [ ] Clarify defaults and caching behavior across docs
- [ ] Tighten release checklist and examples (facts/risk/dump-diff JSON)

---

## Completed Features ✅

- [x] Facts command (schema v2.1) with highlights, actions, and changeset warnings
- [x] Risk report with derived flags, stable IDs, and five-level scale
- [x] Dump-diff JSON schema v2.0 with chunking and per-file hunks
- [x] Fix dump-diff --patch-for from subdirectories
- [x] Zoom, Snap, and Cache commands
- [x] DOD diff parser and caching for ChangeSet + analyzers
- [x] Profiles: SvelteKit, Next.js, React, Vue/Nuxt, Astro, Stencil, Angular, Python, Library, Vite
- [x] Analyzers for routes, deps, config, infra, CI, SQL risks, env vars, security files, and migrations

---

## v1.8.0 — Enhanced Detection

### Planned Features

- [ ] **Prisma migration support**
  - Detect `prisma/migrations/` changes
  - Flag destructive schema changes
  - Track model renames and deletions

- [ ] **OpenAPI / Protobuf detection**
  - Detect `openapi.*`, `swagger.*`, `*.proto` changes
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

## v2.0.0 — Extensibility

### Planned Features

- [ ] **Stable public API**
  - Documented exports and versioning guarantees
  - Migration guides for schema changes

- [ ] **Plugin system**
  - Custom analyzer hooks
  - Third-party analyzers
  - Output format plugins

- [ ] **GitHub Action**
  - Official action for CI
  - Status checks based on risk

---

## Known Issues

| Issue | Status | Workaround |
|-------|--------|------------|
| Monorepo detection is heuristic | 🔧 In Progress | Run from package root |
| Large diffs can be slow | 📋 Backlog | Use `dump-diff --max-chars` to chunk |

---

## Feature Requests

To request a feature, open an issue with:
- Use case description
- Expected behavior
- Framework/tooling involved

