---
name: clean-code-ts
description: Find deepening opportunities in a TypeScript codebase — turn shallow modules into deep ones, with TypeScript-specific interface idioms (discriminated unions, branded types, narrowing, ports as TS interfaces). Use when the user wants to improve TypeScript architecture, refactor `.ts`/`.tsx` for testability, consolidate tightly-coupled modules, or find clean-code opportunities in a TypeScript project (presence of `tsconfig.json` is a strong trigger).
---

<!-- Curated from mattpocock/skills via dmedina-dev/dev-forge (plugins/forge-mattpocock/skills/improve-codebase-architecture/) · MIT.
Adaptations on top of dev-forge's curation:
 (1) frontmatter description re-pointed at TypeScript projects (tsconfig.json, .ts/.tsx) so the skill auto-triggers on TS work.
 (2) added a "TypeScript focus" section per reference file (SKILL, INTERFACE-DESIGN, DEEPENING, LANGUAGE) with TS-specific idioms.
 (3) HTML-REPORT.md left untouched. -->

# Clean Code TS — Improve TypeScript Architecture

Surface architectural friction in TypeScript codebases and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability. The architecture vocabulary is generic; the idioms applied are TypeScript-specific.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary." Full definitions in [LANGUAGE.md](LANGUAGE.md).

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see [LANGUAGE.md](LANGUAGE.md) for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model. The domain language gives names to good seams; ADRs record decisions the skill should not re-litigate.

## TypeScript focus

The architecture vocabulary above is language-agnostic. When you apply it to a TypeScript codebase, prefer TS idioms over object-oriented or dynamic-language defaults:

- The **interface** of a module includes its TS types — invariants encoded in the type system count as interface, not as implementation detail.
- Prefer **discriminated unions** over boolean flags or class hierarchies — they make the interface narrower without losing expressiveness.
- Prefer **branded types** for invariants the type checker can carry (validated email, normalised path, non-empty array) over runtime asserts at every call site.
- Reach for `unknown` at every boundary that previously had `any`. `any` is an escape hatch in the implementation; `unknown` is honesty in the interface.
- Use `Readonly<T>` and `as const` on shared data so callers can't mutate state through the seam.
- Avoid TS `enum` — prefer string union types (`type Status = "pending" | "ready" | "failed"`) for narrower interfaces.
- For port interfaces (Step 3 in [DEEPENING.md](DEEPENING.md)), use TS `interface` declarations (or `type` aliases) — not abstract classes. Structural typing is the point.

## Process

### 1. Explore

Read the project's domain glossary first — typically `docs/glossary.md`, but if the project keeps its glossary inside `CLAUDE.md` (as a `## Domain language` section) or in zone-scoped files (`src/<zone>/glossary.md`), use whatever exists. Then read any ADRs in `docs/adr/` for the area you're touching.

Then use the Agent tool with `subagent_type=Explore` to walk the codebase. Don't follow rigid heuristics — explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?
- **TypeScript-specific friction signals**: pervasive `any`; runtime guards re-validating the same shape; option objects with 8+ optional fields; boolean flags fanning out into branches; `unknown` widened back to `any` instead of narrowed; class hierarchies where a discriminated union would do.

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates as an HTML report

Write a self-contained HTML file to a writable temp directory so nothing pollutes the repo. Prefer `${CLAUDE_PROJECT_DIR}/.tmp/` (sandbox-safe under Claude Code — ensure it's in `.gitignore`), falling back to `$TMPDIR` (or `%TEMP%` on Windows). Write to `<dir>/architecture-review-<timestamp>.html` so each run gets a fresh file. Open it for the user — `xdg-open <path>` on Linux, `open <path>` on macOS, `start <path>` on Windows — and tell them the absolute path.

The report uses **Tailwind via CDN** for layout and styling, and **Mermaid via CDN** for diagrams where a graph/flow/sequence reliably communicates the structure. Mix Mermaid with hand-crafted CSS/SVG visuals — use Mermaid when relationships are graph-shaped (call graphs, dependencies, sequences), and hand-built divs/SVG when you want something more editorial (mass diagrams, cross-sections, collapse animations). Each candidate gets a **before/after visualisation**. Be visual.

For each candidate, the same template as before, but rendered as a card:

- **Files** — which files/modules are involved (use real `.ts`/`.tsx` paths)
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change, with the TS idiom that anchors it (e.g. "collapse three classes into a discriminated union", "introduce a branded `OrderId` to remove call-site validation")
- **Benefits** — explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength** — one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use the project's glossary vocabulary for the domain, and [LANGUAGE.md](LANGUAGE.md) vocabulary for the architecture.** If the glossary defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service." If a term you need is not in the glossary, that's a finding worth surfacing in the grilling step.

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

See [HTML-REPORT.md](HTML-REPORT.md) for the full HTML scaffold, diagram patterns, and styling guidance.

Do NOT propose interfaces yet. After the file is written, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in the glossary?** Add the term to `docs/glossary.md` (or wherever the project keeps its glossary). Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update the glossary right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones.
- **Want to explore alternative interfaces for the deepened module?** See [INTERFACE-DESIGN.md](INTERFACE-DESIGN.md).
- **Concrete deepening mechanics — dependency categories, ports & adapters, test strategy?** See [DEEPENING.md](DEEPENING.md).
