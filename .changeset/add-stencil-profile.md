---
"@better-vibe/branch-narrator": minor
---

Add `stencil` profile for StencilJS support

Added a new `stencil` profile that automatically detects StencilJS projects. It includes:
- AST-based analyzer for Stencil components (tag, shadow, props, events, methods, slots).
- Risk reporting for breaking API changes (removed props, changed tags, etc.).
- Auto-detection based on `package.json` dependencies or `stencil.config.*`.

Use it with `branch-narrator facts --profile stencil` or rely on auto-detection.
