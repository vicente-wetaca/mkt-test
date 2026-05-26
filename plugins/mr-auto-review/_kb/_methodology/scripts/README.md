# MR-auto-review KB Scripts

Standalone TypeScript package (no monorepo workspace) that builds the KB for the MR-auto-review plugin.

## Setup

```bash
cd .claude/plugins/MR-auto-review/_kb/_methodology/scripts
npm install
```

## Commands

| Command | Purpose |
|---|---|
| `npm run select` | List ~40 MR IIDs meeting Wave 0 filters |
| `npm run extract -- <iid>` | Extract one MR to `.dev/MR-auto-review/_research/raw/<iid>.json` |
| `npm run distill` | Aggregate raw corpus into `_kb/<concern>.md` drafts |
| `npm test` | Run unit tests for pure modules |

## Token

Reads GitLab token from `git remote get-url origin` (expects `glpat-*` embedded).
