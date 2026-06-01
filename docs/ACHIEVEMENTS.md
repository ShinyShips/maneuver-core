# Achievements

The Achievements page is the shell-owned view for scout rewards, tiers, and leaderboard progress.

## Current page structure

`src/core/pages/AchievementsPage.tsx` currently shows:

- an achievements section for the selected scout
- a leaderboard sidebar
- aggregate achievement statistics
- a tier legend based on the current tier styles

If no scout is selected, the page renders an empty state instead of the full achievements view.

## Current data sources

The page uses:

- `useCurrentScout()` to determine whose achievements to render
- `AchievementsSection` for the main achievement list
- `getAchievementLeaderboard()` for leaderboard and summary data
- `ACHIEVEMENT_TIERS` from `src/game-template/gamification/`

## Yearly customization boundary

The starter yearly layer currently owns:

- `ACHIEVEMENT_DEFINITIONS`
- `ACHIEVEMENT_TIERS`

Those definitions include:

- icon
- category
- tier
- unlock requirements
- stakes reward

So the shell owns the page and leaderboard presentation, while the yearly layer owns the achievement catalog and tier styling.

## Relationship to scout management

Scout Management shows a summarized achievement view; this page is the detailed destination for that workflow.

## Related docs

- [SCOUT_MANAGEMENT.md](SCOUT_MANAGEMENT.md)
