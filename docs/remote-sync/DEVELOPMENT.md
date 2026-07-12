# Remote sync developer guide

## Architecture boundary

Yearly repos depend on the Maneuver-owned **Official sync protocol**, not Firebase SDK calls. The public boundary is defined in [`src/core/sync/types.ts`](../../src/core/sync/types.ts):

- `RemoteSyncClientAdapter` — join, push/pull, joined-device health, Cleanup-capable operations, and Rejoin recovery submission/review.
- `RemoteSyncAdminAdapter` — dataset and credential lifecycle plus server-local cleanup, revocation, reset, snapshots, restore, and recovery review.
- `RemoteSyncAdapter` — the combined adapter contract used by the current Firebase implementation and the in-memory contract harness.

Keep backend-native calls inside [`src/core/sync/firebase/`](../../src/core/sync/firebase/). Client pages, Utilities, and yearly code should use the Official sync protocol interfaces or composition helpers such as `createRemoteSyncAdapterForConnection`.

Canonical documents are whole-document upserts. Correctness comes from cursor catch-up over the append-only change log; websocket or provider notifications may prompt a pull but must not become the source of truth.

## Firebase composition

`getFirebaseRemoteSyncConfigFromEnv` reads the `VITE_FIREBASE_*` variables. `createFirebaseRemoteSyncAdapter` is the browser/client composition. Server-local snapshot and restore workflows require `createFirebaseRemoteSyncServerLocalAdapter` with a `ServerLocalSnapshotStore`; the file-backed store is used by the emulator smoke lane.

Do not call server-local methods through the browser adapter. The implementation rejects that path, and Firestore rules deny browser access to snapshot documents.

## Local development

Install dependencies first:

```bash
npm install
```

The repository launcher requires a Java 21 runtime under `.local-tools/temurin21-jre`; it searches that directory recursively for `java`/`java.exe` and does not fall back to system Java. Download a Temurin 21 JRE for your platform, extract it under that exact directory, and keep it untracked. Confirm the resulting layout contains a path such as `.local-tools/temurin21-jre/bin/java.exe` (Windows) or `.local-tools/temurin21-jre/bin/java` (macOS/Linux).

Then start Firestore:

```bash
npm run firebase:emulators
```

In a second terminal, configure the Vite app for the local project and emulator:

```dotenv
VITE_FIREBASE_PROJECT_ID=maneuver-dev
VITE_FIREBASE_API_KEY=local-dev-api-key
VITE_FIREBASE_APP_ID=maneuver-maneuver-dev
VITE_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1
VITE_FIREBASE_FIRESTORE_EMULATOR_PORT=8080
```

Then run:

```bash
npm run dev:vite
```

Open the scouting app at `/`, Remote sync at `/remote-sync`, Utilities at `/utilities.html`, and the emulator UI at `http://127.0.0.1:4000`.

Firebase Tools is installed in `node_modules` by `npm install`.

## Verification lanes

The PR lane covers the core transfer regression and in-memory Official sync contract:

```bash
npm test
# equivalent to npm run test:pr
```

The Heavy confidence lane adds the Firebase persistence/migration smoke check. Start the emulator first, then run:

```bash
npm run test:heavy
```

Focused commands:

```bash
npm run test:core-regression
npm run test:remote-sync
npm run smoke:remote-sync:emulator
npm run typecheck
npm run build
```

The contract lane uses public client/admin seams and the in-memory adapter. It covers cursor catch-up, full-document replacement, durable queue replay, reconciliation, scope, membership/authority, exports, cleanup, revocation, restore, and Rejoin recovery. The emulator lane covers Firestore rules, adapter restart persistence, large snapshots, destructive restore, Global rejoin reset, and fresh-deployment migration.

When adding coverage, assert observable outcomes through these interfaces. Do not assert private queue storage, adapter collection layout, or implementation call counts.

## Production hardening boundary

The checked-in Firestore rules are explicitly for local/dev testing. A production deployment must authenticate device/operator claims and enforce dataset membership at the rules or trusted-service boundary. Do not weaken snapshot, cleanup-secret, or privileged-history protections to make a browser flow pass.
