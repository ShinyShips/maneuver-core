# Game Compatibility Suite

The **Game compatibility suite** is the inherited part of the test harness that yearly repos sync from `maneuver-core` so shared framework behavior keeps a stable contract while season-specific coverage stays editable.

## Ownership boundaries

| Layer | Path | Ownership | What belongs here |
| --- | --- | --- | --- |
| **Locked core contract layer** | `src/core/testing/game-compatibility/locked-coreContract.test.tsx` and `src/core/testing/game-compatibility/renderGameCompatibilityShell.tsx` | `maneuver-core` | Unchanged inherited coverage for framework boot, required bindings, and the minimal compatibility path through the framework shell |
| **Yearly compatibility manifest** | `src/game-template/testing/compatibilityManifest.tsx` | yearly repo | The season's wiring for game bindings, selectors, and any lightweight contract fixture data consumed by the locked layer |
| **Editable yearly layer** | `src/game-template/testing/editable-yearly/` | yearly repo | Season-specific user-flow coverage such as scouting workflow, pit scouting, and other game-owned behaviors |

## How yearly repos should inherit this

1. Sync the locked core files from `maneuver-core` without editing them.
2. Keep `src/game-template/testing/compatibilityManifest.tsx` aligned with the current season's game implementation.
3. Add or rewrite tests only inside `src/game-template/testing/editable-yearly/` when your season changes UI or flow details.

## What the locked layer verifies

The inherited locked layer currently covers the smallest stable contract that every yearly repo should preserve:

- **Framework shell boot** with yearly bindings
- **Required bindings** for config, scoring, validation, analysis, transformation, and shared UI hooks
- A **minimal compatibility path** through the framework shell using inherited routes and yearly-owned game surfaces

This layer should stay focused on contract health, not detailed season UX.

## What the editable layer is for

Use the editable yearly layer for assertions that are expected to change when a season changes, such as:

- match scouting flow details
- pit scouting questions and special inputs
- season-specific options, labels, and interaction patterns
- any game-owned screens that replace or extend the template scaffolding

The starter tests in `src/game-template/testing/editable-yearly/` are examples of extension buckets, not permanent core-owned truth.

## Running the suite

```bash
npm run test:unit
npm run test:pr
npm run test:heavy
```

The compatibility suite runs as part of the unit layer today, so PR and heavy lanes both pick it up through `npm run test:unit`.
