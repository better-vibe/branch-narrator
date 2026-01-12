---
"@better-vibe/branch-narrator": minor
---

Normalize analyzer coverage across all profiles for consistent analysis capabilities.

**React profile** now includes all core analyzers:
- Added: impactAnalyzer, tailwindAnalyzer, typescriptConfigAnalyzer
- Added: analyzeLargeDiff, analyzeLockfiles, analyzeTestGaps
- Added: analyzeSQLRisks, analyzeCIWorkflows, analyzeInfra, analyzeAPIContracts

**Stencil profile** expanded from 5 to 17 analyzers:
- Added: envVarAnalyzer, cloudflareAnalyzer, vitestAnalyzer, securityFilesAnalyzer
- Added: typescriptConfigAnalyzer and all risk analyzers

**SvelteKit profile** enhanced:
- Added: impactAnalyzer, tailwindAnalyzer

**Next.js profile** enhanced:
- Added: impactAnalyzer, analyzeSQLRisks, tailwindAnalyzer

**Default profile** enhanced:
- Added: graphqlAnalyzer for automatic GraphQL schema change detection

**Quality improvements:**
- Test-gap findings now categorized as "quality" instead of "tests" for clarity
- Test-gap evidence now shows specific files changed without tests
- Removed redundant `isTestFile` field from impact-analysis findings


**Improved test-gap reporting:**
- Test-gap findings now show in a new "quality" category instead of "tests"
- Added clear evidence showing which production files changed without tests
- Prevents confusion between actual test changes and test coverage warnings
