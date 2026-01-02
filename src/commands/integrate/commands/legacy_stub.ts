
import { BRANCH_NARRATOR_USAGE, PR_DESCRIPTION_TEMPLATE } from "../shared.js";
import { cursorProvider } from "../providers/cursor.js";

/**
 * Legacy support for direct import of generateCursorRules.
 * This ensures tests or other modules relying on this function don't break immediately.
 */
export function generateCursorRules() {
  const ops = cursorProvider.generate(""); // cwd doesn't matter for this provider
  // Map back to the old shape if needed, but the provider returns FileOperation[] which is compatible with CursorRule[]
  // provided the types match. FileOperation has {path, content}, CursorRule has {path, content}.
  return ops;
}
