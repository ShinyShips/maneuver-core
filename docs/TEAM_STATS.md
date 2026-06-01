# Team stats

The Team Stats page is a **shell-owned analysis surface** that renders yearly-owned calculations and display definitions.

## Current architecture

The page lives at `src/core/pages/TeamStatsPage.tsx` and gets its display behavior from `useTeamStats()`, which reads the current `analysis` binding from `GameProvider`.

`useTeamStats()` currently provides:

- available teams from both scouting entries and pit scouting entries
- available events
- `calculateStats(...)`
- display configuration from `analysis.getStatSections()`, `getRateSections()`, `getMatchBadges()`, and `getStartPositionConfig()`

## Current extension points

The page is generic at the top level, but still uses starter components for several tab bodies.

Current default component sources:

- `@/game-template/components/team-stats/StatOverview`
- `@/game-template/components/team-stats/ScoringAnalysis`
- `@/game-template/components/team-stats/AutoAnalysis`
- `@/game-template/components/team-stats/PerformanceAnalysis`
- `@/game-template/components/team-stats/PitDataDisplay`

So the current Team Stats model is:

1. shell-owned page frame and selectors
2. analysis-driven stat and rate definitions
3. starter yearly components for several detailed render sections

## Filtering behavior

The page supports:

- single-team selection
- optional comparison team
- one or more event filters
- local field visibility preferences
- auto-hide for uncollected stats

Selected event filters are normalized before stats are calculated:

- no event or `"all"` means all events
- one event stays a single event filter
- multiple selected events are passed as a string array

## Pit data integration

The page includes pit scouting in two ways:

- team and event selectors include teams/events that exist only in pit scouting data
- the pit tab uses a yearly-rendered pit data component, defaulting to `PitDataDisplay`

## What yearly repos own

- the actual statistics returned by `analysis.calculateBasicStats(...)`
- stat sections, rate sections, match badges, and start position display config
- starter tab components that render season-specific details

## What the shell owns

- overall page structure
- selectors and event filtering
- comparison workflow
- field visibility settings
- shared cards, tabs, and attribution UI

## Related docs

- [FRAMEWORK_DESIGN.md](FRAMEWORK_DESIGN.md)
- [STRATEGY_OVERVIEW.md](STRATEGY_OVERVIEW.md)
- [PIT_SCOUTING.md](PIT_SCOUTING.md)
