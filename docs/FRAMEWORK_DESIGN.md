# Framework design

**Status:** current contract reference  
**Primary source of truth:** `src\types\game-interfaces.ts` and `src\core\app\frameworkShell.tsx`

This document describes the current contract between the **template authority** (`maneuver-core`) and each **yearly repo** that inherits the framework shell.

## Design goal

`maneuver-core` owns the shell. A yearly repo owns the season.

That means:

- the framework shell owns shared routes, layouts, persistence, transfer plumbing, and shell-wide pages
- the yearly repo supplies game bindings and game-specific surfaces
- the inherited test harness protects the contract between those two layers

## Current runtime model

The app entrypoint renders `FrameworkShell`, and `FrameworkShell` creates the shared router, wraps it in `GameProvider`, and injects the current game bindings.

```tsx
<GameProvider
  config={gameBindings.config}
  scoring={gameBindings.scoring}
  validation={gameBindings.validation}
  analysis={gameBindings.analysis}
  transformation={gameBindings.transformation}
  ui={gameBindings.ui}
>
  <MainLayout />
</GameProvider>
```

The framework shell then serves the shared routes for scouting, transfer, strategy, validation, pit scouting, scout management, and developer utilities.

**Important current-state note:** the repo is still in a hybrid integration state. Some yearly-owned surfaces are consumed through `ui` bindings today, while some scouting pages still import starter components directly from `src/game-template/components/`.

## Required binding set

Every yearly repo must provide this binding set to the shell:

| Binding | Interface | Owned by | Purpose |
| --- | --- | --- | --- |
| `config` | `GameConfig` | yearly repo | Year and game metadata shown by the shell |
| `scoring` | `ScoringCalculations<T>` | yearly repo | Auto, teleop, endgame, and total scoring logic |
| `validation` | `ValidationRules<T>` | yearly repo | TBA comparison logic and thresholds |
| `analysis` | `StrategyAnalysis<T>` | yearly repo | Team stats, rates, badges, and display configuration |
| `transformation` | `DataTransformation` | yearly repo | Converts raw scouting interactions into persisted counters |
| `ui` | `UIComponents<T>` | yearly repo | Season-specific screens and form surfaces |

This is the contract the **game compatibility suite** protects.

## Interface summary

### `GameConfig`

Current required fields:

```ts
interface GameConfig {
  year: number;
  gameName: string;
}
```

Optional metadata like descriptions, durations, dimensions, and feature flags can exist, but the current shell only requires `year` and `gameName`.

### `ScoringCalculations<T>`

The scoring contract is intentionally small:

```ts
interface ScoringCalculations<T extends ScoutingEntryBase> {
  calculateAutoPoints(entry: T): number;
  calculateTeleopPoints(entry: T): number;
  calculateEndgamePoints(entry: T): number;
  calculateTotalPoints(entry: T): number;
}
```

All game-specific point math stays out of `src\core\`.

### `DataTransformation`

The shell records scouting interactions, but yearly repos decide how those raw arrays and status objects become stored counters.

Typical responsibilities:

- collapsing auto and teleop action arrays into counters
- flattening robot status objects
- normalizing start-position or option selections into persisted fields

### `ValidationRules<T>`

Validation is a yearly-owned contract because TBA score breakdowns change every season.

The shell expects yearly bindings to provide:

- validation categories
- alliance aggregation
- total alliance score calculation
- `validateMatch(...)`
- default validation thresholds/config

### `StrategyAnalysis<T>`

This interface powers shell-owned analysis pages with yearly-owned calculations.

It includes:

- `calculateBasicStats`
- optional `calculateAdvancedStats`
- stat section definitions
- rate section definitions
- match badge definitions
- start position configuration

This split is why the shell can keep generic pages like Team Stats while still showing season-specific metrics.

### `UIComponents<T>`

`UIComponents<T>` is the declared UI contract, but the current shell only consumes part of it directly.

Current direct runtime usage:

| Property | Current usage |
| --- | --- |
| `StatusToggles` | used directly by the endgame shell and provided as a default shell binding |
| `PitScoutingQuestions` | used directly by the pit scouting page |
| `ScoutOptionsContent` | used directly by the game start options sheet |

Declared-but-not-fully-wired surfaces:

| Property | Notes |
| --- | --- |
| `GameStartScreen` | declared in the interface, but current `GameStartPage` still owns the main screen and only accepts `ScoutOptionsContent` from `ui` |
| `AutoStartScreen` | declared optional, but current `AutoStartPage` imports `AutoStartFieldSelector` directly from `src/game-template/components` |
| `AutoScoringScreen` | declared in the interface, but current `AutoScoringPage` imports starter scoring components directly |
| `TeleopScoringScreen` | declared in the interface, but current `TeleopScoringPage` imports starter scoring components directly |
| `EndgameScreen` | declared optional, but current endgame flow uses shell-owned layout plus `StatusToggles` |

This means the yearly repo currently provides season-specific surfaces through **both**:

1. `GameProvider` bindings
2. direct starter-component imports from `src/game-template/components/`

The docs should describe that hybrid state until the pages finish converging on one extension model.

## Framework shell responsibilities

The current shell owns these routes and should remain year-agnostic:

- home
- scouting workflow pages
- JSON, QR, and peer transfer pages
- team stats
- strategy overview
- match strategy
- pick list
- scout management
- pit scouting and pit assignments
- achievements
- match validation
- clear data
- dev utilities

If a feature is required by most teams and can stay game-agnostic, it belongs in the shell. If it depends on season scoring semantics or season-specific interaction design, it belongs in yearly bindings.

## Starter game-template pattern

The `src\game-template\` directory is a starter yearly implementation, not the framework contract itself.

Today it uses a schema-driven pattern:

- `game-schema.ts` defines workflow toggles, action keys, toggle keys, strategy columns, and TBA mappings
- `scoring.ts`, `analysis.ts`, `transformation.ts`, and supporting configs derive from that schema
- `components\` provides the starter page components currently imported by several shell-owned scouting pages
- `testing\` provides yearly compatibility wiring and editable season coverage

That starter pattern is useful because it keeps the yearly layer centralized, but yearly repos are still bound by the interfaces above, not by a requirement to mirror the starter file layout exactly.

## Database boundary

Framework persistence should stay typed around shared base entities such as `ScoutingEntryBase`, not season-specific entry types in core-owned tables.

Good:

```ts
scoutingEntries!: Dexie.Table<ScoutingEntryBase, string>;
```

Bad:

```ts
scoutingEntries!: Dexie.Table<ScoutingEntry2026, string>;
```

Core persistence remains generic; yearly repos extend data through their own entry shapes and transformations.

## Testing boundary

The inherited harness is split deliberately:

| Layer | Path | Ownership |
| --- | --- | --- |
| Core regression suite | framework tests and shell coverage | `maneuver-core` |
| Locked core contract layer | `src\core\testing\game-compatibility\` | `maneuver-core` |
| Yearly compatibility manifest | `src\game-template\testing\compatibilityManifest.tsx` | yearly repo |
| Editable yearly layer | `src\game-template\testing\editable-yearly\` | yearly repo |

Use the locked layer to protect the contract. Use the editable layer to test season-specific UX and scouting behavior.

## Decision rule

Before adding or documenting a feature, ask:

1. Is this behavior year-agnostic or season-specific?
2. Can the shell own it without learning game semantics?
3. Does it preserve offline-first behavior?
4. Should yearly repos inherit it unchanged, or customize it through bindings?

If the answer depends on the season's scoring model, field semantics, or custom UI, it belongs in the yearly repo.
