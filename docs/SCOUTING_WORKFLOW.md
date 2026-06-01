# Scouting workflow

This guide describes the **current shared scouting flow** in the framework shell and the places where yearly repos still customize it.

## Shared route flow

The shell owns this route sequence:

```text
Game Start
  -> Auto Start (optional)
  -> Auto Scoring (optional)
  -> Teleop Scoring (optional)
  -> Endgame (optional, or final submit step)
```

The active flow is controlled by `workflowConfig` in `src/game-template/game-schema.ts`.

## Current integration model

The scouting workflow is still in a **hybrid state**:

- the shell owns the route sequence, navigation, and submission plumbing
- `GameProvider` supplies some yearly-owned surfaces through bindings
- several scouting pages still import starter components directly from `src/game-template/components/`

That means docs should describe the workflow as it exists now, not as a fully binding-driven future state.

## Page ownership

| Page | Shell-owned file | Current yearly customization path |
| --- | --- | --- |
| Game Start | `src/core/pages/GameStartPage.tsx` | `ui.ScoutOptionsContent` plus game schema and game config |
| Auto Start | `src/core/pages/AutoStartPage.tsx` | starter `AutoStartFieldSelector` component |
| Auto Scoring | `src/core/pages/AutoScoringPage.tsx` | starter scoring components from `src/game-template/components/` |
| Teleop Scoring | `src/core/pages/TeleopScoringPage.tsx` | starter scoring components from `src/game-template/components/` |
| Endgame | `src/core/pages/EndgamePage.tsx` | shell page plus bound `StatusToggles` and yearly transformation logic |

## Data flow

The workflow still passes transient state forward through router state and local storage, then converts it into a persisted scouting entry on the submit step.

High-level flow:

1. Match setup data is collected on Game Start
2. Per-phase action arrays and status objects accumulate during scouting
3. The final page calls the yearly `transformation` implementation
4. The shell saves the normalized scouting entry to IndexedDB

## Current responsibilities

### Framework shell

- route sequence and page navigation
- shared page layout
- draft persistence and recovery
- final database write
- generic validation around required workflow data

### Yearly repo

- which phases are enabled in `game-schema.ts`
- start-position UI and mappings
- scoring buttons and status controls
- how action arrays become stored counters through `DataTransformation`
- season-specific labels, piece names, and endgame semantics

## Important current-state caveat

The shell already has a declared `UIComponents<T>` contract, but auto, teleop, and parts of auto-start still rely on direct starter imports today. If that changes later, this guide should be updated alongside `FRAMEWORK_DESIGN.md`.

## Related docs

- [FRAMEWORK_DESIGN.md](FRAMEWORK_DESIGN.md)
- [GAME_COMPONENTS.md](GAME_COMPONENTS.md)
- [DATA_TRANSFORMATION.md](DATA_TRANSFORMATION.md)
- [NAVIGATION_SETUP.md](NAVIGATION_SETUP.md)
