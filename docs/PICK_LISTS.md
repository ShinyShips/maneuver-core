# Pick lists

The Pick Lists page is the shell-owned alliance-selection workspace built on top of aggregated team stats.

## Current page structure

`src/core/pages/PickListPage.tsx` uses `usePickList()` and renders:

- `PickListHeader`
- `MobilePickListLayout`
- `DesktopPickListLayout`

The page supports two related workflows:

1. ranking teams into one or more custom pick lists
2. assigning teams into alliance slots and backup pools

## Current `usePickList()` behavior

The hook currently manages:

- pick lists
- alliance assignments
- backup teams
- event filtering
- sorting and game-specific filters
- restoration snapshots for teams removed from lists during alliance assignment

The hook uses `useAllTeamStats(...)` as its stats source and persists its working state in local storage.

## Current storage model

Local storage currently holds:

- pick lists
- alliances
- backup pools
- selected event filter
- team-membership restoration snapshots

This page is intentionally local-first so scouting devices can work quickly during alliance selection without depending on network sync.

## Yearly customization boundary

The page reads yearly customization from `src/game-template/pick-list-config.ts`.

That file currently owns:

- sort options derived from strategy columns
- optional filter definitions
- sort-value resolution for nested stats
- optional game-specific team card and dialog components

The starter template ships with no custom filter options by default.

## Current notable behavior

- teams can be filtered to a selected event
- teams can be hidden once assigned to alliances
- accidental removals can restore a team back into prior pick-list positions using saved snapshots
- imports and exports keep portable pick-list JSON separate from local restoration metadata

## Related docs

- [STRATEGY_OVERVIEW.md](STRATEGY_OVERVIEW.md)
- [TEAM_STATS.md](TEAM_STATS.md)
