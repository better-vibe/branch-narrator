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
# Install branch-narrator CLI
npm install -g @better-vibe/branch-narrator

# Copy skills to your project
cp -r .claude/skills/ your-project/.claude/skills/

# Or install globally for all projects
cp -r .claude/skills/ ~/.claude/skills/
```

Then use in Claude Code:

```
/diff-facts    # Full structured analysis
/diff-risk     # Risk assessment
/diff-summary  # Quick overview
/diff-zoom     # Drill into specific finding
```

## Implemented Skills

Skills are located in `/.claude/skills/`:

| Skill | Location | Purpose |
|-------|----------|---------|
| `/diff-facts` | [.claude/skills/diff-facts/](../../.claude/skills/diff-facts/SKILL.md) | Full structured analysis with findings, risk, highlights |
| `/diff-risk` | [.claude/skills/diff-risk/](../../.claude/skills/diff-risk/SKILL.md) | Risk-focused assessment with evidence-backed flags |
| `/diff-summary` | [.claude/skills/diff-summary/](../../.claude/skills/diff-summary/SKILL.md) | Quick, token-efficient summary |
| `/diff-zoom` | [.claude/skills/diff-zoom/](../../.claude/skills/diff-zoom/SKILL.md) | Drill into specific finding or flag |

## Documentation

| Document | Description |
|----------|-------------|
| [Proposal](./proposal.md) | Full integration proposal with architecture and publishing |
| [Skills README](../../.claude/skills/README.md) | Installation and usage guide |
| [marketplace.json](../../.claude/skills/marketplace.json) | Plugin distribution metadata |

## Publishing

These skills can be published to:

| Destination | How |
|-------------|-----|
| **Anthropic Official** | Submit PR to [github.com/anthropics/skills](https://github.com/anthropics/skills) |
| **SkillsMP** | Register at [skillsmp.com](https://skillsmp.com) |
| **Awesome Claude Skills** | Submit PR to [github.com/travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) |
| **Direct sharing** | Users copy `.claude/skills/` directory |

See [proposal.md](./proposal.md#publishing-options) for detailed publishing instructions.

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
- [Agent Skills Open Standard](https://agentskills.io)
