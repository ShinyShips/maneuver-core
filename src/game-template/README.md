# Game Template

This directory contains all **Game-Specific Implementation** code. When setting up for a new FRC season, this is the directory where almost all customization will happen. The `core` directory is the framework and should ideally remain untouched.

## Directory Structure

```
game-template/
├── components/              # UI Components customized for the game
│   ├── pick-list/           # Pick list team cards and stats dialog
│   ├── team-stats/          # MatchStatsDialog, PerformanceAnalysis
│   └── [other UI]           # Game-specific UI components
├── gamification/            # Achievement and prediction system
│   ├── achievements.ts      # Achievement definitions
│   ├── database.ts          # Gamification database operations
│   ├── types.ts             # Gamification type definitions
│   └── index.ts             # Module exports
├── hooks/                   # Game-specific React hooks
├── game-schema.ts           # ⭐ SINGLE SOURCE OF TRUTH for actions, toggles, points
├── analysis.ts              # Stats, rates, and badges definitions
├── constants.ts             # Re-exports point values from schema
├── scoring.ts               # Scoring calculation logic
├── strategy-config.ts       # Strategy Overview page configuration
├── transformation.ts        # Raw data → database counters
├── pick-list-config.ts      # Pick list sorting and components
└── README.md                # This file
```

## Key Files to Customize

### 1. Game Schema (`game-schema.ts`) ⭐ START HERE

**The single source of truth for game-specific configuration:**

```typescript
export const actions: ActionDefinition[] = [
    {
        key: 'action1',
        label: 'Coral L4',
        autoPoints: 6,
        teleopPoints: 4
    },
    {
        key: 'action2', 
        label: 'Coral L3',
        autoPoints: 4,
        teleopPoints: 3
    },
    // ... more actions
];

export const toggles: ToggleDefinition[] = [
    { key: 'toggle1', label: 'Mobility', defaultValue: false },
    { key: 'toggle2', label: 'Played Defense', defaultValue: false },
];

export const endgameOptions: EndgameOption[] = [
    { key: 'option1', label: 'Climb', points: 10 },
    { key: 'option2', label: 'Park', points: 2 },
    { key: 'option3', label: 'None', points: 0 },
];
```

Other files (`transformation.ts`, `scoring.ts`, `constants.ts`) derive their values from this schema.

### 2. Data Transformation (`transformation.ts`)

Transforms raw action arrays from UI into database counters:

```typescript
// Input from scouting UI:
{ actions: ['coral', 'coral', 'algae'] }

// Output for database:
{ coralCount: 2, algaeCount: 1 }
```

**Note:** Uses `game-schema.ts` to determine valid actions per phase.

### 3. Analysis & Display (`analysis.ts`)

Defines Team Stats page configuration:

**Key Function: `getStartPositionConfig()`**

Single source of truth for auto start position configuration:

```typescript
getStartPositionConfig(): StartPositionConfig {
    return {
        positionCount: 5,
        positionLabels: ['Pos 0', 'Pos 1', ...],
        positionColors: ['blue', 'green', ...],
        fieldImageRed: fieldMapImage,
        fieldImageBlue: fieldMapBlueImage,
        zones: [
            { x: 0, y: 50, width: 128, height: 100, position: 0 },
            // ... clickable zones on 640x480 canvas
        ],
    };
}
```

### 4. Strategy Configuration (`strategy-config.ts`)

Configures the **Strategy Overview** page:

```typescript
export const strategyConfig = {
    columns: [
        { key: "auto.action1Count", label: "Auto Coral L4", category: "Auto", numeric: true },
        { key: "totalPoints", label: "Total Points", category: "Overall", numeric: true },
    ],
    presets: {
        essential: ['teamNumber', 'matchCount', 'totalPoints'],
        auto: ['teamNumber', 'auto.action1Count', 'auto.action2Count'],
    },
    aggregates: {
        totalPoints: (entry) => calculateTotalPoints(entry),
    }
};
```

### 5. Pick List Configuration (`pick-list-config.ts`)

Configures pick list sorting and display:

```typescript
// Sort options (auto-derived from strategy columns)
export const sortOptions = [
    { value: "teamNumber", label: "Team Number" },
    ...strategyConfig.columns
        .filter(col => col.numeric)
        .map(col => ({ value: col.key, label: col.label })),
];

// Re-export components
export { TeamCardStats } from './components/pick-list/TeamCardStats';
export { TeamStatsDialog } from './components/pick-list/TeamStatsDialog';
```

### 6. Gamification (`gamification/`)

Scout achievements and prediction stakes:

**`achievements.ts`** - Define achievements:
```typescript
export const achievements: Achievement[] = [
    {
        id: "first_scout",
        name: "First Scout",
        description: "Complete your first scouting entry",
        icon: "Star",
        stakes: 10,
        category: "scouting"
    },
];
```

**`database.ts`** - Gamification database operations
**`types.ts`** - Scout, Achievement, Prediction types

## Components (`components/`)

### `team-stats/`
- **`MatchStatsDialog.tsx`** - Detailed match modal with scoring tabs
- **`PerformanceAnalysis.tsx`** - Team performance summary

### `pick-list/`
- **`TeamCardStats.tsx`** - Stats shown on pick list cards
- **`TeamStatsDialog.tsx`** - Detailed stats dialog for pick lists

### Other Components
- **Field Selectors** - Auto start position selection
- **Scoring UI** - Match scouting buttons
- **Pit Questions** - Pit scouting form fields

See [components/README.md](./components/README.md) for component details.

## Customization Workflow

When starting a new season:

1. **Update `game-schema.ts`** - Define all actions, toggles, and point values
2. **Update `analysis.ts`** - Configure start positions and stat display
3. **Update `strategy-config.ts`** - Configure strategy table columns
4. **Update `gamification/achievements.ts`** - Define season-specific achievements
5. **Update components** - Customize UI for the game

---

**Related Documentation:**
- [docs/FRAMEWORK_DESIGN.md](../../docs/FRAMEWORK_DESIGN.md) - Architecture overview
- [docs/DATA_TRANSFORMATION.md](../../docs/DATA_TRANSFORMATION.md) - Data flow details
- [docs/ACHIEVEMENTS.md](../../docs/ACHIEVEMENTS.md) - Gamification system
