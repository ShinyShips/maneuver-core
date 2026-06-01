# Game components

This guide explains how a **yearly repo** plugs season-specific UI into the shared **framework shell** without editing core shell behavior.

## Current integration model

The current repo is in a **hybrid integration state**.

Some surfaces come through the `ui` binding in `GameProvider`:

- `StatusToggles`
- `PitScoutingQuestions`
- `ScoutOptionsContent`

Other scouting surfaces are still imported directly from `src/game-template/components/` by shell-owned pages:

- `AutoStartFieldSelector`
- `ScoringSections`
- `StatusToggles` inside the auto and teleop pages

So the current extension story is:

1. `GameProvider` bindings for shell-aware extension points
2. starter component imports for older page integrations that have not been fully moved behind bindings yet

Document the implementation that exists today, not the contract we intend to reach later.

## `ui` binding surfaces in current use

These are the `ui` surfaces the shell actually consumes today:

| Component | Used by |
| --- | --- | --- |
| `StatusToggles` | endgame shell and default shell bindings |
| `PitScoutingQuestions` | pit scouting page |
| `ScoutOptionsContent` | game start options sheet |

The broader `UIComponents<T>` interface exists in `src/types/game-interfaces.ts`, but some declared surfaces are not yet the main runtime path for the current shell pages.

## Where yearly repos should edit

The starter implementation keeps these components in:

```text
src/game-template/components/
|- auto-start/
|- game-start/
|- pit-scouting/
\- scoring/
```

The exact folder structure is a starter pattern, not a hard contract. What matters today is that the yearly repo maintains both:

- the starter component exports expected by the current shell pages
- the `ui` binding surfaces expected by `GameProvider`

## Workflow control

Yearly repos can change which scouting pages participate in the shared workflow through `src/game-template/game-schema.ts`.

Typical toggles include:

- whether auto start is shown
- whether endgame is shown
- which page becomes the submit step

See [SCOUTING_WORKFLOW.md](SCOUTING_WORKFLOW.md) for the route flow details. The shell owns the route set; the yearly repo owns which parts of the game flow are active and what the game-specific surfaces render.

## Practical ownership examples

### Match setup

Use `GameStartScreen` and optional `ScoutOptionsContent` for season-specific setup inputs such as:

- pre-match option panels
- game-piece mode toggles
- driver-station or robot-state selectors

In the current implementation, the shell mainly consumes `ScoutOptionsContent` here. The surrounding page, routing, and persistence plumbing remain shell-owned.

### Auto and teleop scoring

The current auto and teleop pages still import starter components directly, mainly `ScoringSections` and `StatusToggles`, for season-specific interaction surfaces such as:

- action buttons
- scoring sections
- status switches
- phase-specific controls

The shell owns the navigation between phases and hands yearly-owned data through the existing scouting flow.

### Auto start and endgame

The current auto-start flow uses `AutoStartFieldSelector` from the starter component layer, while the endgame flow uses shell-owned layout plus bound `StatusToggles`.

Use those surfaces when your season needs dedicated behavior for:

- start position selection
- endgame selection or climb state
- extra phase-specific prompts

If a yearly workflow disables either page, the shell skips it.

### Pit scouting

Use `PitScoutingQuestions` for season-specific form sections while the shell continues to own the common pit scouting page, storage, and export flows.

## Best practices

### Do

- keep framework docs and code year-agnostic
- keep season labels, controls, and field semantics inside the yearly layer
- prefer extending the `ui` binding or existing starter component exports instead of hardcoding seasonal branches in `src/core`
- use `game-schema.ts` and yearly configs to centralize season-specific options where possible

### Do not

- add new one-off seasonal imports into `src/core` when an existing binding or starter export can cover the need
- hardcode game-piece names or scoring semantics in `src/core`
- treat the starter component folder layout as the true contract

## When to change the framework instead

If multiple yearly repos would benefit from a new extension point, add that surface to the shell contract deliberately:

1. update `src/types/game-interfaces.ts`
2. wire the new binding through the shell
3. update the compatibility suite
4. update this document and [FRAMEWORK_DESIGN.md](FRAMEWORK_DESIGN.md)

If only one season needs the behavior, keep it in the yearly repo.
