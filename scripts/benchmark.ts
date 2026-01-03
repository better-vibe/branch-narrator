/**
 * Benchmark script for branch-narrator CLI commands.
 *
 * Measures the performance of all major CLI commands (pretty, pr-body, facts,
 * dump-diff, risk-report, integrate) by running them multiple times and
 * reporting average, minimum, and maximum execution times.
 *
 * Usage:
 *   bun run scripts/benchmark.ts
 *   npm run scripts/benchmark.ts
 *
 * The script automatically builds the project before running benchmarks
 * and runs each command 5 times to get reliable timing data.
 */

import { execa } from 'execa';
import { rm } from 'node:fs/promises';

const COMMANDS = [
  { name: 'pretty', args: ['./dist/cli.js', 'pretty', '--mode', 'branch', '--base', 'develop'] },
  { name: 'pr-body', args: ['./dist/cli.js', 'pr-body', '--base', 'develop'] },
  { name: 'facts', args: ['./dist/cli.js', 'facts', '--mode', 'branch', '--base', 'develop'] },
  { name: 'dump-diff', args: ['./dist/cli.js', 'dump-diff', '--mode', 'branch', '--base', 'develop', '--out', 'temp_diff'] },
  { name: 'risk-report', args: ['./dist/cli.js', 'risk-report', '--mode', 'branch', '--base', 'develop'] },
  { name: 'integrate', args: ['./dist/cli.js', 'integrate', 'cursor', '--dry-run'] },
];

const ITERATIONS = 5;

async function runBenchmark() {
  console.log('Building project...');
  await execa('bun', ['run', 'build']);

  console.log(`Running benchmarks (${ITERATIONS} iterations per command)...`);
  console.log('------------------------------------------------------------');
  console.log('| Command      | Avg (ms) | Min (ms) | Max (ms) |');
  console.log('|--------------|----------|----------|----------|');

  for (const cmd of COMMANDS) {
    const times: number[] = [];

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        await execa('bun', cmd.args, { stdio: 'ignore' });
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error(`Error running ${cmd.name}:`, error);
      }
    }

    if (times.length === 0) {
      console.log(
        `| ${cmd.name.padEnd(12)} | ${'N/A'.padEnd(8)} | ${'N/A'.padEnd(8)} | ${'N/A'.padEnd(8)} |`
      );
      continue;
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(
      `| ${cmd.name.padEnd(12)} | ${avg.toFixed(2).padEnd(8)} | ${min.toFixed(2).padEnd(8)} | ${max.toFixed(2).padEnd(8)} |`
    );

    // Clean up temp_diff if it exists
    if (cmd.name === 'dump-diff') {
      try {
        await rm('temp_diff', { recursive: true, force: true });
      } catch (e) {
        // ignore
      }
    }
  }
  console.log('------------------------------------------------------------');
}

runBenchmark().catch(console.error);
