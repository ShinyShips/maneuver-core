# JSON Data Transfer System

## Overview

> **💡 Looking for real-time WiFi transfer?** See [PEER_TRANSFER.md](./PEER_TRANSFER.md) for WebRTC device-to-device sync.

The JSON Data Transfer system provides a complete solution for importing and exporting scouting data between devices, creating backups, and analyzing data in external tools like Excel or Google Sheets.

## Table of Contents

- [Core Concepts](#core-concepts)
- [Export Flow](#export-flow)
- [Import Flow](#import-flow)
- [Conflict Resolution](#conflict-resolution)
- [Architecture](#architecture)
- [Implementation Details](#implementation-details)
- [Common Use Cases](#common-use-cases)

---

## Core Concepts

### What Problem Does This Solve?

At robotics competitions, teams use multiple devices (tablets, phones) to collect scouting data. This system enables:

1. **Data Export**: Get data out of the app for analysis in spreadsheets
2. **Device Transfer**: Move data between devices (phone → tablet)
3. **Backup**: Save data before device failures
4. **Data Merging**: Combine data from multiple scouts without duplicates

### Data Types Supported

| Type | Description | CSV Support | JSON Support |
|------|-------------|-------------|--------------|
| **Scouting Data** | Match performance data (what robots did in matches) | ✅ | ✅ |
| **Scout Profiles** | Gamification data (achievements, predictions, stakes) | ✅ | ✅ |
| **Pit Scouting** | Technical specifications collected in pit area | ✅ | ✅ |
| **Images Only** | Robot photos for existing pit scouting entries | ❌ | ✅ |

---

## Export Flow

### Step 1: Select Data Type

Users choose which type of data to export using a dropdown selector:

```tsx
<Select value={dataType} onValueChange={setDataType}>
  <SelectItem value="scouting">Scouting Data</SelectItem>
  <SelectItem value="scoutProfiles">Scout Profiles</SelectItem>
  <SelectItem value="pitScouting">Pit Scouting Data</SelectItem>
  <SelectItem value="pitScoutingImagesOnly">Images Only</SelectItem>
</Select>
```

### Step 2: Choose Format

Two export formats available:

#### JSON Export
- **Purpose**: Complete data with structure
- **Use Case**: Backup, device transfer, data merging
- **Advantages**: 
  - Preserves nested structure
  - Includes all metadata
  - Can be re-imported
  - Supports images

#### CSV Export
- **Purpose**: Flat spreadsheet format
- **Use Case**: Data analysis in Excel/Google Sheets
- **Advantages**:
  - Opens directly in spreadsheet software
  - Easy to create pivot tables and charts
  - Compatible with data analysis tools

### Step 3: Dynamic CSV Generation

#### The Challenge: Nested Data Structure

Scouting data is stored in a nested JSON format:

```json
{
  "id": "abc123",
  "teamNumber": 1234,
  "matchNumber": 5,
  "gameData": {
    "auto": {
      "startPosition": "left",
      "coralScored": 3
    },
    "teleop": {
      "coralScored": 12,
      "algaeScored": 5
    },
    "endgame": {
      "climbStatus": "success"
    }
  }
}
```

CSV requires flat columns:

```csv
id,teamNumber,matchNumber,auto.startPosition,auto.coralScored,teleop.coralScored,teleop.algaeScored,endgame.climbStatus
abc123,1234,5,left,3,12,5,success
```

#### The Solution: Recursive Flattening

```typescript
const flattenObject = (obj: Record<string, any>, prefix = ''): Record<string, any> => {
  const flattened: Record<string, any> = {};
  
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(flattened, flattenObject(value, newKey));
    } else {
      // Add primitive values directly
      flattened[newKey] = value;
    }
  }
  
  return flattened;
};
```

**Example transformation:**

```typescript
// Input
const nested = {
  auto: {
    startPosition: "left",
    coral: { scored: 3, missed: 1 }
  }
};

// Output
flattenObject(nested)
// {
//   "auto.startPosition": "left",
//   "auto.coral.scored": 3,
//   "auto.coral.missed": 1
// }
```

#### Dynamic Column Detection

Different scouting entries may track different fields. The system collects ALL possible fields across ALL entries:

```typescript
// First pass: Collect all unique fields
const autoFieldsSet = new Set<string>();
const teleopFieldsSet = new Set<string>();
const endgameFieldsSet = new Set<string>();

for (const entry of scoutingEntries) {
  const flattened = flattenObject(entry.gameData);
  
  for (const key of Object.keys(flattened)) {
    if (key.startsWith('auto.')) {
      autoFieldsSet.add(key);
    } else if (key.startsWith('teleop.')) {
      teleopFieldsSet.add(key);
    } else if (key.startsWith('endgame.')) {
      endgameFieldsSet.add(key);
    }
  }
}

// Build header in match timeline order
const dynamicHeader = [
  ...baseFields,          // id, teamNumber, matchNumber, eventKey, etc.
  ...autoFields,          // auto.startPosition, auto.coralScored, etc.
  ...teleopFields,        // teleop.coralScored, teleop.algaeScored, etc.
  ...endgameFields,       // endgame.climbStatus, etc.
  'comments'              // Always last (written at end of match)
];
```

**Why this ordering?**
The column order matches the match timeline:
1. Base fields (match identification)
2. Auto fields (autonomous period)
3. Teleop fields (teleoperated period)
4. Endgame fields (final period)
5. Comments (written after match)

#### Second Pass: Convert Data to Rows

```typescript
for (const entry of scoutingEntries) {
  const row: (string | number)[] = [];
  
  // Add base fields
  for (const field of baseFields) {
    row.push(entry[field] ?? '');
  }
  
  // Add flattened gameData fields
  const flattened = flattenObject(entry.gameData);
  for (const field of gameDataFields) {
    row.push(flattened[field] ?? '');
  }
  
  // Add comments
  row.push(entry.comments ?? '');
  
  dataArrays.push(row);
}
```

### Step 4: Trigger Download

```typescript
const element = document.createElement("a");
element.setAttribute(
  "href",
  "data:text/csv;charset=utf-8," + encodeURIComponent(csv)
);
element.setAttribute("download", filename);
element.style.display = "none";
document.body.appendChild(element);
element.click();
document.body.removeChild(element);
```

**How it works:**
1. Create invisible `<a>` element
2. Set `href` to data URL with CSV content
3. Set download filename
4. Programmatically click the link
5. Browser triggers download
6. Remove element from DOM

---

## Import Flow

### Step 1: File Selection and Auto-Detection

```typescript
const handleFileSelect = async (event) => {
  const file = event.target.files?.[0];
  if (!file || !file.name.endsWith('.json')) {
    toast.error("Please select a JSON file");
    return;
  }
  
  const text = await file.text();
  const jsonData = JSON.parse(text);
  const dataType = detectDataType(jsonData);
  
  if (!dataType) {
    toast.error("Unable to detect data type");
    return;
  }
  
  setDetectedDataType(dataType);
};
```

#### Auto-Detection Logic

```typescript
export function detectDataType(jsonData: unknown): DataType | null {
  if (!jsonData || typeof jsonData !== 'object') return null;
  
  const data = jsonData as Record<string, unknown>;
  
  // Check for scouting data
  if ('entries' in data && Array.isArray(data.entries)) {
    return 'scouting';
  }
  
  // Check for scout profiles
  if ('scouts' in data && Array.isArray(data.scouts)) {
    return 'scoutProfiles';
  }
  
  // Check for pit scouting
  if ('pitEntries' in data && Array.isArray(data.pitEntries)) {
    return 'pitScouting';
  }
  
  // Check for images only
  if ('imageOnlyData' in data) {
    return 'pitScoutingImagesOnly';
  }
  
  return null;
}
```

### Step 2: Upload Mode Selection

Three modes handle different scenarios:

#### Mode 1: Smart Merge (Recommended) 🧠

**Use Case:** Combining data from multiple devices while avoiding duplicates

**Behavior:**
- **New entries** → Add automatically ✅
- **Corrected entries** (marked with `correctedVersion: true`) → Replace automatically ✅
- **Conflicting entries** → Ask user for decision ⚠️

**Example Scenario:**
```
Device A has: Match 1, Team 1234, Score: 50
Device B has: Match 1, Team 1234, Score: 52

Smart Merge detects: 🤔 Same match, same team, different data!
→ Show conflict dialog for user decision
```

**When to use:**
- Merging data from multiple scouts
- You want to review conflicts
- First time combining datasets

#### Mode 2: Force Append 📤

**Use Case:** Trust the uploaded data completely

**Behavior:**
- **New entries** → Add
- **Matching entries** → Replace silently (no prompts)
- **No conflict detection**

**When to use:**
- You know the uploaded data is correct
- You want to overwrite existing data
- No need for review

#### Mode 3: Overwrite All 🔄 (Destructive)

**Use Case:** Start completely fresh

**Behavior:**
- **Delete ALL existing data**
- **Upload becomes the only data**
- **No way to undo!**

**When to use:**
- Restoring from backup
- Setting up new device
- Nuclear option (use with caution!)

### Step 3: Conflict Detection

When smart-merge finds conflicting entries, it creates conflict objects:

```typescript
interface ConflictInfo {
  incomingEntry: ScoutingEntryBase;  // New data trying to come in
  existingEntry: ScoutingEntryBase;  // Old data already there
  differences: string[];              // Array of what's different
}
```

**Example:**
```typescript
{
  incomingEntry: {
    id: "match1-team1234",
    teamNumber: 1234,
    matchNumber: 1,
    gameData: { autoPoints: 15, teleopPoints: 52 }
  },
  existingEntry: {
    id: "match1-team1234", 
    teamNumber: 1234,
    matchNumber: 1,
    gameData: { autoPoints: 12, teleopPoints: 50 }
  },
  differences: [
    "gameData.autoPoints: 12 → 15",
    "gameData.teleopPoints: 50 → 52"
  ]
}
```

---

## Conflict Resolution

### Two-Stage Resolution System

#### Stage 1: Batch Review Dialog

**Problem:** You upload 100 entries, 80 are conflicts. You don't want to click through all 80!

**Solution:** Batch dialog offers three choices:

```tsx
<BatchConflictDialog
  entries={batchReviewEntries}
  onResolve={(decision) => {
    // decision can be:
    // 'replace-all' → Replace all 80 conflicts
    // 'skip-all'    → Skip all 80 conflicts  
    // 'review-each' → Show individual dialogs
  }}
/>
```

**UI Example:**
```
⚠️ Found 80 Conflicting Entries

These entries have the same match and team but different data.

What would you like to do?

[Replace All 80] [Skip All 80] [Review Each One]
```

#### Stage 2: Individual Conflict Dialog

If user chooses "review each," they see one conflict at a time:

```tsx
<ConflictResolutionDialog
  conflict={currentConflicts[currentConflictIndex]}
  currentIndex={5}
  totalConflicts={80}
  onResolve={(action) => {
    // action is 'replace' or 'skip'
    // Move to next conflict
  }}
  onBatchResolve={(action) => {
    // User changed mind: apply action to ALL remaining
  }}
  onUndo={() => {
    // Undo last decision, go back one
  }}
/>
```

**UI Example:**
```
Conflict 5 of 80

Match 12, Team 1234

┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│ EXISTING DATA                   │  │ INCOMING DATA                   │
├─────────────────────────────────┤  ├─────────────────────────────────┤
│ Auto Points: 12                 │  │ Auto Points: 15 ✨               │
│ Teleop Points: 50               │  │ Teleop Points: 52 ✨             │
│ Scout: Alice                    │  │ Scout: Bob                      │
└─────────────────────────────────┘  └─────────────────────────────────┘

[Skip] [Replace] [Skip All] [Replace All] [← Undo]
```

### Conflict Resolution Hook

The `useConflictResolution` hook manages complex state:

```typescript
const {
  showConflictDialog,           // Should dialog be visible?
  currentConflicts,             // Array of all conflicts
  currentConflictIndex,         // Which conflict (0-79)?
  setCurrentConflicts,          // Set conflicts to resolve
  setConflictResolutions,       // Track user decisions
  handleConflictResolution,     // User made decision
  handleBatchResolve,           // Apply to all remaining
  handleUndo,                   // Undo last decision
  canUndo                       // Is undo available?
} = useConflictResolution();
```

#### Resolution Flow

```typescript
// 1. User clicks "Replace"
handleConflictResolution('replace');

// Inside the hook:
// - Record decision in history (for undo)
// - Replace entry in database
// - Move to next conflict (index++)
// - If no more conflicts, close dialog

// 2. User realizes mistake, clicks "Undo"
handleUndo();

// Inside the hook:
// - Pop last decision from history
// - Reverse database change (restore old entry)
// - Go back one conflict (index--)
```

#### State Management

```typescript
const [resolutionHistory, setResolutionHistory] = useState<Array<{
  conflictIndex: number;
  action: 'replace' | 'skip';
  previousData: ScoutingEntryBase;  // For undo
}>>([]);

// Recording a decision
setResolutionHistory(prev => [...prev, {
  conflictIndex: currentConflictIndex,
  action: 'replace',
  previousData: existingEntry
}]);

// Undoing
const lastDecision = resolutionHistory[resolutionHistory.length - 1];
await database.saveScoutingData([lastDecision.previousData]);
setResolutionHistory(prev => prev.slice(0, -1));
setCurrentConflictIndex(lastDecision.conflictIndex);
```

---

## Architecture

### File Structure

```
src/
├── core/
│   ├── pages/
│   │   └── JSONDataTransferPage.tsx         # Main page component
│   │
│   ├── components/
│   │   └── data-transfer/
│   │       ├── JSONUploader.tsx              # Upload UI
│   │       ├── ConflictResolutionDialog.tsx  # Individual conflict UI
│   │       └── BatchConflictDialog.tsx       # Batch resolution UI
│   │
│   ├── hooks/
│   │   └── useConflictResolution.ts          # Conflict state management
│   │
│   └── lib/
│       ├── uploadHandlers/
│       │   ├── dataTypeDetector.ts           # Auto-detect file type
│       │   ├── scoutingDataUploadHandler.ts  # Handle scouting data
│       │   ├── scoutProfilesUploadHandler.ts # Handle scout profiles
│       │   ├── pitScoutingUploadHandler.ts   # Handle pit scouting
│       │   └── pitScoutingImagesUploadHandler.ts # Handle images
│       │
│       └── scoutingDataUtils.ts              # Core data utilities
```

### Component Hierarchy

```
JSONDataTransferPage
│
├─ Mode: 'select' (default)
│  ├─ Data type selector
│  ├─ Download JSON button
│  ├─ Download CSV button
│  └─ Upload button (switches to 'upload' mode)
│
└─ Mode: 'upload'
   │
   └─ JSONUploader
      ├─ File selection
      ├─ Mode selection (smart/append/overwrite)
      ├─ BatchConflictDialog (if many conflicts)
      └─ ConflictResolutionDialog (if reviewing individually)
```

### Data Flow

#### Export Flow
```
User Action
    ↓
Select Data Type (scouting/profiles/pit/images)
    ↓
Select Format (JSON/CSV)
    ↓
Load Data from Database
    ↓
If CSV:
    ↓
  Flatten Nested Objects
    ↓
  Build Dynamic Columns
    ↓
  Convert to CSV String
    ↓
Trigger Browser Download
```

#### Import Flow
```
User Selects File
    ↓
Parse JSON & Auto-Detect Type
    ↓
User Selects Mode (smart/append/overwrite)
    ↓
Upload Handler Processes Data
    ↓
If Smart Merge:
    ↓
  Detect Conflicts
    ↓
  Many Conflicts? → Show Batch Dialog
    ↓
    User Chooses: All/None/Each
    ↓
  Review Each? → Show Individual Dialogs
    ↓
    User Resolves One by One
    ↓
Save to Database
    ↓
Success Toast
```

---

## Implementation Details

### CSV Flattening Algorithm

**Time Complexity:** O(n × m × d)
- n = number of entries
- m = average fields per entry
- d = average nesting depth

**Space Complexity:** O(n × f)
- n = number of entries
- f = total unique fields

**Why Sets for Field Collection?**
```typescript
const fieldSet = new Set<string>();

// Automatic deduplication
fieldSet.add("auto.coral");  // Added
fieldSet.add("auto.coral");  // Ignored (already exists)
fieldSet.add("auto.algae");  // Added

// Result: ["auto.coral", "auto.algae"]
```

### Conflict Detection Algorithm

```typescript
function detectConflicts(
  incomingEntries: ScoutingEntryBase[],
  existingEntries: ScoutingEntryBase[]
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  
  // Build lookup map for O(1) access
  const existingMap = new Map(
    existingEntries.map(entry => [entry.id, entry])
  );
  
  for (const incoming of incomingEntries) {
    const existing = existingMap.get(incoming.id);
    
    if (existing) {
      // Entry exists, check if data differs
      const differences = findDifferences(existing, incoming);
      
      if (differences.length > 0) {
        conflicts.push({
          incomingEntry: incoming,
          existingEntry: existing,
          differences
        });
      }
    }
  }
  
  return conflicts;
}
```

**Time Complexity:** O(n + m)
- n = incoming entries
- m = existing entries
- Map lookup is O(1)

### Memory Management

**Problem:** Large datasets can consume memory

**Solutions:**
1. **Streaming for CSV**: Process entries one at a time
2. **Lazy Loading**: Only load visible conflicts in dialog
3. **Cleanup**: Clear file input after processing

```typescript
// Reset file input to free memory
const fileInput = document.getElementById("jsonFileInput");
if (fileInput) fileInput.value = "";
setSelectedFile(null);
```

---

## Common Use Cases

### Use Case 1: Multi-Device Data Collection

**Scenario:** 6 scouts with tablets collecting data at a competition

**Workflow:**
1. Each scout uses their device independently
2. At end of day, one device becomes "master"
3. Other scouts export JSON from their devices
4. Master device imports using Smart Merge
5. Conflicts resolved (usually typos or corrections)
6. Master device has complete dataset

**Why Smart Merge?**
- Auto-adds data from scouts who watched different matches
- Auto-replaces corrected entries
- Only asks about genuine conflicts

### Use Case 2: Backup and Restore

**Scenario:** Device might break during competition

**Workflow:**
1. Periodically export ALL data types as JSON
2. Save to cloud storage (Google Drive, Dropbox)
3. If device breaks, get new device
4. Import JSON using Overwrite mode
5. Back in business!

**Why Overwrite?**
- New device is empty
- Want exact copy of backed-up data
- No conflicts to resolve

### Use Case 3: Data Analysis

**Scenario:** Strategy team wants to analyze performance trends

**Workflow:**
1. Export Scouting Data as CSV
2. Open in Excel/Google Sheets
3. Create pivot tables, charts, statistics
4. Identify strong/weak teams
5. Plan match strategy

**Why CSV?**
- Spreadsheet software opens it directly
- Easy to filter, sort, analyze
- Can use formulas and charts
- Flat structure works well with pivot tables

### Use Case 4: Corrected Data Update

**Scenario:** Scout realizes they recorded wrong score, fixes it

**Workflow:**
1. Scout corrects entry on their device
2. Entry marked with `correctedVersion: true`
3. Exports JSON
4. Master device imports with Smart Merge
5. Corrected entry auto-replaces old one
6. No prompt needed!

**Why Auto-Replace?**
- Correction flag indicates intentional change
- User doesn't need to confirm (already confirmed by making correction)
- Smooth workflow

---

## Best Practices

### For Users

**DO:**
- ✅ Export backups regularly (every few hours at competition)
- ✅ Use Smart Merge when combining datasets
- ✅ Review conflicts carefully (data quality matters!)
- ✅ Use CSV for analysis, JSON for transfer
- ✅ Test import/export before competition

**DON'T:**
- ❌ Use Overwrite unless you're sure (destructive!)
- ❌ Skip conflict review without understanding why
- ❌ Mix up data types (importing profiles as scouting data)
- ❌ Forget to back up before Overwrite

### For Developers

**DO:**
- ✅ Validate JSON structure before processing
- ✅ Handle errors gracefully (show user-friendly messages)
- ✅ Provide undo functionality for destructive actions
- ✅ Auto-detect data types (don't make user choose)
- ✅ Use TypeScript for type safety
- ✅ Test with large datasets (1000+ entries)

**DON'T:**
- ❌ Assume JSON is valid (always parse in try-catch)
- ❌ Process files synchronously (blocks UI)
- ❌ Hold entire dataset in memory if not needed
- ❌ Forget to reset file input after processing
- ❌ Use `any` types (defeats purpose of TypeScript)

### Performance Tips

**Large Datasets (1000+ entries):**
```typescript
// ❌ BAD: Load all at once
const allData = await database.getAllData();
processAllData(allData);

// ✅ GOOD: Process in batches
const BATCH_SIZE = 100;
for (let i = 0; i < total; i += BATCH_SIZE) {
  const batch = await database.getData(i, BATCH_SIZE);
  await processBatch(batch);
}
```

**CSV Generation:**
```typescript
// ❌ BAD: Build entire CSV in memory
let csv = headers.join(',') + '\n';
for (const entry of entries) {
  csv += convertRow(entry) + '\n';
}

// ✅ GOOD: Use array join (faster)
const rows = [headers];
for (const entry of entries) {
  rows.push(convertRow(entry));
}
const csv = rows.map(row => row.join(',')).join('\n');
```

---

## Troubleshooting

### "Unable to detect data type"

**Cause:** JSON structure doesn't match any known pattern

**Solution:**
1. Check JSON has correct wrapper:
   - Scouting: `{ "entries": [...] }`
   - Profiles: `{ "scouts": [...] }`
   - Pit: `{ "pitEntries": [...] }`
2. Ensure exported from same app version
3. Check for manual edits that broke structure

### "CSV export is empty"

**Cause:** No data in database for selected type

**Solution:**
1. Verify you selected correct data type
2. Check database has data (go to relevant page)
3. Try exporting as JSON first to see what's there

### Conflicts not showing up

**Cause:** Using wrong upload mode

**Solution:**
- Smart Merge detects conflicts
- Append and Overwrite don't show conflicts
- Check you selected Smart Merge

### Undo button disabled

**Cause:** No decisions to undo yet

**Solution:**
- Undo only works after making at least one decision
- Can't undo before first conflict resolved
- History cleared after all conflicts resolved

---

## Possible future improvements

These are optional ideas, not a committed roadmap:

1. **Incremental export**
2. **Export presets**
3. **Richer conflict diffs**
4. **Import preview or dry-run mode**
5. **Scheduled exports**
6. **Additional compression options**

---

## Related Documentation

- [Database Schema](./DATABASE.md) - How data is stored
- [Data Transformation](./DATA_TRANSFORMATION.md) - How game-specific data is handled
- [Framework Design](./FRAMEWORK_DESIGN.md) - Year-agnostic architecture and interfaces

---

## Summary

The JSON Data Transfer system provides:

✅ **Flexible Export**: JSON for backup/transfer, CSV for analysis
✅ **Smart Import**: Auto-detection, multiple modes, conflict resolution
✅ **Year-Agnostic**: Dynamic column detection works for any game
✅ **User-Friendly**: Batch operations, undo, clear progress indicators
✅ **Robust**: Error handling, validation, defensive programming

**Key Design Principles:**
- Progressive disclosure (simple → complex)
- Separation of concerns (UI / logic / state)
- User agency (don't auto-decide, let user choose)
- Data integrity (detect conflicts, don't overwrite blindly)

This system enables teams to confidently collect, combine, backup, and analyze their scouting data throughout the competition season.
