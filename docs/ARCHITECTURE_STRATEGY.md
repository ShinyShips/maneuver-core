# Architecture strategy

**Status:** living document  
**Scope:** template-authority decisions for `maneuver-core`

This document records the architectural direction of the framework shell after the 2025 season extraction work.

## Strategic position

`maneuver-core` is the **template authority** for a family of yearly scouting repos. The main architectural choice is no longer "should this become a template?" That part already happened. The active strategy is to keep the shell stable enough that yearly repos can sync forward without re-forking core behavior every season.

## Current model

### Repository model

The chosen model remains a template-or-fork workflow:

```text
ShinyShips/maneuver-core
|- year-agnostic shell
|- shared contracts
|- inherited test harness
\- starter yearly implementation

ShinyShips/maneuver-2025
|- season-specific implementation
|- yearly customizations
\- descendant of the template authority

ShinyShips/maneuver-2026
|- season-specific implementation
|- synced core updates plus yearly changes
\- descendant of the template authority
```

This model still wins because it preserves:

- separate deployable bundles per season
- straightforward upstream syncs
- public reference implementations
- clear ownership boundaries between shell code and game code

## Architectural priorities

### 1. Stable framework shell

The shell should keep owning:

- routing and layouts
- persistence and local caches
- PWA lifecycle support
- transfer plumbing
- shared analysis and management pages

Shell-owned features should stay game-agnostic and reusable across seasons.

### 2. Strong yearly extension points

Yearly repos should customize behavior through:

- `GameProvider` bindings
- `src\game-template\` starter files
- game-specific screens and assets
- editable yearly test coverage

The shell should not learn season mechanics just to avoid an extension point.

### 3. Inherited test harness

The testing model is now part of the architecture, not just tooling.

- the **core regression suite** protects shell behavior
- the **game compatibility suite** protects the contract between shell and yearly bindings
- the harness is split into a **locked core contract layer** and an **editable yearly layer**

This reduces the chance that yearly repos silently drift away from the shell contract.

### 4. Offline-first discipline

Core features must continue to work without venue internet:

- IndexedDB as the persistence backbone
- QR and local file flows as offline transfer guarantees
- peer transfer treated as a distinct connectivity-dependent path

Any future feature that weakens offline reliability needs a higher bar than a normal shell enhancement.

## Ownership boundary

| Concern | Shell-owned (`maneuver-core`) | Yearly-owned (`maneuver-YYYY`) |
| --- | --- | --- |
| Routes and layouts | yes | no |
| Database and transfer infrastructure | yes | no |
| Shared pages | yes | no |
| Scoring math | no | yes |
| TBA field mappings | no | yes |
| Season-specific scouting interactions | no | yes |
| Team-specific branding or preferences | optional | yes |
| Editable season tests | no | yes |

## What changed over the last season

The biggest architectural shift was not a new subsystem. It was a clearer contract:

- `FrameworkShell` became the obvious app entry for shared behavior
- `GameProvider` bindings became the integration seam
- compatibility testing became an inherited structure instead of an informal expectation
- repo language was tightened around **template authority**, **framework shell**, **yearly repo**, and the test lanes

That means documentation and tests now matter as much as raw code separation when keeping the template healthy.

## Near-term roadmap

### Active focus

1. Keep shell docs synchronized with the real bindings and routes
2. Keep the compatibility suite small, stable, and inheritance-friendly
3. Reduce accidental coupling between `src\core\` and the starter game layer
4. Preserve low-friction syncs from core into yearly repos

### Explicit non-goals for now

These ideas stay exploratory until the template workflow proves insufficient:

- plugin runtime
- package-based distribution
- CLI app generator
- feature marketplace or community plugin ecosystem

Those may become useful later, but they should not complicate the shell before the template-authority model is mature.

## Decision heuristics

Use these when making changes:

1. **If every yearly repo needs it unchanged, prefer the shell.**
2. **If a feature depends on game semantics, prefer yearly bindings.**
3. **If it affects syncability, favor the simpler ownership model.**
4. **If it weakens offline guarantees, require a stronger justification.**
5. **If tests cannot express the boundary clearly, the boundary is probably too blurry.**

## Future options

If the number of descendants grows and sync pressure becomes painful, revisit:

- extracting some shell features into packages
- optional feature modules for bundle control
- bootstrap tooling for new yearly repos

Until then, the strategy is to make the template workflow excellent rather than prematurely replacing it.
