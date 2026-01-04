/**
 * Global logger module for CLI diagnostics and warnings.
 * 
 * Ensures clean stdout/stderr separation:
 * - All diagnostic output goes to stderr
 * - Honors --quiet and --debug flags
 * - No output pollution in JSON mode
 */

/**
 * Logger state.
 */
interface LoggerState {
  quiet: boolean;
  debug: boolean;
}

const state: LoggerState = {
  quiet: false,
  debug: false,
};

/**
 * Configure logger with global flags.
 */
export function configureLogger(options: { quiet?: boolean; debug?: boolean }): void {
  // --quiet overrides --debug
  if (options.quiet) {
    state.quiet = true;
    state.debug = false;
  } else {
    state.quiet = false;
    state.debug = options.debug ?? false;
  }
}

/**
 * Get current logger configuration.
 */
export function getLoggerState(): Readonly<LoggerState> {
  return { ...state };
}

/**
 * Reset logger to default state (for testing).
 */
export function resetLogger(): void {
  state.quiet = false;
  state.debug = false;
}

/**
 * Log a warning message to stderr.
 * Suppressed by --quiet.
 */
export function warn(message: string): void {
  if (!state.quiet) {
    console.error(message);
  }
}

/**
 * Log an info message to stderr.
 * Suppressed by --quiet.
 */
export function info(message: string): void {
  if (!state.quiet) {
    console.error(message);
  }
}

/**
 * Log a debug message to stderr.
 * Only shown when --debug is enabled.
 * Suppressed by --quiet.
 */
export function debug(message: string): void {
  if (!state.quiet && state.debug) {
    console.error(`[DEBUG] ${message}`);
  }
}

/**
 * Log an error message to stderr.
 * Never suppressed (even with --quiet).
 */
export function error(message: string): void {
  console.error(message);
}
