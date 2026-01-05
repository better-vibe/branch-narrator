/**
 * Benchmark runner for branch-narrator CLI commands.
 */
import { execa } from 'execa';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkDefinition, BenchmarkSize } from './types.js';
import { pretty } from './cases/pretty.js';
import { prBody } from './cases/pr-body.js';
import { facts } from './cases/facts.js';
import { dumpDiff } from './cases/dump-diff.js';
import { riskReport } from './cases/risk-report.js';
import { integrate } from './cases/integrate.js';
import { setupBenchmarkRepo, cleanupBenchmarkRepo, type BenchmarkRepo } from './helpers/temp-repo.js';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');
const CLI_PATH = resolve(PROJECT_ROOT, 'dist', 'cli.js');

const BENCHMARKS: BenchmarkDefinition[] = [
  pretty,
  prBody,
  facts,
  dumpDiff,
  riskReport,
  integrate,
];

/**
 * Parse command-line arguments.
 */
function parseArgs(): { size: BenchmarkSize; iterations: number } {
  const args = process.argv.slice(2);
  let size: BenchmarkSize = 'medium';
  let iterations = 5;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--size' && i + 1 < args.length) {
      const sizeArg = args[i + 1];
      if (sizeArg === 'small' || sizeArg === 'medium' || sizeArg === 'large') {
        size = sizeArg;
      } else {
        console.error(`Invalid size: ${sizeArg}. Use small, medium, or large.`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--iterations' && i + 1 < args.length) {
      const iterArg = parseInt(args[i + 1], 10);
      if (isNaN(iterArg) || iterArg < 1) {
        console.error(`Invalid iterations: ${args[i + 1]}. Must be a positive integer.`);
        process.exit(1);
      }
      iterations = iterArg;
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log('Usage: bun benchmarks/run.ts [options]');
      console.log('');
      console.log('Options:');
      console.log('  --size <small|medium|large>  Benchmark size (default: medium)');
      console.log('  --iterations <number>         Number of iterations per benchmark (default: 5)');
      console.log('  --help, -h                    Show this help message');
      process.exit(0);
    }
  }

  return { size, iterations };
}

async function runBenchmark() {
  const { size, iterations } = parseArgs();

  console.log(`Setting up benchmark repository (size: ${size})...`);
  let benchmarkRepo: BenchmarkRepo | null = null;

  try {
    // Setup temp repository once before all benchmarks
    benchmarkRepo = await setupBenchmarkRepo(size);
    console.log(`Benchmark repository created at: ${benchmarkRepo.cwd}`);

    // Build project once
    console.log('Building project...');
    await execa('bun', ['run', 'build']);

    console.log(`\nRunning benchmarks (${iterations} iterations per command)...`);
    console.log('------------------------------------------------------------');
    console.log('| Command      | Avg (ms) | Min (ms) | Max (ms) |');
    console.log('|--------------|----------|----------|----------|');

    for (const bench of BENCHMARKS) {
      const times: number[] = [];

      // Run setup if present
      if (bench.setup) {
        await bench.setup();
      }

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        try {
          // Replace ./dist/cli.js with absolute path in args
          const absoluteArgs = bench.args.map(arg => 
            arg === './dist/cli.js' ? CLI_PATH : arg
          );
          
          // Run benchmark in temp repo directory
          await execa('bun', absoluteArgs, { 
            stdio: 'ignore',
            cwd: benchmarkRepo.cwd,
          });
          const end = performance.now();
          times.push(end - start);
        } catch (error) {
          console.error(`Error running ${bench.name}:`, error);
        }
      }

      // Run teardown if present
      if (bench.teardown) {
        // Pass temp repo cwd to teardown for cleanup
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
  } finally {
    // Cleanup temp repository
    if (benchmarkRepo) {
      console.log('\nCleaning up benchmark repository...');
      await cleanupBenchmarkRepo(benchmarkRepo);
      console.log('Cleanup complete.');
    }
  }
}

runBenchmark().catch(console.error);
