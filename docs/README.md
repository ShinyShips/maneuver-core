# maneuver-core documentation

This folder is the user-facing documentation set for the **template authority**. Start with the contract and navigation docs first, then work outward into feature and page guides.

## Read these first

1. [../CONTEXT.md](../CONTEXT.md) - Shared language for the framework shell, yearly repos, and test harness
2. [FRAMEWORK_DESIGN.md](FRAMEWORK_DESIGN.md) - Current framework contract and yearly integration points
3. [ARCHITECTURE_STRATEGY.md](ARCHITECTURE_STRATEGY.md) - Architecture direction and ownership boundaries
4. [GAME_COMPATIBILITY_SUITE.md](GAME_COMPATIBILITY_SUITE.md) - Locked vs editable testing layers

## Framework contract and customization

| Topic | Purpose |
| --- | --- |
| [GAME_COMPONENTS.md](GAME_COMPONENTS.md) | How game-specific components plug into the shared shell |
| [CONTEXTS_GUIDE.md](CONTEXTS_GUIDE.md) | Framework contexts and where yearly bindings enter |
| [HOOKS_REFERENCE.md](HOOKS_REFERENCE.md) | Hook reference for framework and extension points |
| [UTILITY_HOOKS.md](UTILITY_HOOKS.md) | Smaller utility hooks used across the shell |
| [NAVIGATION_SETUP.md](NAVIGATION_SETUP.md) | Route and workflow navigation setup |

## Core feature guides

| Topic | Purpose |
| --- | --- |
| [DATABASE.md](DATABASE.md) | IndexedDB schema, persistence flow, and exports |
| [PWA.md](PWA.md) | Install/update behavior and offline-first shell support |
| [QR_DATA_TRANSFER.md](QR_DATA_TRANSFER.md) | Offline transfer via QR fountain packets |
| [JSON_DATA_TRANSFER.md](JSON_DATA_TRANSFER.md) | File export and import flows |
| [PEER_TRANSFER.md](PEER_TRANSFER.md) | WebRTC room-based peer transfer |
| [DATA_TRANSFORMATION.md](DATA_TRANSFORMATION.md) | How raw scouting interactions become persisted counters |
| [CLEAR_DATA.md](CLEAR_DATA.md) | Data-reset and cleanup flows |
| [DEV_UTILITIES.md](DEV_UTILITIES.md) | Debug and seeding tools exposed by the shell |

## Shared pages

| Topic | Purpose |
| --- | --- |
| [SCOUTING_WORKFLOW.md](SCOUTING_WORKFLOW.md) | Shared scouting route flow and yearly-owned surfaces |
| [TEAM_STATS.md](TEAM_STATS.md) | Team statistics page and analysis bindings |
| [STRATEGY_OVERVIEW.md](STRATEGY_OVERVIEW.md) | Strategy table configuration and usage |
| [MATCH_STRATEGY.md](MATCH_STRATEGY.md) | Match-specific strategy workflow |
| [MATCH_VALIDATION.md](MATCH_VALIDATION.md) | TBA comparison flow and validation responsibilities |
| [PICK_LISTS.md](PICK_LISTS.md) | Pick list behavior and sorting hooks |
| [PIT_ASSIGNMENTS.md](PIT_ASSIGNMENTS.md) | Pit assignment workflow |
| [PIT_SCOUTING.md](PIT_SCOUTING.md) | Pit scouting shell plus game-owned questions |
| [SCOUT_MANAGEMENT.md](SCOUT_MANAGEMENT.md) | Scout profiles, dashboards, and leaderboards |
| [ACHIEVEMENTS.md](ACHIEVEMENTS.md) | Gamification and achievement surfaces |

## Historical or transitional docs

| Topic | Purpose |
| --- | --- |
| [TEST_HARNESS_PLAN.md](TEST_HARNESS_PLAN.md) | Historical planning context for the inherited harness rollout |

## Documentation maintenance rules

- Keep `src\core\` docs year-agnostic.
- Describe season-specific behavior as **yearly repo** customization, not framework behavior.
- Prefer current repo filenames and paths exactly as they exist.
- If an interface changes, update [FRAMEWORK_DESIGN.md](FRAMEWORK_DESIGN.md) and any affected feature docs in the same sweep.
