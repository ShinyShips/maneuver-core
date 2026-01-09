# Team Stats Page

## Overview

The Team Stats page provides detailed statistical analysis for individual teams based on collected scouting data. It displays performance metrics, match history, and visual representations of a team's capabilities.

## Features

### 1. Team Selection
- Dropdown selector for choosing a team
- Shows teams with available data
- Quick search by team number

### 2. Performance Summary
- Average points by phase (Auto, Teleop, Endgame)
- Reliability metrics (climb rate, mobility rate)
- Match count indicator

### 3. Match-by-Match Performance
- Individual match results with point breakdown
- Event and alliance information
- Match Stats Dialog for detailed data
- Comments from scouts

### 4. Team Comparison (Optional)
- Compare selected team against another
- Side-by-side statistics
- Visual difference indicators

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TeamStatsPage                                │
│  - Team selector                                                    │
│  - Uses useAllTeamStats hook                                        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Performance      │  │ Match History    │  │ MatchStatsDialog │
│ Analysis         │  │                  │  │                  │
│                  │  │ - Match cards    │  │ - Detailed view  │
│ - Points summary │  │ - Point breakdow │  │ - Action counts  │
│ - Rates          │  │ - Comments       │  │ - Start position │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Core Components

**Location:** `src/game-template/components/team-stats/`

| Component | Description |
|-----------|-------------|
| `PerformanceAnalysis` | Summary stats and match list |
| `MatchStatsDialog` | Detailed match modal |

**Location:** `src/core/components/team-stats/`

| Component | Description |
|-----------|-------------|
| `ProgressCard` | Visual progress/rate display |

## Data Types

**Location:** `src/core/types/team-stats.ts`

```typescript
interface TeamStats {
    teamNumber: number;
    matchCount: number;
    matchesPlayed: number;
    
    // Phase averages
    avgAutoPoints: number;
    avgTeleopPoints: number;
    avgEndgamePoints: number;
    avgTotalPoints: number;
    
    // Rates
    mobilityRate: number;
    climbRate: number;
    
    // Match results for history
    matchResults: MatchResult[];
    
    // Game-specific nested stats
    auto: AutoStats;
    teleop: TeleopStats;
    endgame: EndgameStats;
}
```

## Key Hook: useAllTeamStats

**Location:** `src/game-template/hooks/useAllTeamStats.ts`

```typescript
const {
    teamStats,        // Array of TeamStats
    getTeamStats,     // Get stats for specific team
    isLoading,        // Loading state
    error,            // Error state
    refresh           // Reload data
} = useAllTeamStats();
```

## Match Stats Dialog

The dialog shows complete match details:

### Tabs

1. **Scoring** - Action counts for auto and teleop
2. **Auto** - Auto phase details with start position map
3. **Endgame** - Climb/park status
4. **Info** - Scout name, team number, comments

### Dynamic Action Rendering

Actions are rendered dynamically from game data:

```typescript
{matchData.gameData?.auto && 
    Object.entries(matchData.gameData.auto)
        .filter(([key]) => key.endsWith('Count'))
        .map(([key, value]) => (
            <div key={key}>
                <span>{formatLabel(key)}:</span>
                <span>{value}</span>
            </div>
        ))
}
```

## Customization

### Adding New Stats

1. Update `TeamStats` type in `src/core/types/team-stats.ts`
2. Update calculation in `src/game-template/analysis.ts`
3. Display in `PerformanceAnalysis.tsx`

### Customizing Match Dialog

Edit `src/game-template/components/team-stats/MatchStatsDialog.tsx`

---

**Last Updated:** January 2026
**Related Docs:**
- `docs/STRATEGY_OVERVIEW.md` - Strategy analysis configuration
- `src/game-template/analysis.ts` - Statistics calculation
