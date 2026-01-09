# Pit Scouting Page

## Overview

The Pit Scouting page allows scouts to collect technical specifications and photos of robots during the pit scouting phase of competitions. This data complements match scouting by providing static robot capabilities.

## Features

### 1. Team Selection
- Numeric input for team number
- Validation against event team list
- Previous entry detection (edit vs. new)

### 2. Technical Questions
- Configurable questions per game year
- Multiple input types (text, number, select, checkbox)
- Required field validation

### 3. Robot Photos
- Camera integration for capturing robot images
- Multiple photo support
- Gallery view of captured images

### 4. Entry Management
- Save/update entries
- View existing entries
- Delete capability

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       PitScoutingPage                               │
│  - Form-based data collection                                       │
│  - Photo capture integration                                        │
└─────────────────────────────────────────────────────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Pit Scouting     │  │ Camera/Photo     │  │ Pit Scouting     │
│ Form             │  │ Capture          │  │ Database         │
│                  │  │                  │  │                  │
│ - Team input     │  │ - MediaDevices   │  │ - IndexedDB      │
│ - Questions      │  │ - Image preview  │  │ - Image storage  │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Core Types

**Location:** `src/core/types/pit-scouting.ts`

```typescript
interface PitScoutingEntryBase {
    id: string;              // Unique entry ID
    teamNumber: number;      // Team being scouted
    eventKey: string;        // Event identifier
    scoutName: string;       // Scout who collected data
    timestamp: number;       // Collection time
    gameData?: Record<string, unknown>;  // Game-specific questions
    robotImages?: string[];  // Base64-encoded images
}
```

## Game-Specific Configuration

**Location:** `src/game-template/pit-scouting-config.ts`

Define pit scouting questions per game year:

```typescript
export const pitScoutingQuestions = [
    {
        id: 'driveType',
        label: 'Drive Type',
        type: 'select',
        options: ['Swerve', 'Tank', 'Mecanum', 'Other'],
        required: true
    },
    {
        id: 'canClimb',
        label: 'Can Climb?',
        type: 'checkbox'
    },
    {
        id: 'maxSpeed',
        label: 'Max Speed (ft/s)',
        type: 'number',
        min: 0,
        max: 20
    }
];
```

## Database Operations

**Location:** `src/core/db/database.ts`

```typescript
// Save pit scouting entry
await savePitScoutingEntry(entry);

// Load entries by team
const entries = await loadPitScoutingByTeam(teamNumber);

// Load entry by team and event
const entry = await loadPitScoutingByTeamAndEvent(teamNumber, eventKey);

// Load all entries for an event
const allEntries = await loadPitScoutingByEvent(eventKey);

// Delete entry
await deletePitScoutingEntry(entryId);

// Get statistics
const stats = await getPitScoutingStats();
// { totalEntries, teams, events, scouts }
```

## Photo Capture

### Camera Access

```typescript
const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' }  // Rear camera
});
```

### Image Processing

Images are stored as base64 strings:

```typescript
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');
ctx.drawImage(video, 0, 0);
const imageData = canvas.toDataURL('image/jpeg', 0.8);
```

### Storage Considerations

- Images are compressed to 80% quality
- Max recommended: 3-5 images per robot
- Consider separate image export for backup

## Utilities

**Location:** `src/core/lib/pitScoutingUtils.ts`

```typescript
// Generate unique ID
const id = generatePitScoutingId(entry);

// Save with ID generation
const saved = await savePitScoutingEntry(entry);

// Get stats
const stats = await getPitScoutingStats();
```

## Best Practices

**DO:**
- ✅ Take photos from multiple angles
- ✅ Verify team number before submitting
- ✅ Use consistent question answers
- ✅ Note unique robot features

**DON'T:**
- ❌ Take photos without team permission
- ❌ Submit incomplete entries
- ❌ Duplicate entries for same team/event

---

**Last Updated:** January 2026
**Related Docs:**
- `docs/DATABASE.md` - Pit scouting database details
- `docs/JSON_DATA_TRANSFER.md` - Exporting pit scouting data
