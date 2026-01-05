# Benchmarks

This directory contains the benchmarking infrastructure for `branch-narrator`.

## Quick Start

```bash
# Run benchmarks with default settings (medium size, 5 iterations)
bun run benchmark

# Run with specific size
bun run benchmark --size small    # Quick smoke test
bun run benchmark --size medium   # Standard benchmarking
bun run benchmark --size large    # Stress testing

# Custom number of iterations
bun run benchmark --iterations 10

# Combined
bun run benchmark --size large --iterations 20

# Help
bun run benchmark --help
```

## How It Works

Benchmarks create a temporary git repository with:
- **Committed changes**: Multiple commits on a feature branch vs. base branch
- **Staged changes**: Files added to the git index but not committed
- **Unstaged changes**: Working tree modifications not in the index

This ensures benchmarks are:
- **Deterministic**: Same input produces same output
- **Reproducible**: Works consistently across machines
- **Isolated**: Doesn't affect your repository
- **Meaningful**: Always exercises real diff analysis

## Size Configurations

| Size   | Committed Files | Staged Files | Unstaged Files | Lines/File | Includes Renames |
|--------|-----------------|--------------|----------------|------------|------------------|
| Small  | 5               | 2            | 2              | ~50        | No               |
| Medium | 20              | 5            | 5              | ~100       | Yes              |
| Large  | 50              | 10           | 10             | ~200       | Yes              |

## File Structure

```
benchmarks/
├── run.ts                  # Main benchmark runner
├── types.ts                # TypeScript type definitions
├── helpers/
│   └── temp-repo.ts        # Temporary repository generator
└── cases/                  # Individual benchmark cases
    ├── pretty.ts           # Terminal output benchmark
    ├── pr-body.ts          # PR description generation
    ├── facts.ts            # Structured facts extraction
    ├── dump-diff.ts        # Diff export to files
    ├── risk-report.ts      # Risk assessment
    └── integrate.ts        # Tool integration (dry-run)
```

## Adding New Benchmarks

1. Create a new file in `cases/`:

```typescript
import type { BenchmarkDefinition } from '../types.js';

export const myCommand: BenchmarkDefinition = {
  name: 'my-command',
  args: ['./dist/cli.js', 'my-command', '--mode', 'branch', '--base', 'develop'],
};
```

2. Import and add to `run.ts`:

```typescript
import { myCommand } from './cases/my-command.js';

const BENCHMARKS: BenchmarkDefinition[] = [
  // ... existing benchmarks
  myCommand,
];
```

## GitHub Actions

Benchmarks can be run manually in GitHub Actions:

1. Go to **Actions** tab
2. Select **Benchmark** workflow
3. Click **Run workflow**
4. Choose size and iterations
5. Click **Run workflow**

## Documentation

For detailed information, see:
- [Benchmarking Methodology](../docs/06-development/benchmarking.md)
- [Test Documentation](../tests/benchmark-temp-repo.test.ts)

## Testing

Run benchmark infrastructure tests:

```bash
bun test tests/benchmark-temp-repo.test.ts
```

These tests verify:
- Repository creation and cleanup
- Size configurations
- File variety
- Git state (committed, staged, unstaged)
- Integration with all diff modes
