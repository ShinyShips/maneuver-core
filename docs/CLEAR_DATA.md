# Clear Data Page

## Overview

The Clear Data page provides a safe interface for clearing various types of data from the application's IndexedDB storage. It includes confirmation dialogs and selective clearing options.

## Features

### 1. Selective Data Clearing
Clear specific data types independently:

| Data Type | Description | Impact |
|-----------|-------------|--------|
| **Scouting Data** | Match performance records | Removes all collected match data |
| **Pit Scouting** | Technical specifications | Removes pit data and images |
| **Scout Profiles** | Gamification data | Removes stakes, achievements, predictions |
| **All Data** | Complete reset | Nuclear option - removes everything |

### 2. Confirmation Dialogs
- Requires explicit confirmation for each action
- Shows preview of data to be deleted
- Displays entry counts before deletion

### 3. Event-Specific Clearing
- Option to clear data for specific events only
- Preserves data from other competitions

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ClearDataPage                                │
│  - Data type selection                                              │
│  - Confirmation dialogs                                             │
└─────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     Database Operations                             │
│  - clearAllScoutingData()                                           │
│  - clearAllPitScoutingData()                                        │
│  - clearGamificationData()                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Functions

**Location:** `src/core/db/database.ts`

```typescript
// Clear scouting data
await clearAllScoutingData();

// Clear pit scouting data
await clearAllPitScoutingData();

// Clear gamification data (scouts, achievements, predictions)
await clearGamificationData();

// Get counts before clearing (for confirmation display)
const stats = await getDBStats();
```

## Safety Features

### Confirmation Dialog

```typescript
const confirmClear = () => {
    if (window.confirm(
        `Are you sure you want to delete ${entryCount} scouting entries? This cannot be undone.`
    )) {
        performClear();
    }
};
```

### Data Preview

Before clearing, users see:
- Number of entries to be deleted
- Last update timestamp
- Event keys affected

## Best Practices

**DO:**
- ✅ Export data before clearing (backup!)
- ✅ Verify correct data type selected
- ✅ Clear test data before real competitions
- ✅ Use event-specific clearing when possible

**DON'T:**
- ❌ Clear data during active competition
- ❌ Skip confirmation dialogs
- ❌ Clear without recent backup
- ❌ Clear "All Data" when only one type needed

## Recovery

> **Warning:** Cleared data cannot be recovered from the application!

To recover data:
1. Restore from JSON backup (if you exported before clearing)
2. Re-collect data (if no backup exists)

---

**Last Updated:** January 2026
**Related Docs:**
- `docs/DATABASE.md` - Database structure
- `docs/JSON_DATA_TRANSFER.md` - Backup/export procedures
