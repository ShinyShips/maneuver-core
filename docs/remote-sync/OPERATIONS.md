# Remote sync operations guide

This guide summarizes high-impact operations. Keep a current operator recovery artifact and know which actions require a Cleanup-capable device versus a server-local recovery surface.

## Export choices

| Export                            | Authority and connectivity     | Meaning                                                                                    |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------ |
| Current device local replica      | Any device; works offline      | Only records currently on that device; may be incomplete and labels known unsynced changes |
| Selected events from Team dataset | Ordinary joined device; online | Reads the requested remote events without widening local retention                         |
| Full Team dataset                 | Ordinary joined device; online | Human-readable dataset-wide export                                                         |
| Portable dataset snapshot         | Server-local only              | Restore-grade dataset identity, current Canonical sync documents, and cursor identity      |

If an online export fails, explicitly choose whether to fall back to the local replica. Never label a local fallback as dataset-complete.

## Cleanup authority

A Cleanup-capable device receives a device-specific provisioning artifact from Utilities. It may:

- create replicated tombstones for selected shared documents;
- revoke a specific joined device;
- inspect, preview, approve, hold, and reconsider Rejoin recovery entries.

Cleanup actions are attributed to a visible device/operator label. Disconnecting or resetting should deprovision Cleanup authority. Expired or revoked Cleanup credentials no longer authorize destructive actions.

## Device revocation

Use targeted revocation when one joined device should lose both push and pull access. Revocation keeps that device’s local data, discards its Remote sync queue, and does not invalidate every other device.

Use Global rejoin reset only for emergency broad invalidation. The server-local operation revokes active joined devices and join credentials, returns a replacement join credential, and requires every device to use the normal join flow again.

## Rejoin recovery

After a revoked device joins again, it may submit surviving local work as a separate recovery batch. Reviewers should:

1. inspect the batch identity and revoked source device;
2. preview each entry against current canonical state;
3. accept smart merges where appropriate;
4. escalate specific manual conflicts rather than blindly importing them;
5. approve or hold entries individually;
6. reconsider held entries later when new context is available.

The normal Remote sync queue must not be used to bypass this review.

## Portable snapshots and Destructive restore

Portable snapshots and restore are server-local operations. Before planned maintenance or migration, create a labeled snapshot and verify it can be retrieved from the configured snapshot store.

A Destructive restore replaces the Team dataset rather than merging it. The flow requires:

1. a warning acknowledgement;
2. the exact typed dataset name;
3. an automatic Pre-restore safety snapshot;
4. an attributed restore event with snapshot identity and optional reason.

If the safety snapshot fails, the first restore request must stop and return an Emergency restore override challenge. Proceed only after a separate explicit override decision. A successful restore keeps the Sync cursor monotonic so joined devices can catch up from their existing cursors.

For migration, restore a Portable dataset snapshot into a fresh deployment, create a new join credential, join a test device, and verify a cursor-zero catch-up before moving the team.

## Competition-day checklist

- Verify Queue health on more than one device.
- Confirm the intended Cleanup-capable device is visible in dataset health.
- Keep join and recovery artifacts in separate trusted locations.
- Take a labeled Portable snapshot before risky maintenance.
- Prefer targeted revocation over Global rejoin reset.
- Record a reason for restores and unusual cleanup actions.
- Preserve Offline transfer as a fallback; Remote sync availability should never block scouting.
