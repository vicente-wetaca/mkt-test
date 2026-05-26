# clean-code-ts

A Claude Code skill that surfaces architectural friction in TypeScript codebases and proposes **deepening opportunities** — turning shallow modules into deep ones — using TypeScript-specific interface idioms.

## Attribution

This plugin is a customization of an upstream skill, with attribution preserved through the lineage:

| Layer | Source | License |
|---|---|---|
| Original author | **Matt Pocock** — [mattpocock/skills](https://github.com/mattpocock/skills) (`skills/engineering/improve-codebase-architecture/`) | MIT |
| Intermediate curator | **dmedina** — [dmedina-dev/dev-forge](https://github.com/dmedina-dev/dev-forge) (`plugins/forge-mattpocock/skills/improve-codebase-architecture/`) | MIT |
| This plugin | **mkt-test** marketplace — TypeScript-focused customization | MIT |

The architectural vocabulary (Module, Interface, Depth, Seam, Adapter, Leverage, Locality) and the report-driven workflow are unchanged from upstream. The TypeScript-specific idioms and naming conventions are added on top. See [`.claude-plugin/customizations.json`](.claude-plugin/customizations.json) for the full diff vs. upstream.

## What this skill does

Triggers when the user wants to improve architecture, refactor for testability, or find clean-code opportunities in a TypeScript project. The skill:

1. Reads the project's domain glossary (`docs/glossary.md` or a `## Domain language` section in `CLAUDE.md`) and any ADRs in `docs/adr/`.
2. Explores the codebase looking for shallow modules — interfaces nearly as complex as their implementations.
3. Produces a self-contained HTML report with side-by-side before/after diagrams for each candidate, ranked by recommendation strength.
4. Drops into a grilling loop on the candidate the user picks — designing the deepened interface, classifying its dependencies (in-process / local-substitutable / ports-and-adapters / true-external), and replacing layered tests with interface-level ones.

## TypeScript focus

On top of the upstream skill, this version applies TS idioms by default:

- **Discriminated unions** over boolean flags or class hierarchies
- **Branded types** for invariants
- **`unknown` at boundaries**, narrowed inwards (`any` is an escape hatch in the implementation, not interface honesty)
- **`Readonly<T>` / `as const`** so callers can't mutate state through the seam
- **String union types** instead of `enum`
- **TS `interface` as port**, structural typing for adapters (no abstract classes for ports)
- **Option-object signatures** over positional booleans

Naming conventions that ship with the skill:

- Avoid vacuous nouns (`Data`, `Info`, `Manager`, `Helper`)
- Earned suffixes only (`Repository`, `Gateway`, `Policy`)
- Domain glossary wins over generic terms

## Files

```
clean-code-ts/
├── .claude-plugin/
│   ├── plugin.json
│   └── customizations.json   # upstream tracking + diff vs upstream (dev-forge schema)
├── skills/
│   └── improve-codebase-architecture/   # dir name matches upstream for update-check; user-facing name (in SKILL.md frontmatter) is clean-code-ts
│       ├── SKILL.md          # entry point, frontmatter triggers on TS projects
│       ├── DEEPENING.md      # dependency categories + testing strategy
│       ├── INTERFACE-DESIGN.md # parallel sub-agent interface exploration
│       ├── LANGUAGE.md       # the shared architecture + TS naming vocabulary
│       └── HTML-REPORT.md    # scaffold for the HTML candidate report
└── README.md
```

> **Upstream sync**: this plugin is a fork of `dmedina-dev/dev-forge` → `plugins/forge-mattpocock/skills/improve-codebase-architecture/` (which itself curates `mattpocock/skills`). The local skill directory is named `improve-codebase-architecture` to match upstream so an update-check tool can map files 1:1; the user-facing skill name (`clean-code-ts`) lives in `SKILL.md` frontmatter. See [`../../docs/upstream-sync.md`](../../docs/upstream-sync.md) for the marketplace convention.

## Installation

From the `mkt-test` marketplace:

```
/plugin marketplace add vicente-wetaca/mkt-test
/plugin install clean-code-ts@mkt-test
```

## License

MIT, matching the upstream licenses of `mattpocock/skills` and `dmedina-dev/dev-forge`.
