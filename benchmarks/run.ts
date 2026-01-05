/**
 * Benchmark runner for branch-narrator CLI commands.
 */
import { execa } from 'execa';
import type { BenchmarkDefinition } from './types.js';
import { pretty } from './cases/pretty.js';
import { prBody } from './cases/pr-body.js';
import { facts } from './cases/facts.js';
import { dumpDiff } from './cases/dump-diff.js';
import { riskReport } from './cases/risk-report.js';
import { integrate } from './cases/integrate.js';

const BENCHMARKS: BenchmarkDefinition[] = [
  pretty,
  prBody,
  facts,
  dumpDiff,
  riskReport,
  integrate,
];

const ITERATIONS = 5;

async function runBenchmark() {
  console.log('Building project...');
  await execa('bun', ['run', 'build']);

  console.log(`Running benchmarks (${ITERATIONS} iterations per command)...`);
  console.log('------------------------------------------------------------');
  console.log('| Command      | Avg (ms) | Min (ms) | Max (ms) |');
  console.log('|--------------|----------|----------|----------|');

  for (const bench of BENCHMARKS) {
    const times: number[] = [];

    // Run setup if present
    if (bench.setup) {
      await bench.setup();
    }

    for (let i = 0; i < ITERATIONS; i++) {
      const start = performance.now();
      try {
        await execa('bun', bench.args, { stdio: 'ignore' });
        const end = performance.now();
        times.push(end - start);
      } catch (error) {
        console.error(`Error running ${bench.name}:`, error);
      }
    }

    // Run teardown if present
    if (bench.teardown) {
      await bench.teardown();
    }

    if (times.length === 0) {
      console.log(
        `| ${bench.name.padEnd(12)} | ${'N/A'.padEnd(8)} | ${'N/A'.padEnd(8)} | ${'N/A'.padEnd(8)} |`
      );
      continue;
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(
      `| ${bench.name.padEnd(12)} | ${avg.toFixed(2).padEnd(8)} | ${min.toFixed(2).padEnd(8)} | ${max.toFixed(2).padEnd(8)} |`
    );
  }
  console.log('------------------------------------------------------------');
}

runBenchmark().catch(console.error);
