# Dev Utilities Page

## Overview

The Dev Utilities page provides development and testing tools for the application. It includes test data generation, database management, and debugging features to help developers and testers work efficiently.

## Features

### 1. Test Data Generation

Generate random scouting data for testing purposes.

```typescript
import { generateRandomScoutingData } from '@/core/lib/testDataGenerator';

// Generate 50 random entries for testing
const testEntries = generateRandomScoutingData({
    count: 50,
    eventKey: '2025test',
    teamRange: [1, 100]  // Team numbers 1-100
});
```

Options:
- **Count**: Number of entries to generate
- **Event Key**: Event identifier for the data
- **Team Range**: Range of team numbers

### 2. Database Operations

Quick access to database management:

| Action | Description |
|--------|-------------|
| **Clear Scouting Data** | Remove all match scouting entries |
| **Clear Pit Scouting** | Remove all pit scouting entries |
| **Clear Scout Profiles** | Remove gamification data |
| **Clear All Data** | Full database reset |

### 3. Data Inspection

View current database state:
- Total entries count by type
- Last updated timestamps
- Scout list with entry counts

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DevUtilitiesPage                               │
└─────────────────────────────────────────────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Test Data        │  │ Database         │  │ Data Inspection  │
│ Generator        │  │ Operations       │  │ Panels           │
│                  │  │                  │  │                  │
│ - Random entries │  │ - Clear methods  │  │ - Entry counts   │
│ - Config options │  │ - Backup/restore │  │ - Statistics     │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Test Data Generator

**Location:** `src/core/lib/testDataGenerator.ts`

### Schema-Compliant Generation

Test data is generated through the same transformation pipeline as real data to ensure schema compliance:

```typescript
export function generateRandomGameData(): GameData {
    // Generate raw action arrays (like real user input)
    const rawAuto = generateRawActions('auto');
    const rawTeleop = generateRawActions('teleop');
    const rawEndgame = generateRawEndgame();
    
    // Transform through the same pipeline
    return gameDataTransformation.transformActionsToCounters({
        auto: rawAuto,
        teleop: rawTeleop,
        endgame: rawEndgame
    });
}
```

### Random Data Fields

| Field | Generation Method |
|-------|-------------------|
| Team Number | Random within configured range |
| Match Number | Sequential or random |
| Alliance | Random "red" or "blue" |
| Scout Name | Random from common names list |
| Actions | Random counts per action type |
| Endgame | Random success/failure states |
| Comments | Random from preset phrases |

## Database Utility Functions

**Location:** `src/core/db/database.ts`

```typescript
// Clear specific data types
await clearAllScoutingData();
await clearAllPitScoutingData();
await clearGamificationData();

// Get statistics
const stats = await getDBStats();
// { scoutingEntries: 150, pitScoutingEntries: 32, scouts: 6 }
```

## Security Considerations

> **Warning:** The Dev Utilities page should be protected in production builds or removed entirely. It provides destructive database operations.

Options:
1. **Environment-based hiding**: Only show in development mode
2. **Password protection**: Require confirmation for destructive actions
3. **Build exclusion**: Remove from production bundle

## Best Practices

**DO:**
- ✅ Use for testing new features
- ✅ Generate test data before demos
- ✅ Clear test data before real events
- ✅ Verify data generation matches expected schema

**DON'T:**
- ❌ Use in production with real data
- ❌ Clear data without confirmation
- ❌ Generate test data during competitions
- ❌ Share dev utilities access broadly

---

**Last Updated:** January 2026
**Related Docs:**
- `docs/DATABASE.md` - Database operations
- `src/core/lib/testDataGenerator.ts` - Test data generation
