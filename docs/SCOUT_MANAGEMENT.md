# Scout management

The Scout Management Dashboard is the shell-owned hub for scout performance, prediction history, and achievement progress.

## Current page structure

`src/core/pages/ScoutManagementDashboardPage.tsx` currently composes:

- `ScoutChartSection`
- `ScoutProfileWithSelector`
- `AchievementOverview`
- `ScoutStatsSummary`

It also links the user into the full Achievements page.

## Current data flow

The page uses:

- `useCurrentScout()` for the selected scout
- `useScoutDashboard()` for aggregate dashboard data

`useScoutDashboard()` currently:

- loads scouts via `getAllScouts()`
- loads achievement-derived stakes via `getAchievementStats(...)`
- exposes selectable metrics like `totalStakes`, `accuracy`, and streak values
- builds bar, line, and table-oriented chart data

## Important current-state note

The line-chart path is still simulated from current totals rather than built from real per-match historical progression. The docs should reflect that instead of implying a true historical replay model.

## Ownership split

### Shell-owned

- dashboard layout
- chart presentation
- profile-and-summary composition
- current-scout selection flow

### Yearly-owned or gamification-owned

- scout data shape and storage
- achievement definitions and tier styling
- any season-specific prediction or reward semantics

## Related docs

- [ACHIEVEMENTS.md](ACHIEVEMENTS.md)
