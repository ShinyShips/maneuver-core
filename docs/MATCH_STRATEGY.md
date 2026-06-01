# Match strategy

The Match Strategy page is the shell’s **field-planning workspace** for pre-match discussion and alliance planning.

## Current page structure

`src/core/pages/MatchStrategyPage.tsx` currently composes:

- `MatchHeader`
- `FieldStrategy`
- `TeamAnalysis`

The page loads the field image from the starter layer:

- `src/game-template/assets/field.png`

It gets match-planning state from `useMatchStrategy()`.

## What `useMatchStrategy()` currently does

The hook manages:

- the six selected teams
- available teams and available events
- current event filter
- debounced match-number lookup
- confirmed alliance selections
- team-stat lookup through `useAllTeamStats(...)`

For match lookup, it currently prefers:

1. locally cached match data in `localStorage`
2. scouting entries already stored in IndexedDB

## Configuration boundary

Yearly repos customize the page primarily through `src/game-template/match-strategy-config.ts`.

That config currently defines:

- phase tabs and labels
- which team stats to show for each phase
- field label positioning constants

The page is shell-owned, but both the field artwork and the displayed stat labels remain yearly-owned.

## Persistence behavior

The page keeps strategy canvases and event filters in browser storage so users can switch away and return without losing planning work.

## Ownership split

### Shell-owned

- page layout
- match header controls
- layered drawing canvas
- team analysis shell
- event and match lookup behavior

### Yearly-owned

- field image
- which stats appear in strategy analysis
- how those stats are labeled and formatted
- field coordinate constants

## Related docs

- [TEAM_STATS.md](TEAM_STATS.md)
- [SCOUTING_WORKFLOW.md](SCOUTING_WORKFLOW.md)
