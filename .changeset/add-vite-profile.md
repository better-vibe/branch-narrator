---
"@better-vibe/branch-narrator": minor
---

Add Vite profile with vite-config analyzer

- Added new `vite` profile for generic Vite-based projects
- Added `vite-config` analyzer to detect Vite configuration changes
- Detects breaking changes in Vite config (base path, build target, output directory, etc.)
- Detects common Vite plugins (React, Vue, Svelte, PWA, etc.)
- Auto-detects Vite projects when `vite` dependency is present
- Added documentation for vite profile and vite-config analyzer
