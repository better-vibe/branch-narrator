# Skill Integration

> Use branch-narrator as a Claude Code skill for AI-powered diff analysis.

This documentation covers how to integrate branch-narrator into Claude Code and other AI coding assistants as callable skills.

## Overview

Branch-narrator's deterministic, structured output makes it ideal for AI agent consumption. By integrating as skills, AI assistants can:

- **Instantly understand** what changed in a codebase
- **Assess risk** with evidence-backed flags
- **Get framework-aware** context (Next.js, SvelteKit, React, etc.)
- **Drill down** into specific findings for details

## Quick Start

```bash
# Install branch-narrator
bun add -g @better-vibe/branch-narrator

# Copy skill manifests to your project
cp docs/12-skill-integration/examples/*.skill.yaml .claude/skills/
```

Then use in Claude Code:

```
/diff-facts    # Full structured analysis
/diff-risk     # Risk assessment
/diff-summary  # Quick overview
/diff-raw      # AI-optimized diff
/diff-zoom     # Drill into specific finding
```

## Documentation

| Document | Description |
|----------|-------------|
| [Proposal](./proposal.md) | Full integration proposal with architecture |
| [Examples](./examples/) | Ready-to-use skill manifests |

## Skill Manifests

| Skill | File | Purpose |
|-------|------|---------|
| `/diff-facts` | [diff-facts.skill.yaml](./examples/diff-facts.skill.yaml) | Full structured analysis |
| `/diff-risk` | [diff-risk.skill.yaml](./examples/diff-risk.skill.yaml) | Risk-focused assessment |
| `/diff-summary` | [diff-summary.skill.yaml](./examples/diff-summary.skill.yaml) | Quick token-efficient summary |
| `/diff-zoom` | [diff-zoom.skill.yaml](./examples/diff-zoom.skill.yaml) | Drill into specific finding |
| `/diff-raw` | [diff-raw.skill.yaml](./examples/diff-raw.skill.yaml) | AI-optimized raw diff |

## Why Use as a Skill?

| Without Skill | With Skill |
|---------------|------------|
| Run CLI manually | Simple slash command |
| Parse output yourself | Automatic context injection |
| No caching | Session-level caching |
| Raw JSON output | Formatted summaries |
| No discoverability | Shows in `/help` |

## Example Workflow

```
User: I just finished a feature. Can you review my changes?

Claude: Let me analyze your changes.

User: /diff-facts

[System injects structured analysis]

Claude: I've analyzed your changes:
- 8 files modified (+120/-45 lines)
- Risk score: 35/100 (moderate)
- Framework: Next.js App Router

Key findings:
1. New API route added at /api/users
2. Environment variable API_KEY added
3. Test gap in src/lib/auth.ts

Would you like me to help address any of these?
```

## Requirements

- Node.js >= 18
- branch-narrator >= 1.5.0
- Claude Code with skill support

## See Also

- [CLI Commands](../05-cli/commands.md)
- [JSON Output Format](../08-rendering/json.md)
- [Risk Scoring](../08-rendering/risk-scoring.md)
