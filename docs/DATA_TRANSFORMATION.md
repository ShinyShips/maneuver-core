# Data Transformation Architecture

## Overview

Match scouting uses **action arrays** during the match for better UX (undo, timestamps, replay), but stores **counter fields** in the database for efficient analysis and validation.

## Data Flow

```
┌─────────────────┐
│ Scout clicks    │
│ "Coral L1"      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ ScoringSections.tsx                         │
│ onAddAction({                               │
│   type: 'score',                            │
│   pieceType: 'coral',                       │
│   location: 'reef',                         │
│   level: 'l1',                              │
│   phase: 'auto'                             │
│ })                                          │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ AutoScoringPage.tsx / TeleopScoringPage.tsx │
│ - Adds timestamp                            │
│ - Stores in actions array                   │
│ - Saves to localStorage                     │
│                                             │
│ autoActions: [                              │
│   {                                         │
│     type: 'score',                          │
│     pieceType: 'coral',                     │
│     level: 'l1',                            │
│     timestamp: 1234567890,                  │
│     phase: 'auto'                           │
│   }                                         │
│ ]                                           │
└────────┬────────────────────────────────────┘
         │
         │ (User proceeds through match)
         │
         ▼
┌─────────────────────────────────────────────┐
│ EndgamePage.tsx                             │
│ - Gets autoActions from localStorage        │
│ - Gets teleopActions from localStorage      │
│ - Gets robot status objects                 │
│                                             │
│ transformedData =                           │
│   gameDataTransformation                    │
│     .transformActionsToCounters({           │
│       autoActions,                          │
│       teleopActions,                        │
│       autoRobotStatus,                      │
│       teleopRobotStatus,                    │
│       endgameRobotStatus,                   │
│       startPosition                         │
│     })                                      │
│                                             │
│ Output: {                                   │
│   autoCoralPlaceL1Count: 2,                 │
│   teleopAlgaePickReefCount: 1,              │
│   deepClimbAttempted: true,                 │
│   startPosition: 2                          │
│ }                                           │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ Database (IndexedDB)                        │
│                                             │
│ scoutingEntry: {                            │
│   id: "event::match::team::color",          │
│   teamNumber: 3314,                         │
│   matchNumber: 24,                          │
│   gameData: {                               │
│     auto: {                                 │
│       coralPlaceL1Count: 2,                 │
│       // ... more auto counters             │
│     },                                      │
│     teleop: {                               │
│       algaePickReefCount: 1,                │
│       // ... more teleop counters           │
│     },                                      │
│     endgame: {                              │
│       deepClimbAttempted: true,             │
│       climbFailed: false                    │
│     },                                      │
│     startPosition: 2                        │
│     // NO action arrays stored!             │
│   }                                         │
│ }                                           │
└────────┬────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ Analysis / Validation                       │
│ - Uses counter fields directly              │
│ - Fast aggregation: SUM(autoCoralL1Count)   │
│ - TBA validation: compare counts            │
│ - No need to process action arrays          │
└─────────────────────────────────────────────┘
```

## Why This Approach?

### Action Arrays During Match (UI State)

**Benefits:**
- ✅ Support undo functionality
- ✅ Preserve timestamps for debugging
- ✅ Replay match events
- ✅ Better UX for scouts

**Storage:** 
- localStorage only (temporary)
- Cleared after match submission via `clearScoutingLocalStorage()` utility

### Counter Fields in Database (Persistent State)

**Benefits:**
- ✅ Smaller database size (no timestamps, no duplicate metadata)
- ✅ Faster queries (direct access to counts)
- ✅ Easier validation (compare numbers, not arrays)
- ✅ Simpler analysis (SUM, AVG without parsing)
- ✅ Consistent with TBA data structure

**Storage:**
- IndexedDB (persistent)
- Used for all analysis, validation, statistics

## Interface: DataTransformation

**Location:** `src/types/game-interfaces.ts`

```typescript
export interface DataTransformation {
  transformActionsToCounters(matchData: {
    autoActions?: any[];
    teleopActions?: any[];
    autoRobotStatus?: Record<string, any>;
    teleopRobotStatus?: Record<string, any>;
    endgameRobotStatus?: Record<string, any>;
    [key: string]: any;
  }): Record<string, any>;
}
```

## Implementation: Game-Specific Transformation

**Location:** `src/game-template/transformation.ts`

Teams customize this file to map their game's actions → counter fields.

**Example (2025 Reefscape pattern):**

```typescript
export const gameDataTransformation: DataTransformation = {
  transformActionsToCounters(matchData) {
    const result = {
      auto: {
        coralPlaceL1Count: 0,
        coralPlaceL2Count: 0,
        // ... more auto counters
      },
      teleop: {
        algaePlaceNetShot: 0,
        algaePlaceProcessor: 0,
        // ... more teleop counters
      },
      endgame: {
        deepClimbAttempted: false,
        shallowClimbAttempted: false,
        parkAttempted: false,
      },
    };

    // Process auto actions
    matchData.autoActions?.forEach(action => {
      if (action.type === 'score' && 
          action.pieceType === 'coral' && 
          action.location === 'reef') {
        if (action.level === 'l1') result.auto.coralPlaceL1Count++;
        else if (action.level === 'l2') result.auto.coralPlaceL2Count++;
      }
    });

    // Process teleop actions
    matchData.teleopActions?.forEach(action => {
      // Similar logic for teleop
    });

    // Merge robot status (already in boolean format)
    Object.assign(result.auto, matchData.autoRobotStatus);
    Object.assign(result.teleop, matchData.teleopRobotStatus);
    Object.assign(result.endgame, matchData.endgameRobotStatus);

    // Add additional top-level fields
    result.startPosition = matchData.startPosition;

    return result;
  }
};
```

## Integration Point

**Location:** `src/core/pages/EndgamePage.tsx`

```typescript
import { gameDataTransformation } from "@/game-template/transformation";

// ... inside handleSubmit:

// Transform action arrays to counter fields
const transformedGameData = gameDataTransformation.transformActionsToCounters({
  autoActions,
  teleopActions,
  autoRobotStatus,
  teleopRobotStatus,
  endgameRobotStatus: robotStatus,
  startPosition: states?.inputs?.startPosition,
});

// Save to database (counter fields only)
const scoutingEntry = {
  // ... metadata fields
  gameData: transformedGameData, // NO action arrays!
};

await db.scoutingData.put(scoutingEntry);
```

## Codebase Audit Status

From `docs/CODEBASE_AUDIT.md`:

| File | Status | Notes |
|------|--------|-------|
| `dataTransformation.ts` | 🔀 MIXED | ✅ Split into interface + implementation |
| Framework interface | ✅ Complete | `src/types/game-interfaces.ts` |
| Template implementation | ✅ Complete | `src/game-template/transformation.ts` |
| Integration | ✅ Complete | `src/core/pages/EndgamePage.tsx` |

## Team Customization Guide

When implementing your game year:

1. **Open:** `src/game-template/transformation.ts`
2. **Define counters:** List all your counter fields (e.g., `speakerCount`, `ampCount`)
3. **Map actions:** Add logic to convert action objects → counter increments
4. **Test:** Scout a match, check IndexedDB to verify counter fields

**Example for 2024 Crescendo:**

```typescript
const result = {
  auto: {
    speakerCount: 0,
    ampCount: 0,
  },
  teleop: {
    speakerCount: 0,
    ampCount: 0,
    trapCount: 0,
  },
  endgame: {
    climbAttempted: false,
    harmony: false,
  },
};

matchData.autoActions?.forEach(action => {
  if (action.type === 'score' && action.location === 'speaker') {
    result.auto.speakerCount++;
  } else if (action.type === 'score' && action.location === 'amp') {
    result.auto.ampCount++;
  }
});
```

## Utility Functions

### `clearScoutingLocalStorage()`

**Location:** `src/core/lib/utils.ts`

Clears all scouting session data from localStorage. This is used to reset state between matches.

**Usage:**

```typescript
import { clearScoutingLocalStorage } from '@/core/lib/utils';

// After successful match submission
await db.scoutingData.put(scoutingEntry);
clearScoutingLocalStorage();  // Clean slate for next match

// Or when user abandons a match
if (userConfirmsLeaving) {
  clearScoutingLocalStorage();
  navigate('/home');
}
```

**Keys Cleared:**
- `autoStateStack` - Auto phase actions
- `teleopStateStack` - Teleop phase actions
- `autoRobotStatus` - Auto phase status toggles
- `teleopRobotStatus` - Teleop phase status toggles
- `endgameRobotStatus` - Endgame phase status
- `autoUndoHistory` - Auto phase undo tracking
- `teleopUndoHistory` - Teleop phase undo tracking

**Where It's Used:**
- `EndgamePage.tsx` - After successful match submission
- `useNavigationConfirm.ts` - When user confirms leaving mid-match

## Current boundary

Today, `maneuver-core` already defines the `DataTransformation` boundary and the yearly layer supplies the concrete `gameDataTransformation` implementation. Keep future architectural ideas out of this guide unless they are actively implemented.

---

**Last Updated:** December 21, 2025  
**Status:** ✅ Complete and integrated
