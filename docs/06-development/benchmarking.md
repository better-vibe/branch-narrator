# Benchmarking

This document describes the benchmarking infrastructure for `branch-narrator`, including methodology, sizing, and how to run benchmarks locally and in CI.

## Overview

The benchmark suite measures the performance of `branch-narrator` CLI commands against deterministic, reproducible git repositories. Benchmarks run in isolated temporary repositories to ensure consistent results across different machines and environments.

## Benchmark Methodology

### Deterministic Temporary Repositories

Unlike traditional benchmarks that run against the developer's current repository state, our benchmarks:

1. **Create a temporary git repository** during setup with a predictable structure
2. **Generate controlled changes** including:
   - **Committed changes**: Multiple commits on a feature branch vs. base branch
   - **Staged changes**: Files added to the git index but not committed
   - **Unstaged changes**: Working tree modifications not in the index
3. **Run benchmarks** in isolation within the temporary repository
4. **Clean up** the temporary repository after completion

This approach ensures:
- **Reproducibility**: Same results across different machines and runs
- **Isolation**: Developer's repository remains untouched
- **Meaningful work**: Every benchmark run exercises real diff analysis
- **Controlled complexity**: Benchmark size can be adjusted via configuration

### Benchmark Sizes

Three benchmark sizes are available, each generating a different scale of changes:

#### Small
- **Committed files**: 5
- **Staged files**: 2
- **Unstaged files**: 2
- **Lines per file**: ~50
- **Includes renames**: No
- **Use case**: Quick smoke tests, rapid iteration

#### Medium (Default)
- **Committed files**: 20
- **Staged files**: 5
- **Unstaged files**: 5
- **Lines per file**: ~100
- **Includes renames**: Yes
- **Use case**: Standard benchmarking, CI runs

#### Large
- **Committed files**: 50
- **Staged files**: 10
- **Unstaged files**: 10
- **Lines per file**: ~200
- **Includes renames**: Yes
- **Use case**: Stress testing, performance regression detection

### File Variety

Generated repositories include a mix of file types to exercise different analyzers:
- TypeScript files (`.ts`) in `src/`
- JavaScript files (`.js`) in `lib/`
- Markdown files (`.md`) in `docs/`
- JSON files (`.json`) in `config/`

This ensures benchmarks test real-world scenarios with multiple file types.

## Running Benchmarks Locally

### Basic Usage

Run benchmarks with default settings (medium size, 5 iterations):

```bash
bun run benchmark
```

### Custom Size

Run benchmarks with a specific size:

```bash
bun run benchmark --size small
bun run benchmark --size medium
bun run benchmark --size large
```

### Custom Iterations

Adjust the number of iterations per benchmark:

```bash
bun run benchmark --iterations 10
```

### Combined Options

```bash
bun run benchmark --size large --iterations 20
```

### Help

View all available options:

```bash
bun run benchmark --help
```

## Running Benchmarks in CI

Benchmarks are configured as a GitHub Actions workflow with manual dispatch.

### Triggering a Benchmark Run

1. Go to the **Actions** tab in the GitHub repository
2. Select **Benchmark** from the workflow list
3. Click **Run workflow**
4. Choose options:
   - **size**: `small`, `medium`, or `large`
   - **iterations**: Number of iterations (default: 5)
5. Click **Run workflow** to start

### Example CI Configuration

The workflow accepts `workflow_dispatch` inputs:

```yaml
workflow_dispatch:
  inputs:
    size:
      description: 'Benchmark size (small, medium, or large)'
      required: true
      default: 'medium'
      type: choice
      options:
        - small
        - medium
        - large
    iterations:
      description: 'Number of iterations per benchmark'
      required: false
      default: '5'
      type: string
```

## Benchmark Commands

The following CLI commands are benchmarked:

| Command | Description |
|---------|-------------|
| `pretty` | Colorized terminal output |
| `pr-body` | Generate PR description |
| `facts` | Extract structured facts |
| `dump-diff` | Export diff to files |
| `risk-report` | Generate risk assessment |
| `integrate` | Integration with tools (dry-run) |

All commands run with `--mode branch --base develop` to compare the feature branch against the base branch in the temporary repository.

## Understanding Results

Benchmark output shows timing statistics:

```
------------------------------------------------------------
| Command      | Avg (ms) | Min (ms) | Max (ms) |
|--------------|----------|----------|----------|
| pretty       | 245.23   | 232.11   | 267.89   |
| pr-body      | 198.45   | 185.67   | 215.32   |
| facts        | 187.92   | 175.23   | 203.45   |
| dump-diff    | 312.78   | 295.34   | 335.67   |
| risk-report  | 223.56   | 210.45   | 241.23   |
| integrate    | 156.34   | 145.67   | 172.89   |
------------------------------------------------------------
```

- **Avg**: Average execution time across all iterations
- **Min**: Fastest execution time
- **Max**: Slowest execution time

### Interpreting Performance

- **Consistent results**: Small variance (Max - Min) indicates stable performance
- **Large variance**: High variance may indicate system load or optimization opportunities
- **Relative comparison**: Compare commands to identify performance bottlenecks
- **Trend analysis**: Track changes over time to detect regressions

## Implementation Details

### Helper Module: `benchmarks/helpers/temp-repo.ts`

The `temp-repo.ts` module provides:

- `setupBenchmarkRepo(size)`: Creates a temporary git repository with the specified size configuration
- `cleanupBenchmarkRepo(repo)`: Removes the temporary repository

### Benchmark Runner: `benchmarks/run.ts`

The runner:

1. Parses CLI arguments (`--size`, `--iterations`)
2. Creates a temporary repository using `setupBenchmarkRepo()`
3. Builds the project once before all benchmarks
4. Runs each benchmark multiple times with the temp repo as `cwd`
5. Cleans up the temporary repository on completion (even on errors)

### Benchmark Cases: `benchmarks/cases/*.ts`

Each benchmark case defines:
- **name**: Command identifier
- **args**: CLI arguments to pass to the built CLI (`./dist/cli.js`)
- **setup** (optional): Pre-benchmark initialization
- **teardown** (optional): Post-benchmark cleanup

## Extending Benchmarks

### Adding a New Benchmark Case

1. Create a new file in `benchmarks/cases/`:

```typescript
import type { BenchmarkDefinition } from '../types.js';

export const myCommand: BenchmarkDefinition = {
  name: 'my-command',
  args: ['./dist/cli.js', 'my-command', '--mode', 'branch', '--base', 'develop'],
};
```

2. Import and add to `benchmarks/run.ts`:

```typescript
import { myCommand } from './cases/my-command.js';

const BENCHMARKS: BenchmarkDefinition[] = [
  // ... existing benchmarks
  myCommand,
];
```

### Customizing Benchmark Sizes

Edit `benchmarks/helpers/temp-repo.ts` to adjust size configurations:

```typescript
const SIZE_CONFIGS: Record<BenchmarkSize, SizeConfig> = {
  small: {
    committedFiles: 5,
    stagedFiles: 2,
    // ...
  },
  // ...
};
```

## Troubleshooting

### Benchmarks Fail in CI

- Check that the workflow has correct permissions
- Verify that `bun` is available in the CI environment
- Ensure all dependencies are installed (`bun install`)

### Inconsistent Results

- Use more iterations (`--iterations 10` or higher)
- Run benchmarks on a quiet system (close other applications)
- Use the same benchmark size for comparison

### Out of Memory Errors

- Reduce the benchmark size (`--size small`)
- Reduce iterations (`--iterations 3`)
- Check system resources

## Best Practices

1. **Run benchmarks on dedicated hardware** for consistent results
2. **Use the same size** when comparing performance changes
3. **Track results over time** to detect performance regressions
4. **Document significant changes** in benchmark results
5. **Run benchmarks before and after** major refactoring

## Future Enhancements

Potential improvements to the benchmark suite:

- **Profile-specific benchmarks**: Test SvelteKit, React Router profiles separately
- **Memory profiling**: Track memory usage alongside execution time
- **Comparison reports**: Automatically compare against baseline results
- **Visualization**: Generate graphs of benchmark trends over time
- **Parallel execution**: Run independent benchmarks concurrently
