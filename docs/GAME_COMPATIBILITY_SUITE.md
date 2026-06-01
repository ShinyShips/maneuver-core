# Game compatibility suite

The **game compatibility suite** is the inherited part of the test harness that protects the contract between the framework shell and yearly game bindings.

## Why it exists

Yearly repos need freedom to change season UI and scoring behavior, but the shell still needs a stable minimum contract. The compatibility suite is where that contract gets exercised.

## Inheritance layers

| Layer | Path | Ownership | Purpose |
| --- | --- | --- | --- |
| Locked core contract layer | `src/core/testing/game-compatibility/` | `maneuver-core` | Protects the minimum shell-to-yearly contract |
| Yearly compatibility manifest | `src/game-template/testing/compatibilityManifest.tsx` | yearly repo | Supplies bindings, selectors, and fixture data for the locked layer |
| Editable yearly layer | `src/game-template/testing/editable-yearly/` | yearly repo | Covers season-specific flows that are expected to change |

## What the locked core layer checks

The locked layer should stay narrow and durable. Today it verifies that a yearly repo can:

- provide the required bindings (`config`, `scoring`, `validation`, `analysis`, `transformation`, `ui`)
- boot the framework shell successfully
- render a minimal path through shared shell routes with yearly-owned components attached

It is intentionally not the place for detailed season UX assertions.

## What the yearly manifest owns

`compatibilityManifest.tsx` is the yearly repo's adapter for the locked tests.

It should define:

- `gameCompatibilityBindings`
- `gameCompatibilitySelectors`
- `gameCompatibilityContractFixture`

That keeps the locked tests generic while still letting each season describe its own selectors, fixture entry shape, and test-friendly UI wrappers.

## What belongs in the editable yearly layer

Put season-specific coverage here, including:

- detailed match scouting flows
- pit scouting question behavior
- season-specific labels and interaction patterns
- any yearly UI that intentionally changes from the starter implementation

The editable yearly layer should evolve every season without needing a core repo change.

## Rules for yearly repos

1. Sync the locked core contract layer forward without editing it.
2. Keep the yearly manifest aligned with the current bindings and selector surface.
3. Add or rewrite season UX tests only in `src/game-template/testing/editable-yearly/`.
4. If a contract change is needed, update the shell, the locked layer, and the docs together in `maneuver-core`.

## Running the harness

```bash
npm run test:unit
npm run test:pr
npm run test:heavy
```

The compatibility suite currently runs inside the unit layer, so both PR and heavy lanes inherit it through `npm run test:unit`.

## Change policy

Treat compatibility changes as contract changes.

If you widen or narrow what the locked layer expects:

1. update the shell or interface surface
2. update the locked tests
3. update the yearly manifest expectations if needed
4. update [FRAMEWORK_DESIGN.md](FRAMEWORK_DESIGN.md) and this document

That keeps the shell, tests, and docs moving together.
