# Branch Narrator Skills for Claude Code

AI-powered git diff analysis skills using branch-narrator CLI.

## Installation

### Option 1: Copy Skills Directory

Copy the `.claude/skills/` directory to your project:

```bash
cp -r .claude/skills/ your-project/.claude/skills/
```

### Option 2: Global Installation

Copy to your home directory for all projects:

```bash
cp -r .claude/skills/ ~/.claude/skills/
```

### Option 3: Plugin Installation (if supported)

```bash
/plugin install branch-narrator-skills@better-vibe
```

## Prerequisites

Install branch-narrator CLI:

```bash
npm install -g @better-vibe/branch-narrator
# or
bun add -g @better-vibe/branch-narrator
```

## Available Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **diff-facts** | `/diff-facts` | Full structured analysis with findings, risk, highlights |
| **diff-risk** | `/diff-risk` | Risk-focused assessment with evidence-backed flags |
| **diff-summary** | `/diff-summary` | Quick, token-efficient summary |
| **diff-zoom** | `/diff-zoom <id>` | Drill into specific finding or flag |

## Usage Examples

### Full Analysis
```
/diff-facts
/diff-facts --staged
/diff-facts --mode branch --base main
```

### Risk Assessment
```
/diff-risk
/diff-risk --threshold 50
/diff-risk --only security,db
```

### Quick Summary
```
/diff-summary
```

### Drill Down
```
/diff-zoom finding.env-var#abc123
/diff-zoom flag.db.destructive_sql#def456
```

## Workflow Example

```
User: I just finished implementing a feature. Can you review?

[Run /diff-facts]

Claude: I've analyzed your changes:
- 8 files modified (+120/-45 lines)
- Risk score: 42/100 (moderate)
- Framework: Next.js detected

Key findings:
1. New API route at /api/users (POST)
2. Environment variable API_KEY added
3. Test gap in src/lib/auth.ts

The database migration at line 15 contains a DROP TABLE.
Would you like me to investigate that? Run `/diff-zoom flag.db.destructive_sql#...`
```

## Publishing Your Own Skills

These skills follow the [Agent Skills Open Standard](https://agentskills.io).

To publish:
1. Fork this repository or create your own
2. Add/modify skills in `.claude/skills/`
3. Update `marketplace.json` with skill metadata
4. Submit to:
   - [Anthropic Skills Repository](https://github.com/anthropics/skills) (official)
   - [SkillsMP](https://skillsmp.com/) (community)
   - [Awesome Claude Skills](https://github.com/travisvn/awesome-claude-skills) (curated list)

## License

MIT - Same as branch-narrator
