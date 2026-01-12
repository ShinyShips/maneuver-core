# Database Layer - maneuver-core

## Overview

The database layer provides **offline-first data persistence** using Dexie.js (IndexedDB wrapper). This layer is completely **game-agnostic** - all game-specific data is stored in generic JSON fields that teams customize for their specific game.

## Architecture

### Three Separate Databases

1. **SimpleScoutingDB** - Match scouting entries
2. **PitScoutingDB** - Pit scouting/robot capabilities  
3. **ScoutProfileDB** - Scout gamification (stakes, predictions, achievements)

This separation improves performance and keeps concerns isolated.

### Data Model

```typescript
// Generic scouting entry - TGameData is what teams define
interface ScoutingEntryBase<TGameData> {
  id: string;                    // Composite key: event::match::team::alliance
  teamNumber?: string;           // Indexed for fast lookups
  matchNumber?: string;          // Indexed for fast lookups
  alliance?: string;             // "red" or "blue"
  scoutName?: string;           // Who scouted this match
  eventName?: string;            // Event key (e.g., "2025mrcmp")
  gameData: TGameData;               // ← Game-specific JSON (teams define structure)
  timestamp: number;             // Entry creation time
  
  // Correction tracking (for re-scouting workflow)
  isCorrected?: boolean;
  correctionCount?: number;
  lastCorrectedAt?: number;
  lastCorrectedBy?: string;
  correctionNotes?: string;
  originalScoutName?: string;
}
```

**Key Design Decision:** The `gameData` field holds game-specific information. Framework code never directly accesses `gameData.autoCoralCount` or similar - that's handled by game implementations through the interface system.

## Database Schema Evolution

### Version History

**Version 1** (Initial):
```typescript
scoutingData: 'id, teamNumber, matchNumber, alliance, scoutName, eventName, timestamp'
```

**Version 2** (Correction Tracking):
```typescript
scoutingData: 'id, teamNumber, matchNumber, alliance, scoutName, eventName, timestamp, isCorrected'
```
- Added correction tracking fields for re-scouting workflow
- Auto-migration initializes `isCorrected = false` for existing entries

**Version 3** (Compound Indexes - Current):
```typescript
scoutingData: 'id, teamNumber, matchNumber, alliance, scoutName, eventName, timestamp, isCorrected, [teamNumber+eventName], [scoutName+eventName+matchNumber]'
```
- Added compound indexes for faster team-event queries
- Added compound index for prediction system (scout+event+match lookups)

### Adding New Versions

```typescript
// In SimpleScoutingAppDB class:
this.version(4).stores({
  scoutingData: 'id, teamNumber, ..., newField'
}).upgrade(tx => {
  // Optional: Migrate existing data
  return tx.table('scoutingData').toCollection().modify(entry => {
    entry.newField = /* default value */;
  });
});
```

## API Reference

### Basic Operations

```typescript
import {
  saveScoutingEntry,
  loadAllScoutingEntries,
  deleteScoutingEntry,
} from '@/db';

// Save single entry
await saveScoutingEntry({
  id: '2025mrcmp::qm42::3314::red',
  gameData: { /* game-specific */ },
  timestamp: Date.now()
});

// Load all entries
const entries = await loadAllScoutingEntries();

// Delete entry
await deleteScoutingEntry('2025mrcmp::qm42::3314::red');
```

### Query Operations

```typescript
import {
  loadScoutingEntriesByTeam,
  loadScoutingEntriesByMatch,
  loadScoutingEntriesByEvent,
  loadScoutingEntriesByTeamAndEvent,
  queryScoutingEntries,
} from '@/db';

// Query by team
const teamEntries = await loadScoutingEntriesByTeam('3314');

// Query by match
const matchEntries = await loadScoutingEntriesByMatch('qm42');

// Query by event
const eventEntries = await loadScoutingEntriesByEvent('2025mrcmp');

// Compound index query (fast!)
const teamAtEvent = await loadScoutingEntriesByTeamAndEvent('3314', '2025mrcmp');

// Advanced filtering
const results = await queryScoutingEntries({
  teamNumbers: ['3314', '5678'],
  eventNames: ['2025mrcmp'],
  alliances: ['red'],
  dateRange: { start: startTime, end: endTime }
});
```

### Statistics & Metadata

```typescript
import { getDBStats, getFilterOptions } from '@/db';

// Get database statistics
const stats = await getDBStats();
// {
//   totalEntries: 342,
//   teams: ['3314', '5678', ...],
//   matches: ['qm1', 'qm2', ...],
//   scouts: ['Alice', 'Bob', ...],
//   events: ['2025mrcmp', ...],
//   oldestEntry: 1704067200000,
//   newestEntry: 1704153600000
// }

// Get filter options for UI dropdowns
const options = await getFilterOptions();
// {
//   teams: ['3314', '5678', ...],
//   matches: ['qm1', 'qm2', ...],
//   events: ['2025mrcmp', ...],
//   alliances: ['red', 'blue'],
//   scouts: ['Alice', 'Bob', ...]
// }
```

### Import/Export

```typescript
import { exportScoutingData, importScoutingData } from '@/db';

// Export all gameData
const exportData = await exportScoutingData();
// {
//   entries: [...],
//   exportedAt: 1704153600000,
//   version: '3.0-maneuver-core'
// }

// Download as file
const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `scouting-gameData-${Date.now()}.json`;
a.click();

// Import gameData (append mode - skips duplicates)
const result = await importScoutingData({ entries: [...] }, 'append');
// { success: true, importedCount: 50, duplicatesSkipped: 5 }

// Import gameData (overwrite mode - replaces all gameData)
const result = await importScoutingData({ entries: [...] }, 'overwrite');
// { success: true, importedCount: 50 }
```

### Data Cleanup

```typescript
import { cleanupDuplicateEntries, normalizeAllianceValues } from '@/db';

// Remove duplicate entries (keeps most recent)
const result = await cleanupDuplicateEntries();
// { deleted: 3, total: 342 }

// Fix alliance values ("redAlliance" → "red")
const result = await normalizeAllianceValues();
// { fixed: 12, total: 342 }
```

### Correction Workflow

```typescript
import {
  findExistingScoutingEntry,
  updateScoutingEntryWithCorrection
} from '@/db';

// Find entry to correct
const entry = await findExistingScoutingEntry('qm42', '3314', 'red', '2025mrcmp');

if (entry) {
  // Update with correction metadata
  await updateScoutingEntryWithCorrection(
    entry.id,
    {
      id: entry.id,
      gameData: { /* corrected game data */ },
      timestamp: Date.now()
    },
    'Fixed auto coral count - video review showed 4 not 3',
    'Alice'
  );
}
```

## Data Utilities

### ID Generation

```typescript
import { generateDeterministicEntryId, generateEntryId } from '@/db';

// Generate composite ID from fields
const id = generateDeterministicEntryId('2025mrcmp', 'qm42', '3314', 'red');
// → "2025mrcmp::qm42::3314::red"

// Generate ID from gameData object
const id = generateEntryId({
  eventName: '2025mrcmp',
  matchNumber: 'qm42',
  selectTeam: '3314',
  alliance: 'red'
});
// → "2025mrcmp::qm42::3314::red"
```

**Why Composite IDs?**
- **Natural collision detection**: Same match/team/alliance = same ID
- **Human-readable**: Easy to debug
- **Indexed**: Fast lookups without extra queries
- **Deterministic**: Same gameData always generates same ID

### Conflict Detection

```typescript
import { detectConflicts } from '@/db';

const conflicts = await detectConflicts(incomingEntries);
// {
//   autoImport: [...],      // New entries (no conflict)
//   autoReplace: [...],     // Incoming is newer or correction
//   manualReview: [...]     // Needs user decision
// }

// Auto-import logic:
// - No existing entry → autoImport
// - Incoming has isCorrected=true → autoReplace
// - Incoming >30s newer → autoReplace
// - Otherwise → manualReview
```

### Data Migration

```typescript
import {
  checkMigrationNeeded,
  migrateFromLocalStorage,
  runStartupMigrations
} from '@/db';

// Check if migration needed
const { needsMigration, dexieCount, localStorageCount } = await checkMigrationNeeded();

if (needsMigration) {
  // Migrate localStorage → Dexie
  const result = await migrateFromLocalStorage();
  // { success: true, migratedCount: 342 }
}

// Or run all migrations automatically
await runStartupMigrations();
```

## Pit Scouting

```typescript
import {
  savePitScoutingEntry,
  loadAllPitScoutingEntries,
  loadPitScoutingByTeam,
  loadPitScoutingByTeamAndEvent,
} from '@/db';

// Save pit entry
await savePitScoutingEntry({
  id: 'pit-3314-2025mrcmp-...',
  teamNumber: '3314',
  eventName: '2025mrcmp',
  scoutName: 'Alice',
  timestamp: Date.now(),
  gameData: {
    // Game-specific pit gameData
    drivetrainType: 'swerve',
    programmingLanguage: 'Java',
    // ... robot measurements, capabilities, etc.
  },
  photos: ['data:image/jpeg;base64,...'],
  notes: 'Very fast robot, impressive intake'
});

// Load by team
const entries = await loadPitScoutingByTeam('3314');

// Load by team + event (uses compound index - fast!)
const entry = await loadPitScoutingByTeamAndEvent('3314', '2025mrcmp');
```

## Gamification (Scout Profiles)

```typescript
import {
  getOrCreateScout,
  updateScoutPoints,
  getAllScouts,
  savePrediction,
  unlockAchievement,
} from '@/db';

// Get or create scout profile
const scout = await getOrCreateScout('Alice');
// {
//   name: 'Alice',
//   stakes: 0,
//   stakesFromPredictions: 0,
//   totalPredictions: 0,
//   correctPredictions: 0,
//   currentStreak: 0,
//   longestStreak: 0,
//   createdAt: 1704067200000,
//   lastUpdated: 1704067200000
// }

// Award points
await updateScoutPoints('Alice', 10);

// Get leaderboard
const scouts = await getAllScouts();  // Ordered by stakes DESC

// Save match prediction
await savePrediction({
  id: 'pred-alice-2025mrcmp-qm42',
  scoutName: 'Alice',
  eventName: '2025mrcmp',
  matchNumber: 'qm42',
  predictedWinner: 'red',
  timestamp: Date.now(),
  verified: false
});

// Unlock achievement
await unlockAchievement('Alice', 'first_prediction');
```

## Performance Considerations

### Indexed Fields

Fields included in the schema are **automatically indexed** by Dexie:
- `teamNumber` - Fast team queries
- `matchNumber` - Fast match queries
- `alliance` - Fast alliance filtering
- `scoutName` - Fast scout filtering
- `eventName` - Fast event queries
- `timestamp` - Fast date range queries
- `[teamNumber+eventName]` - Fast team-at-event queries (compound index)
- `[scoutName+eventName+matchNumber]` - Fast prediction lookups (compound index)

### Query Performance

```typescript
// ✅ FAST - Uses index
const entries = await loadScoutingEntriesByTeam('3314');

// ✅ FAST - Uses compound index
const entries = await loadScoutingEntriesByTeamAndEvent('3314', '2025mrcmp');

// ⚠️ SLOWER - No index on game-specific gameData
const results = await db.scoutingData
  .toArray()
  .then(entries => entries.filter(e => e.gameData.autoCoralCount > 5));
```

**Rule:** If you need to query game-specific gameData frequently, extract it to a top-level indexed field in your game implementation's database extension.

### Bulk Operations

```typescript
// ✅ GOOD - Bulk insert (one transaction)
await saveScoutingEntries([entry1, entry2, entry3, ...]);

// ❌ BAD - Multiple transactions
for (const entry of entries) {
  await saveScoutingEntry(entry);  // Slow!
}
```

## Database Inspection (Dev Tools)

### Browser DevTools

```javascript
// In browser console:

// List all databases
await indexedDB.databases();

// Open database
const db = await window.indexedDB.open('SimpleScoutingDB');

// Query directly
const tx = db.transaction('scoutingData', 'readonly');
const store = tx.objectStore('scoutingData');
const request = store.getAll();
request.onsuccess = () => console.log(request.result);
```

### Dexie Debug

```typescript
// In your code:
import { db } from '@/db';

// Count entries
console.log(await db.scoutingData.count());

// Get first 10 entries
console.log(await db.scoutingData.limit(10).toArray());

// Query with logging
db.scoutingData
  .where('teamNumber')
  .equals('3314')
  .toArray()
  .then(results => console.log(results));
```

## Testing

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  db,
  saveScoutingEntry,
  loadAllScoutingEntries,
  clearAllScoutingData
} from '@/db';

describe('Database Operations', () => {
  beforeEach(async () => {
    await clearAllScoutingData();  // Clean slate
  });
  
  afterEach(async () => {
    await clearAllScoutingData();  // Cleanup
  });
  
  it('should save and retrieve entry', async () => {
    const entry = {
      id: '2025mrcmp::qm1::3314::red',
      gameData: { test: true },
      timestamp: Date.now()
    };
    
    await saveScoutingEntry(entry);
    
    const entries = await loadAllScoutingEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(entry.id);
  });
});
```

## Migration Strategy

### From localStorage

```typescript
// Old format (Maneuver 2024 and earlier)
{
  "gameData": [
    { "matchNumber": "qm1", "teamNumber": "3314", ... },
    { "matchNumber": "qm2", "teamNumber": "5678", ... }
  ]
}

// New format (maneuver-core)
// Note: File exports imply a wrapper for metadata (version, timestamp), 
// but the system also accepts raw arrays for flexibility.
{
  "version": "3.0-maneuver-core",
  "exportedAt": 1704153600000,
  "entries": [
    {
      "id": "2025mrcmp::qm1::3314::red",
      "gameData": { "matchNumber": "qm1", "teamNumber": "3314", ... },
      "timestamp": 1704067200000
    }
  ]
}
```

Migration automatically:
1. Detects old format in `localStorage.scoutingData`
2. Converts to new format with IDs
3. Imports to Dexie
4. Creates backup (`scoutingData_backup`)
5. Removes old localStorage data

### From Old IndexedDB

If you have an old manual IndexedDB implementation:

```typescript
import { migrateFromIndexedDB } from './migrationUtils';  // Add this function

const result = await migrateFromIndexedDB();
// { success: true, migratedCount: 342 }
```

## Best Practices

### DO ✅

- **Use composite IDs** for natural collision detection
- **Use bulk operations** for multiple inserts/updates
- **Index frequently-queried fields** at top level
- **Run migrations on app startup** via `runStartupMigrations()`
- **Export data regularly** for backups
- **Use correction workflow** for data quality

### DON'T ❌

- **Don't store game-specific code in framework** - Use the data field
- **Don't query data.* fields directly** - No indexes on JSON
- **Don't use random IDs** - Composite IDs prevent duplicates
- **Don't forget to handle offline** - All operations are async
- **Don't skip error handling** - Database operations can fail

## Troubleshooting

### Database Not Opening

```typescript
db.open().catch(error => {
  console.error('Failed to open database:', error);
  // Possible causes:
  // - Corrupt database (delete in DevTools)
  // - Exceeded storage quota
  // - Browser private/incognito mode
});
```

### Duplicate Entries

```typescript
// Run cleanup utility
const result = await cleanupDuplicateEntries();
console.log(`Deleted ${result.deleted} duplicates`);
```

### Slow Queries

```typescript
// Check if using indexed fields
const stats = await getDBStats();
console.log(`Total entries: ${stats.totalEntries}`);

// If querying game-specific data, consider extracting to indexed field
```

### Storage Quota Exceeded

```typescript
// Check storage usage
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate();
  console.log(`Used: ${estimate.usage}, Quota: ${estimate.quota}`);
}

// Solution: Export old data, clear database, re-import recent data
```

## Further Reading

- [Dexie.js Documentation](https://dexie.org/)
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Framework Design Docs](../docs/FRAMEWORK_DESIGN.md)
- [Integration Guide](../docs/INTEGRATION_GUIDE.md)
