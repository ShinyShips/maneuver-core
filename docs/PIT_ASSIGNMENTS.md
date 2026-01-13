# Pit Assignments

**Framework Component - Game-Agnostic**

Manage scout assignments for pit scouting at FRC events. Automatically divide teams among scouts using sequential or spatial (proximity-based) algorithms.

## Overview

The Pit Assignments system helps lead scouts organize and track pit scouting work by:

1. **Managing Scouts**: Add/remove scouts who will visit pits
2. **Generating Assignments**: Automatically divide teams among available scouts
3. **Tracking Progress**: Mark teams as completed when pit scouting is done
4. **Persistence**: Assignments are saved per-event and restored on return

### Key Features

- **Sequential Assignment**: Divide teams evenly among scouts in team number order
- **Spatial Assignment**: Group teams by physical location using Nexus pit map data (requires Nexus API)
- **Manual Assignment**: Assign individual teams to specific scouts
- **Auto-Detection**: Automatically marks teams as completed when pit scouting data exists
- **Focus Reload**: Refreshes team data when returning to the page

## Architecture

```
src/core/
├── pages/
│   └── PitAssignmentsPage.tsx      # Main page component
├── components/pit-assignments/
│   ├── AssignmentControlsCard.tsx  # Mode selection & generation
│   ├── AssignmentResults.tsx       # Table view of assignments
│   ├── EventInformationCard.tsx    # Event summary display
│   ├── PitMapCard.tsx              # Visual pit map (Nexus)
│   ├── ScoutManagementSection.tsx  # Add/remove scouts
│   ├── TeamDisplaySection.tsx      # Card view of assignments
│   └── shared/                     # Shared utilities
├── lib/
│   ├── pitAssignmentTypes.ts       # Type definitions
│   ├── pitAssignmentLogic.ts       # Assignment algorithms
│   └── spatialClustering.ts        # K-means clustering for spatial mode
└── hooks/
    └── useScoutManagement.ts       # Scout list management
```

## Requirements

The page requires **both** of the following to show assignment controls:

1. **Team Data**: Import from TBA (API Data page) or Nexus
2. **Scouts**: Add via the Scout Management section or Dev Utilities

> [!NOTE]
> If teams are imported after visiting the page, click away and back to trigger a refresh.

## Assignment Modes

### Sequential Mode
Divides teams evenly among scouts in numerical order:
- Scout A: Teams 1-20
- Scout B: Teams 21-40
- Scout C: Teams 41-60

### Spatial Mode (Nexus Required)
Groups teams by physical proximity in the pit area using K-means clustering:
- Reduces walking distance for scouts
- Requires Nexus pit map data with team coordinates
- Falls back to sequential if no spatial data available

### Manual Mode
Assign individual teams to specific scouts:
1. Select a scout from the dropdown
2. Click teams to assign them
3. Confirm assignments when done

## Data Sources

| Source | Teams | Pit Addresses | Spatial Clustering |
|--------|-------|---------------|-------------------|
| TBA    | ✅    | ❌            | ❌                |
| Nexus  | ✅    | ✅            | ✅                |

## Persistence

Assignments are stored in localStorage with key format:
```
pit_assignments_{eventKey}
```

This allows different assignments per event and restoration on page reload.

## Integration

### With Pit Scouting
The page automatically checks for existing pit scouting data:
- Teams with completed pit scouting entries are marked as "completed"
- Status updates when the page regains focus

### With Scout Management
Uses the shared `useScoutManagement` hook for scout list:
- Scouts added here appear in assignment dropdowns
- Changes are reflected across the app

## Troubleshooting

### "No team data found"
**Solution**: Go to API Data page and import teams from TBA or Nexus.

### Generate button not appearing
**Cause**: Missing teams or scouts
**Solution**: Ensure both are loaded, then click away and back to refresh.

### Spatial mode not available
**Cause**: No Nexus pit map data
**Solution**: Use Nexus API on API Data page to import pit coordinates.

## Route

```
/pit-assignments
```

## Related Docs

- [Pit Scouting](./PIT_SCOUTING.md) - The scouting form scouts fill out
- [Scout Management](./SCOUT_MANAGEMENT.md) - Managing scout profiles
- [API Data](./API_DATA.md) - Importing team data from TBA/Nexus
