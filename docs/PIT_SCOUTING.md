# Pit scouting

The Pit Scouting page is a shell-owned form flow with an optional yearly-owned question section.

## Current page structure

`src/core/pages/PitScoutingPage.tsx` renders shared sections for:

- basic information
- robot photo capture
- technical specifications
- additional notes

It also reads `ui.PitScoutingQuestions` from `GameProvider` and renders that section when the yearly repo provides it.

## Current form behavior

`usePitScoutingForm()` manages the form state and currently:

- seeds `eventKey` and `currentScout` from local storage
- validates required universal fields
- saves to IndexedDB through `savePitScoutingEntry(...)`
- supports manual loading of an existing entry for the same team and event
- falls back to the latest prior-event entry for the same team when no event-specific entry exists

## Pit assignment integration

The current page also integrates with the pit-assignment transfer flow.

It can:

- load assignments for the current scout and event
- show a “My Pit Assignments” sheet
- quick-select assigned teams
- mark an assignment complete after a successful save
- show sync metadata when assignments were imported from another scout

## Current data model

The saved pit entry remains generic at the shell layer:

- universal fields such as team, scout, event, timestamp, photo, drivetrain, language, and notes
- a `gameData` object for yearly-owned questions

That keeps the shell generic while still allowing season-specific pit forms.

## Ownership split

### Shell-owned

- page layout and common form sections
- photo handling
- IndexedDB save/load plumbing
- assignment integration

### Yearly-owned

- optional `PitScoutingQuestions` UI
- structure and meaning of `gameData`

## Related docs

- [TEAM_STATS.md](TEAM_STATS.md)
- [JSON_DATA_TRANSFER.md](JSON_DATA_TRANSFER.md)
