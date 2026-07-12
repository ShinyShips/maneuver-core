# Join and onboarding guide

This guide is for an ordinary scouting device. Obtain a join artifact from the team operator, then open `/remote-sync` in the scouting app.

## Artifact-first join

1. Paste the artifact JSON into **Join artifact** or import the downloaded JSON file. The current Remote sync page does not scan the artifact QR directly.
2. Select **Review artifact**. Review happens before the app saves a connection.
3. Confirm the Team dataset name, backend identity, and recommended Event scope are the ones you expect.
4. Give the device a recognizable display name.
5. Review the device-local Event sync scope and confirm the join.

The artifact contains a Dataset join credential. It is reusable until rotation or revocation, so handle the file or QR like a team access token.

## Join review and local data

Joining is not permission to silently discard local scouting records. If the selected Event sync scope would prune existing out-of-scope records or unsynced writes, the app requires explicit confirmation before applying the scope.

After joining:

- scouting stays local-first;
- in-scope local changes enter the durable Remote sync queue;
- a successful sync drains committed writes and advances the device Sync cursor;
- pulled Remote sync changes are applied without being requeued;
- Scout profiles remain season-wide rather than Event-scoped.

The Event sync scope is a mutable device-local selection, not a dataset permission. Widening it catches up earlier cursor history. Narrowing it can prune local records and requires confirmation when unsynced writes would be discarded.

## Ordinary joined-device authority

An ordinary joined device can:

- push and pull Canonical sync documents for its selected events;
- see Queue health and broad Read-only dataset health;
- see high-level recent cleanup/restore awareness;
- create a local Human-readable export and, while online, selected-event or full-dataset Human-readable exports;
- disconnect without deleting its local scouting data.

It cannot:

- create or restore Portable dataset snapshots;
- perform replicated cleanup or revoke another device;
- inspect or approve privileged Rejoin recovery batches;
- obtain Cleanup authority from the normal join artifact;
- use operator recovery material as a join artifact.

## Revocation and rejoin

A revoked device becomes Hard disconnected: it keeps local data but cannot push or pull. Its queued Remote sync writes are discarded so stale authority cannot replay them automatically.

To return, join again through the normal flow with a valid artifact. Local records created or changed during the revoked period are prepared as a separate Post-rejoin resubmission batch. Submission does not import them automatically; a Cleanup-capable or server-local reviewer previews conflicts and decides which entries to approve, resolve manually, or hold.

## Other transfer paths remain available

Joining a Team dataset does not disable JSON export/import, QR Offline transfer, or Peer transfer. Use those flows when they fit the situation; they do not share the Remote sync queue or cursor.
