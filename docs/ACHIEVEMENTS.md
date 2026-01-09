# Achievements System

## Overview

The Achievements system provides gamification for scouts by rewarding them with stakes (points) and badges for completing various scouting activities. This encourages engagement and friendly competition among scouters.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AchievementsPage                               │
│  - Displays all available achievements                              │
│  - Shows unlock status and progress                                 │
│  - Uses configurable achievement definitions                        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Achievement Config                               │
│  game-template/gamification/achievements.ts                         │
│  - Achievement definitions with icons and rewards                   │
│  - Unlock conditions                                                │
│  - Stakes (points) values                                           │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Gamification Database                            │
│  game-template/gamification/database.ts                             │
│  - Stores unlocked achievements per scout                           │
│  - Tracks achievement timestamps                                    │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Types

**Location:** `src/core/lib/achievementTypes.ts`

```typescript
interface Achievement {
    id: string;           // Unique identifier (e.g., "first_scout")
    name: string;         // Display name (e.g., "First Scout")
    description: string;  // What the achievement is for
    icon: string;         // Lucide icon name
    stakes: number;       // Points awarded when unlocked
    category: AchievementCategory;  // Grouping category
}

type AchievementCategory = 
    | 'scouting'      // Match scouting milestones
    | 'predictions'   // Prediction accuracy achievements
    | 'streaks'       // Streak-based achievements
    | 'special';      // Special/rare achievements
```

## Game-Specific Configuration

**Location:** `src/game-template/gamification/achievements.ts`

Achievements are defined per game year:

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
    {
        id: "perfect_prediction",
        name: "Perfect Prediction",
        description: "Correctly predict 5 match outcomes in a row",
        icon: "Target",
        stakes: 50,
        category: "predictions"
    },
    // ... more achievements
];
```

## Key Functions

### Checking Achievement Eligibility

```typescript
import { checkAndUnlockAchievements } from '@/core/lib/achievementUtils';

// Called after scouting actions
await checkAndUnlockAchievements(scoutName);
```

### Getting Scout Achievements

```typescript
import { getScoutAchievements } from '@/db';

const achievements = await getScoutAchievements(scoutName);
// Returns array of unlocked achievement IDs with timestamps
```

### Unlocking Achievements

```typescript
import { unlockAchievement } from '@/db';

await unlockAchievement(scoutName, achievementId);
// Adds to database if not already unlocked
```

## Page Features

### 1. Achievement Grid
- Visual display of all achievements
- Locked vs unlocked state styling
- Category grouping

### 2. Progress Tracking
- Shows total stakes earned from achievements
- Displays unlock percentage
- Recent achievement highlights

### 3. Scout Selection
- View achievements for any scout
- Compare progress between scouts

## Customization Guide

### Adding New Achievements

1. Edit `src/game-template/gamification/achievements.ts`:
```typescript
{
    id: "climber_king",
    name: "Climber King",
    description: "Scout 10 successful climbs",
    icon: "Mountain",
    stakes: 25,
    category: "scouting"
}
```

2. Add unlock logic in `src/core/lib/achievementUtils.ts`:
```typescript
// Check for climber achievement
const climbCount = await countClimbsForScout(scoutName);
if (climbCount >= 10 && !hasAchievement("climber_king")) {
    await unlockAchievement(scoutName, "climber_king");
}
```

## Database Schema

Achievements are stored in the gamification database:

```typescript
interface UnlockedAchievement {
    id: string;           // Auto-generated
    scoutName: string;    // Scout who unlocked it
    achievementId: string; // Achievement ID from config
    unlockedAt: number;   // Timestamp
}
```

---

**Last Updated:** January 2026
**Related Docs:**
- `docs/DATABASE.md` - Gamification database details
- `src/game-template/gamification/` - Gamification system
