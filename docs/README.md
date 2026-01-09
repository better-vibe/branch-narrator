# branch-narrator Documentation

> A local-first, heuristics-only CLI that analyzes git diffs and generates structured PR descriptions.

## Documentation Index

| Section | Description |
|---------|-------------|
| [01-product](./01-product/) | Project overview, vision, and roadmap |
| [02-architecture](./02-architecture/) | System design, data flow, project structure |
| [03-analyzers](./03-analyzers/) | Individual analyzer documentation |
| [04-types](./04-types/) | TypeScript types and schemas |
| [05-cli](./05-cli/) | Command-line interface reference |
| [06-development](./06-development/) | Contributing, testing, coding standards |
| [07-profiles](./07-profiles/) | Framework profiles and detection |
| [08-rendering](./08-rendering/) | Output generation and risk scoring |
| [10-snapshots](./10-snapshots/) | Local workspace snapshots for agent iteration |

---

## Quick Start

```bash
# Install
bun add -D branch-narrator

# Generate PR description
branch-narrator pr-body

# Include uncommitted changes
branch-narrator pr-body -u

# Get JSON output
branch-narrator facts
```

---

## Core Principles

1. **Heuristics-only** - No LLM calls, no network requests
2. **Local-first** - Works entirely offline
3. **Evidence-based** - Never invents "why", only reports what changed
4. **Extensible** - Profile-based analyzer architecture

---

## Technology Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js >= 18 |
| Language | TypeScript 5.x |
| CLI | commander |
| Git | execa |
| Diff Parsing | parse-diff |
| Versioning | semver |
| Build | tsup |
| Testing | vitest |
