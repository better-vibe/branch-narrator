/**
 * Benchmark test case for the 'zoom' command.
 */
import { execa } from 'execa';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenchmarkDefinition } from '../types.js';

// Get the project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '../..');
const CLI_PATH = resolve(PROJECT_ROOT, 'dist', 'cli.js');

// Store a finding ID to use in the benchmark
let findingIdForBenchmark: string = 'finding.file-summary#000000000000';

/**
 * Setup function to get a findingId from the facts command.
 * This runs once before the benchmark iterations.
 */
async function setupZoomBenchmark(): Promise<void> {
  try {
    // Run facts command to get findings
    const { stdout } = await execa('bun', [
      CLI_PATH,
      'facts',
      '--mode', 'branch',
      '--base', 'develop',
      '--format', 'json',
      '--no-timestamp',
    ], {
      cwd: process.cwd(),
    });

    const factsOutput = JSON.parse(stdout);
    
    // Get the first finding ID if available
    if (factsOutput.findings && factsOutput.findings.length > 0) {
      const firstFinding = factsOutput.findings[0];
      if (firstFinding.findingId) {
        findingIdForBenchmark = firstFinding.findingId;
      }
    }
  } catch (error) {
    console.warn('Failed to get finding ID for zoom benchmark, using fallback');
  }
}

export const zoom: BenchmarkDefinition = {
  name: 'zoom',
  get args() {
    return ['./dist/cli.js', 'zoom', '--finding', findingIdForBenchmark, '--mode', 'branch', '--base', 'develop', '--format', 'json'];
  },
  setup: setupZoomBenchmark,
};

