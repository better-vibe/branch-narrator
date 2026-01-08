---
"@better-vibe/branch-narrator": patch
---

Add 'artifacts' file category for build outputs like .tgz, .tar.gz, .zip, .wasm, .exe, and other binary/archive files. These are now categorized as "Build Artifacts" instead of "other".

Improve profile detection reasons to explain WHY a profile was detected, rather than the circular "Detected X project" message. For example, SvelteKit detection now shows reasons like:
- "Found src/routes/ directory (SvelteKit file-based routing)"
- "Found @sveltejs/kit in package.json dependencies"
