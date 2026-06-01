# Match Validation

The Match Validation page allows you to compare scouted data against official TBA (The Blue Alliance) results to identify discrepancies and ensure data accuracy.

## Overview

Match Validation works by:
1. Fetching official match results from TBA API
2. Loading scouted data from IndexedDB
3. Comparing scores by category (auto, teleop, endgame)
4. Flagging discrepancies with severity levels

## Page Features

### Match List
- Shows all matches for the selected event
- Displays scouting status (X/6 teams scouted)
- Indicates validation status (Passed, Flagged, Failed, Pending)
- Click any match to view details

### Validation Summary
- Total matches and validation status counts
- Filter by status (passed, flagged, failed)
- Quick overview of data quality

### Match Detail View
- **Validated matches**: Full comparison with discrepancies, team breakdown, scores
- **Unvalidated matches**: TBA scores and breakdown for reference

## How to Use

1. **Select Event**: Choose your event from the dropdown
2. **Validate Event**: Click to run validation on all matches with scouting data
3. **Review Results**: Click matches to see detailed comparison
4. **Address Issues**: Use "Re-scout" button for flagged matches

## File Structure

```
core/
├── pages/
│   └── MatchValidationPage.tsx    # Main page component
├── hooks/
│   └── useMatchValidation.ts      # Validation logic and TBA integration
├── components/match-validation/
│   ├── MatchListCard.tsx          # Match list display
│   ├── MatchValidationDetail.tsx  # Detail sheet view
│   ├── AllianceCard.tsx           # Alliance score comparison
│   ├── TeamBreakdown.tsx          # Per-team scouting details
│   ├── DiscrepancyList.tsx        # Discrepancy display
│   └── MatchSummaryCard.tsx       # Overall match summary
├── lib/
│   ├── matchValidationTypes.ts    # Type definitions
│   ├── matchValidationUtils.ts    # Utility functions
│   └── validationDisplayUtils.tsx # Badge and display helpers
└── db/
    └── scoutingDatabase.ts        # Scouting data queries
```

## Current customization boundary

Match Validation is still partly schema-driven in the current implementation.

Today, `useMatchValidation` reads action and toggle mappings directly from `src/game-template/game-schema.ts`:

### Required in `game-schema.ts` today

```typescript
// Export these functions for validation to work:
export function getAllMappedActionKeys(): string[] {
    // Return all action keys that map to TBA breakdown
    return Object.keys(actions);
}

export function getAllMappedToggleKeys(): string[] {
    // Return all toggle keys that map to TBA breakdown
    return Object.keys(toggles);
}
```

The page also relies on the yearly repo's validation configuration and score semantics.

### TBA score mapping

The validation compares these score categories:
- **autoPoints** - Autonomous phase scoring
- **teleopPoints** - Teleop phase scoring

These are generic TBA fields available for all games.

## Configuration

Validation behavior is configured via `ValidationConfig`:

```typescript
interface ValidationConfig {
    thresholds: {
        critical: number;  // % difference = critical (default: 25%)
        warning: number;   // % difference = warning (default: 15%)
        minor: number;     // % difference = minor (default: 5%)
    };
    checkAutoScoring: boolean;
    checkTeleopScoring: boolean;
    checkEndgame: boolean;
    autoFlagThreshold: number;  // Auto-flag if >= N critical discrepancies
}
```

## Testing with Dev Utilities

To test Match Validation without real scouting data:

1. Go to **Dev Utilities** page
2. Click **"Generate TBA Match Data"**
3. This creates scouting entries for actual TBA matches
4. Go to Match Validation and run validation

The generated data will have random values, producing expected discrepancies.

## API Requirements

### TBA API Key
Set `VITE_TBA_API_KEY` in your `.env` file:
```
VITE_TBA_API_KEY=your_tba_api_key_here
```

Get a key at: https://www.thebluealliance.com/account

## Database Tables

| Table | Purpose |
|-------|---------|
| `scoutingData` | Source scouting entries |
| `validationResults` | Cached validation results |
| `TBACacheDB` | Cached TBA match data |

## Data Structure Requirements

### Entry ID Format

Scouting entries must use this ID format for proper rescout/update behavior:

```
{eventKey}::{matchKey}::{teamNumber}::{allianceColor}
```

Examples:
- Qual: `2025mrcmp::qm24::3314::red`
- Semifinal: `2025mrcmp::sf1m1::3314::red`
- Final: `2025mrcmp::f1m2::3314::blue`

### gameData Structure

Validation expects gameData to be nested by phase:

```typescript
gameData: {
  auto: { 
    action1Count: 0, 
    autoToggle: true,
    // ... auto phase data
  },
  teleop: { 
    action1Count: 0,
    // ... teleop phase data
  },
  endgame: { 
    option1: false,
    option2: true,
    // ... endgame data
  }
}
```

The validation flattens this structure when aggregating.

## Contract note

The broader framework contract also exposes `ValidationRules<T>` through `GameProvider`, but the current validation page and hook still use `game-schema.ts` mappings directly. Treat this as an active hybrid area of the framework.

## Related Documentation

- [HOOKS_REFERENCE.md](HOOKS_REFERENCE.md) - `useMatchValidation` hook reference
- [DATABASE.md](DATABASE.md) - IndexedDB schema
- [DATA_TRANSFORMATION.md](DATA_TRANSFORMATION.md) - How scouting data is structured
