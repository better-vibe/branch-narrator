/**
 * Batch git operations.
 */

import { execa } from "execa";

/**
 * Fetch content for multiple file:ref pairs using git cat-file --batch.
 * @param items Array of { ref, path }
 * @param cwd Working directory
 * @returns Map of "ref:path" -> content
 */
export async function batchGetFileContent(
  items: Array<{ ref: string; path: string }>,
  cwd: string = process.cwd()
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map();

  const resultMap = new Map<string, string>();

  // Format input for git cat-file --batch: "ref:path"
  const inputs = items.map(item => `${item.ref}:${item.path}`);
  // IMPORTANT: git cat-file --batch expects a newline after the last item to process it
  const inputString = inputs.join("\n") + "\n";

  try {
    const subprocess = execa("git", ["cat-file", "--batch"], {
      cwd,
      input: inputString,
      encoding: "buffer", // We need buffer to handle byte offsets correctly
    });

    const { stdout: stdoutRaw } = await subprocess;
    // explicit cast to Buffer to avoid type errors with Uint8Array
    const stdout = Buffer.from(stdoutRaw);

    let currentIndex = 0;
    for (const inputKey of inputs) {
      if (currentIndex >= stdout.length) break;

      // Find the header line (ends with newline)
      const newlineIndex = stdout.indexOf("\n", currentIndex);
      if (newlineIndex === -1) break;

      const headerBuffer = stdout.subarray(currentIndex, newlineIndex);
      const headerString = headerBuffer.toString("utf-8");

      const [sha1, type, sizeStr] = headerString.split(" ");

      if (!sha1 || !type || !sizeStr) {
        // Should not happen on standard success output
        currentIndex = newlineIndex + 1;
        continue;
      }

      if (type === "missing") {
         // "<object> missing"
         currentIndex = newlineIndex + 1;
         continue;
      }

      const size = parseInt(sizeStr, 10);
      const contentStart = newlineIndex + 1;
      const contentEnd = contentStart + size;

      // Extract content based on byte offsets
      const contentBuffer = stdout.subarray(contentStart, contentEnd);
      resultMap.set(inputKey, contentBuffer.toString("utf-8"));

      // Advance index: content + newline
      currentIndex = contentEnd + 1;
    }

  } catch (error) {
    console.warn("Failed to batch fetch files:", error);
  }

  return resultMap;
}
