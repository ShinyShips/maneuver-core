# Remote sync guide set

**Remote sync** is optional bidirectional replication between a device and a Maneuver-compatible backend. Devices remain local-first: scouting writes are saved locally, queued, and replayed when the backend is reachable.

Choose the guide for the job:

1. [Firebase setup](FIREBASE_SETUP.md) — create the recommended Firebase project, configure Maneuver, and open the Utilities app.
2. [Utilities app](UTILITIES_APP.md) — create a **Team dataset** and handle join, cleanup, and recovery artifacts.
3. [Join and onboarding](JOIN_AND_ONBOARDING.md) — attach an ordinary scouting device and choose its device-local Event sync scope.
4. [Operations](OPERATIONS.md) — exports, cleanup authority, revocation, recovery, snapshots, and restore.
5. [Development](DEVELOPMENT.md) — the Official sync protocol boundary, Firebase adapter, and local test harness.

## Pick the right transfer path

| Path                 | Infrastructure                               | Best for                                                       | Relationship to other paths                                              |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Offline transfer** | None                                         | JSON file exchange or QR exchange when no network is available | Always remains available, even when the device has joined a Team dataset |
| **Peer transfer**    | A WebRTC room and connectivity between peers | Direct request/push between scout and lead devices             | Separate from the Remote sync queue                                      |
| **Remote sync**      | A configured Maneuver-compatible backend     | Ongoing convergence across joined devices                      | Optional; it does not replace Offline transfer or Peer transfer          |

Do not describe QR or JSON exchange as “sync,” and do not describe Peer transfer as offline. These paths can all be used by the same device.

## Authority at a glance

- An ordinary joined device can scout, push and pull its selected events, see broad dataset health, and create Human-readable dataset exports.
- A Cleanup-capable device can perform destructive replicated cleanup, revoke joined devices, and review Post-rejoin resubmission batches.
- A server-local recovery surface can create and restore Portable dataset snapshots, reset the dataset for global rejoin, and perform emergency administration.
- The Dataset join credential does not grant cleanup or server-local recovery authority.
