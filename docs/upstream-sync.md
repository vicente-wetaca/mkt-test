# Upstream sync convention

This marketplace adopts the upstream-tracking principle introduced by
[`dmedina-dev/dev-forge`'s `forge-keeper:update-check`](https://github.com/dmedina-dev/dev-forge/blob/main/plugins/forge-keeper/commands/update-check.md).
Plugins in `plugins/` that are forks of an external source declare their
upstream, their local customizations, and the rules for syncing future updates.

## Scope

Applies to every plugin under `plugins/<name>/` that originated from an
external github repo (e.g. `clean-code-ts`, which forks from dev-forge).

Plugins copied from a private/local source with no public upstream
(e.g. `mr-auto-review`, copied from a Wetaca workspace) are treated as
**native** to this marketplace: they ship no `customizations.json` and the
update-check workflow skips them.

## The `customizations.json` schema

Each external plugin includes `.claude-plugin/customizations.json` with:

| Field | Required | Purpose |
|---|---|---|
| `origin` | yes | The immediate upstream we sync from. `type` must be `"github"`. Includes `repo`, `path` (subdir within repo, empty string if root), `ref` (branch or tag), `commit` (SHA at fetch), `fetched_at` (date). |
| `lineage` | optional | Earlier layers of attribution (e.g. the original author behind the curator we track). Informational; not used by the update flow. |
| `upstream_status` | yes | Last update-check result: `last_checked`, `latest_ref`, `latest_commit`, `has_updates`, `summary`, `changes[]`. |
| `local_layout` | optional | Description of where upstream files live locally when the layout differs from upstream (e.g. when we renamed a skill directory). |
| `customizations[]` | yes | Each local edit on top of upstream: `id` (`custom-NN`), `type` (`modified`/`removed`/`excluded`/`added`/`unchanged`), `target` (path relative to `origin.path`), `summary`, `reason`. |

A reference example: [`plugins/clean-code-ts/.claude-plugin/customizations.json`](../plugins/clean-code-ts/.claude-plugin/customizations.json).

## Local layout vs. upstream layout

When a plugin renames the upstream skill directory (for a custom user-facing
name like `clean-code-ts`), the local **directory name should still match the
upstream's** so that a file-level update check can map paths 1:1. The
user-facing skill name is overridden in `SKILL.md` frontmatter (`name: <new>`),
which is what Claude Code uses for skill activation.

Local example:

```
plugins/clean-code-ts/
└── skills/
    └── improve-codebase-architecture/   ← matches upstream dir name
        └── SKILL.md                     ← frontmatter: `name: clean-code-ts`
```

If the local layout cannot match upstream, document the mapping in
`customizations.json` → `local_layout`.

## Update-check workflow

Run any tool that implements the dev-forge update-check protocol against
this marketplace. The canonical implementation is the
[`/forge-keeper:update-check`](https://github.com/dmedina-dev/dev-forge/blob/main/plugins/forge-keeper/skills/forge-keeper/references/update-check-guide.md)
slash command. The workflow:

1. **Scan** — walk `plugins/*/.claude-plugin/customizations.json`. Classify
   each plugin as external (has `origin.type: "github"`) or native (no file
   or `origin.type: "native"`).
2. **Check** — for each external plugin, query upstream:
   - **Tag refs** (e.g. `v1.2.3`): `gh api repos/{repo}/releases/latest`.
   - **Branch refs** (e.g. `main`): `gh api repos/{repo}/commits/{branch}`,
     scoped to `origin.path` when non-empty.
3. **Summarise** — produce a table per plugin: current vs. latest, plus a
   conflict count for files that overlap with any `modified` customization.
4. **Detail on request** — show per-plugin release notes / commit diffs,
   with each file annotated as `clean change` or `⚠ conflicts with custom-NN`.
5. **Apply on request** — clone the upstream into `.upstream/<repo-slug>/`
   (gitignored, shared per upstream repo), `git diff` the old and new refs,
   and:
   - Copy clean changes into the local plugin.
   - For each conflict, present the upstream diff and the local version,
     and let the user choose `keep local` / `use upstream` / `manual merge`.
   - Never overwrite `.claude-plugin/customizations.json` or
     `.claude-plugin/plugin.json` — those are always preserved.
6. **Update tracking** — write the new `origin.commit`, `origin.fetched_at`,
   and `upstream_status` block. Validate with `python3 -m json.tool`.
7. **Commit** — stage and commit with a message of the form
   `feat({plugin-name}): update to {new-ref} from {old-ref}`.

## Authoring a new external plugin in this marketplace

1. Copy the upstream into `plugins/<plugin-name>/`, preserving the upstream's
   internal directory structure (especially skill / agent / command dirs).
2. Make the customizations you want.
3. Write `customizations.json` describing every change, with the
   `origin` baseline (`commit` = the upstream SHA at the time of fork).
4. Add a `lineage` block if the upstream is itself a fork.
5. Register the plugin in `.claude-plugin/marketplace.json`.

The first run of update-check will find the plugin and treat its current
state as the baseline.

## Native plugins

Plugins without `customizations.json` are skipped by the update-check
workflow. Use this for plugins authored here or copied from sources that
don't have a public upstream we want to track.

To explicitly mark a plugin as native (instead of omitting the file), set:

```json
{
  "origin": {
    "type": "native",
    "note": "<why this plugin has no external upstream>"
  }
}
```
