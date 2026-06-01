# Strategy overview

The Strategy Overview page is the shell’s **table-and-chart analytics workspace** for aggregated team stats.

## Current page structure

`src/core/pages/StrategyOverviewPage.tsx` composes three main pieces:

- `StrategyHeader`
- `StrategyChart`
- `TeamStatsTableEnhanced`

The page uses:

- `useTeamStatistics(...)` to aggregate team stats
- `useChartData(...)` to transform table stats into chart-ready series
- `strategyConfig` for column, preset, and chart metadata

## Current behavior

The page stores user preferences in local storage:

- selected aggregation type
- chart type
- selected chart metric
- column filters
- visible columns

It also supports:

- multi-event filtering
- aggregation mode switching
- numeric column filters
- column presets
- bar, scatter, box, and stacked charts

## Configuration boundary

The shell is generic, but the page still depends on yearly config for what stats exist.

Current yearly-owned inputs:

- `strategyConfig.columns`
- `strategyConfig.presets`
- any metric labels used by charts and filters

In descendant yearly repos this often resolves through a season-owned `@/game/strategy-config` export, while the starter template keeps the config under `src/game-template/strategy-config.ts`.

## Ownership split

### Shell-owned

- page layout
- chart and table components
- filter UI
- local preference persistence
- generic aggregation and chart hooks

### Yearly-owned

- which metrics are exposed
- which columns are visible by default
- which presets exist
- the meaning of the stats themselves

## Related docs

- [TEAM_STATS.md](TEAM_STATS.md)
- [PICK_LISTS.md](PICK_LISTS.md)
