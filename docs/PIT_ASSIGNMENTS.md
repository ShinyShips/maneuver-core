# Pit assignments

The Pit Assignments page is the shell-owned coordination view for distributing pit scouting work across scouts.

## Current page behavior

`src/core/pages/PitAssignmentsPage.tsx` currently:

- loads one active event, preferring Nexus team data over TBA team data when both exist
- combines locally managed scouts with currently connected WebRTC scouts
- stores assignments per event in local storage
- tracks completion by checking whether pit scouting entries already exist
- refreshes team and completion status when the page regains focus
- can push assignment payloads to connected scouts over the peer-transfer channel

## Current assignment modes

The page supports:

- **Sequential** assignment by team number
- **Spatial** assignment when Nexus pit-address and map data are available
- **Manual** assignment to a selected scout

Spatial mode is only available when Nexus-provided pit location data exists for the active event.

## Current data sources

| Source | What it provides |
| --- | --- |
| TBA team cache | event teams |
| Nexus team cache | event teams, pit addresses, and pit map data |
| Scout management | selectable scout list from local storage plus scout DB backing |
| Pit scouting entries | completion status for assigned teams |
| WebRTC context | currently connected scouts and assignment sync |

## Persistence

Assignments are stored in local storage under per-event keys:

```text
pit_assignments_{eventKey}
```

This keeps assignment planning local-first and resilient during an event.

## Relationship to pit scouting

The page is tightly linked to the Pit Scouting flow:

- teams with saved pit entries are marked complete
- returning from pit scouting updates completion state
- the pit scouting page can consume assignment data and mark entries complete from the scout-facing side

## Scout source of truth

`useScoutManagement()` currently treats local storage as the source of truth for the selectable scout list, then ensures those scouts also exist in the scout database for gamification and dashboard features.

That means pit assignments should be documented as using the **shared selectable scout list**, not as owning a separate scout roster.

## Current requirements

To use assignment generation effectively, you need:

1. event team data already imported from TBA or Nexus
2. at least one scout in the shared selectable scout list

If data is imported after the page is already open, the page refreshes that state when focus returns.

## Related docs

- [PIT_SCOUTING.md](PIT_SCOUTING.md)
- [SCOUT_MANAGEMENT.md](SCOUT_MANAGEMENT.md)
- [PEER_TRANSFER.md](PEER_TRANSFER.md)
