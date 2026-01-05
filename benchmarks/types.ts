/**
 * Type definitions for benchmark test cases.
 */
export interface BenchmarkDefinition {
  name: string;
  args: string[];
  /** Optional function to run before the benchmark loop */
  setup?: () => Promise<void>;
  /** Optional function to run after the benchmark loop */
  teardown?: () => Promise<void>;
}

/**
 * Benchmark size configuration.
 */
export type BenchmarkSize = 'small' | 'medium' | 'large';

/**
 * Benchmark context passed to benchmark cases.
 */
export interface BenchmarkContext {
  /** Working directory of the temp repository */
  cwd: string;
  /** Base branch name */
  baseBranch: string;
  /** Feature branch name */
  featureBranch: string;
}
