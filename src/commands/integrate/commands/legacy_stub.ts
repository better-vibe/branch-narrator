
import { cursorProvider } from "../providers/cursor.js";

/**
 * Legacy support for direct import of generateCursorRules.
 * This ensures tests or other modules relying on this function don't break immediately.
 */
export async function generateCursorRules() {
  // Use empty string for cwd - this will default to .md format since no .mdc files exist
  const ops = await cursorProvider.generate("");
  return ops;
}
