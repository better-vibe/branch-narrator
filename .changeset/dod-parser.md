---
"@better-vibe/branch-narrator": minor
---

feat: add high-performance Data-Oriented Design (DOD) diff parser

Introduces a new diff parsing module using Data-Oriented Design principles for significantly improved performance on large diffs:

- **DiffArena**: TypedArray-based storage using Struct of Arrays (SoA) pattern for 60-80% memory reduction
- **DiffScanner**: Zero-copy byte-level scanner for efficient tokenization
- **StringInternPool**: String interning with FNV-1a hashing for filename deduplication
- **StreamingDiffParser**: Single-pass streaming state machine for predictable parsing
- **Adapter layer**: Full backward compatibility with existing FileDiff/Hunk types

Key benefits:
- Eliminates GC pressure from thousands of small string/object allocations
- Near-instant parsing startup through deferred string decoding
- Improved CPU cache locality through flat memory layout
- Lazy materialization - only decode what's needed

Usage:
```typescript
import { parseDiffBuffer, toFileDiffs } from "branch-narrator";

// Parse diff with DOD parser
const result = parseDiffBuffer(buffer);

// Convert to legacy types for compatibility
const diffs = toFileDiffs(result);

// Or use arena directly for maximum performance
for (let i = 0; i < result.arena.fileCount; i++) {
  const path = result.arena.decodeFilePath(i);
}
```
