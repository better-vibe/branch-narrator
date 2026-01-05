---
"@better-vibe/branch-narrator": minor
---

Add deterministic benchmarks with configurable temporary git repositories

Benchmarks now generate isolated, reproducible git repositories with committed, staged, and unstaged changes. This ensures consistent, meaningful benchmark results across different machines and environments.

**Features:**
- Configurable benchmark sizes (small/medium/large) via `--size` CLI flag
- Temporary git repositories with realistic file variety (TypeScript, JavaScript, Markdown, JSON)
- Support for all diff modes (branch, staged, unstaged, all)
- Automatic cleanup after benchmark completion
- GitHub Actions workflow with manual dispatch inputs for size and iterations

**Usage:**
```bash
# Run benchmarks with default settings (medium, 5 iterations)
bun run benchmark

# Run with specific size and iterations
bun run benchmark --size large --iterations 10

# View help
bun run benchmark --help
```

**GitHub Actions:**
Use workflow_dispatch to manually trigger benchmarks with custom configuration in the Actions tab.
