---
name: diff-summary
description: Quick, token-efficient summary of git changes. Use for fast context checks or conversational refreshes without full analysis.
allowed-tools: Bash(branch-narrator:*)
---

# Quick Diff Summary

Get a concise summary of current git changes without full analysis overhead.

## Instructions

1. Run: `branch-narrator facts --format json | jq -c '{highlights, stats, risk: {score: .risk.score, level: .risk.level}, profile: .profile.detected}'`
2. If jq is not available, run `branch-narrator facts --format json --pretty` and extract only the summary fields
3. Present a brief, scannable summary

## Response Format

Keep it short - 3-5 lines maximum:

```
**Changes:** [n] files (+[add]/-[del] lines)
**Risk:** [score]/100 ([level])
**Framework:** [profile if not default]

Key points:
• [highlight 1]
• [highlight 2]
• [highlight 3]
```

## When to Use

- Quick context check mid-conversation
- Refreshing understanding of current state
- When full `/diff-facts` analysis is overkill
- Before deciding if deeper analysis is needed

## Tips

- If risk > 50, suggest running `/diff-risk` for details
- If user seems concerned about specific area, suggest `/diff-zoom`
- Keep response under 100 words

## Requirements

```bash
npm install -g @better-vibe/branch-narrator
```
