import { deleteApp, initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  terminate,
} from 'firebase/firestore';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import path from 'node:path';

const useEmulator = process.argv.includes('--emulator');
const projectId =
  process.env.VITE_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  (useEmulator ? 'maneuver-dev' : undefined);
const emulatorHost =
  process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST ||
  process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] ||
  (useEmulator ? '127.0.0.1' : undefined);
const emulatorPort = Number(
  process.env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT ||
    process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] ||
    8080
);

if (!projectId) {
  throw new Error(
    'Set VITE_FIREBASE_PROJECT_ID or FIREBASE_PROJECT_ID before running the Remote sync smoke check.'
  );
}

const app = initializeApp({
  projectId,
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'local-dev-api-key',
  appId: process.env.VITE_FIREBASE_APP_ID || `maneuver-${projectId}`,
});
const firestore = getFirestore(app);

if (emulatorHost) {
  connectFirestoreEmulator(firestore, emulatorHost, emulatorPort);
}

const smokeId = `remote-sync-smoke-${Date.now()}`;
const smokeRef = doc(firestore, 'datasets', smokeId);

await setDoc(smokeRef, {
  datasetId: smokeId,
  displayName: 'Remote sync smoke dataset',
  createdAt: Date.now(),
  createdByDeviceId: 'smoke-script',
});

const snapshot = await getDoc(smokeRef);

if (!snapshot.exists()) {
  throw new Error('Remote sync smoke write did not round-trip through Firestore.');
}

await deleteDoc(smokeRef);
await terminate(firestore);
await deleteApp(app);

console.log(`Remote sync Firebase smoke check passed for project ${projectId}.`);

if (useEmulator) {
  const vite = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'error',
    root: process.cwd(),
    optimizeDeps: { noDiscovery: true },
    server: { middlewareMode: true },
  });
  try {
    const { createFirebaseRemoteSyncAdapter, createFirebaseRemoteSyncServerLocalAdapter } =
      await vite.ssrLoadModule('/src/core/sync/firebase/firebaseRemoteSyncAdapter.ts');
    const { createFileServerLocalSnapshotStore } = await vite.ssrLoadModule(
      '/src/core/sync/firebase/fileServerLocalSnapshotStore.ts'
    );
    const config = {
      firebase: {
        projectId,
        apiKey: 'local-dev-api-key',
        appId: `maneuver-${projectId}-restore-contract`,
      },
      firestoreEmulator: { host: emulatorHost, port: emulatorPort },
    };
    const browserAdapter = createFirebaseRemoteSyncAdapter(config);
    const serverAdapter = createFirebaseRemoteSyncServerLocalAdapter(config, {
      snapshotStore: createFileServerLocalSnapshotStore(
        path.join(tmpdir(), 'maneuver-remote-sync-smoke', projectId)
      ),
    });
    const dataset = await serverAdapter.createDataset({
      displayName: 'Remote sync restore smoke dataset',
      operatorDeviceId: 'server-local-smoke',
    });
    const joinCredential = await serverAdapter.createJoinCredential({
      datasetId: dataset.datasetId,
      operatorDeviceId: 'server-local-smoke',
    });
    const artifact = {
      protocolVersion: 1,
      backend: 'firebase',
      datasetId: dataset.datasetId,
      datasetName: dataset.displayName,
      credentialId: joinCredential.credentialId,
      credentialSecret: joinCredential.secret,
      firebase: config.firebase,
      firestoreEmulator: config.firestoreEmulator,
      recommendedDefaults: { queueMode: 'local-first' },
    };
    await browserAdapter.joinDataset({
      artifact,
      deviceId: 'restore-smoke-client',
      deviceDisplayName: 'Restore smoke client',
    });
    const seedDocuments = Array.from({ length: 260 }, (_, index) => ({
      documentId: `restore-smoke-entry-${index}`,
      documentType: 'match-scouting-entry',
      scopeKey: '2026miket',
      tombstone: false,
      payload: { comments: `snapshot state ${index}` },
    }));
    for (let start = 0; start < seedDocuments.length; start += 100) {
      await browserAdapter.pushDocuments({
        datasetId: dataset.datasetId,
        deviceId: 'restore-smoke-client',
        documents: seedDocuments.slice(start, start + 100),
      });
    }
    await assertRejects(
      () =>
        browserAdapter.createPortableDatasetSnapshotServerLocal({
          datasetId: dataset.datasetId,
          actorDeviceId: 'browser-smoke',
          actorDisplayName: 'Browser smoke',
          snapshotLabel: 'Browser snapshot attempt',
        }),
      /privileged server adapter/
    );
    const portableSnapshot = await serverAdapter.createPortableDatasetSnapshotServerLocal({
      datasetId: dataset.datasetId,
      actorDeviceId: 'server-local-smoke',
      actorDisplayName: 'Server-local smoke',
      snapshotLabel: 'Known-good smoke state',
    });
    if (portableSnapshot.cursor !== 260 || portableSnapshot.documents.length !== 260) {
      throw new Error('Portable Firebase snapshot is not a coherent current-state recovery point.');
    }
    const durableSnapshot = await serverAdapter.getPortableDatasetSnapshotServerLocal(
      dataset.datasetId,
      portableSnapshot.snapshotId
    );
    if (durableSnapshot.documents.length !== 260) {
      throw new Error('Portable Firebase snapshot was not durably retrievable.');
    }
    const snapshotRulesApp = initializeApp(config.firebase, `snapshot-rules-${Date.now()}`);
    const snapshotRulesFirestore = getFirestore(snapshotRulesApp);
    connectFirestoreEmulator(snapshotRulesFirestore, emulatorHost, emulatorPort);
    const forbiddenSnapshotRef = doc(
      snapshotRulesFirestore,
      'datasets',
      dataset.datasetId,
      'snapshots',
      portableSnapshot.snapshotId
    );
    await assertRejects(() => getDoc(forbiddenSnapshotRef), /permission-denied|PERMISSION_DENIED/);
    await assertRejects(
      () => setDoc(forbiddenSnapshotRef, { snapshotId: portableSnapshot.snapshotId }),
      /permission-denied|PERMISSION_DENIED/
    );
    await terminate(snapshotRulesFirestore);
    await deleteApp(snapshotRulesApp);
    await assertRejects(
      () =>
        browserAdapter.restorePortableDatasetSnapshotServerLocal({
          datasetId: dataset.datasetId,
          snapshot: portableSnapshot,
          actorDeviceId: 'browser-smoke',
          actorDisplayName: 'Browser smoke',
          warningAccepted: true,
          typedDatasetName: dataset.displayName,
        }),
      /privileged server adapter/
    );
    await browserAdapter.pushDocuments({
      datasetId: dataset.datasetId,
      deviceId: 'restore-smoke-client',
      documents: [
        {
          documentId: 'restore-smoke-entry-0',
          documentType: 'match-scouting-entry',
          scopeKey: '2026miket',
          tombstone: false,
          payload: { comments: 'diverged state' },
        },
      ],
    });
    const cursorBeforeRestore = (await browserAdapter.getDatasetHealth(dataset.datasetId))
      .currentCursor;
    const restore = await serverAdapter.restorePortableDatasetSnapshotServerLocal({
      datasetId: dataset.datasetId,
      snapshot: portableSnapshot,
      actorDeviceId: 'server-local-smoke',
      actorDisplayName: 'Server-local smoke',
      warningAccepted: true,
      typedDatasetName: dataset.displayName,
      reason: 'Emulator recovery contract',
    });
    if (restore.status !== 'restored') {
      throw new Error(`Expected emulator restore to complete, received ${restore.status}.`);
    }
    const replay = await browserAdapter.pullChanges({
      datasetId: dataset.datasetId,
      deviceId: 'restore-smoke-client',
      afterCursor: cursorBeforeRestore,
    });
    const restoredDocument = replay.changes.find(
      change => change.documentId === 'restore-smoke-entry-0'
    )?.document;
    if (restoredDocument?.payload?.comments !== 'snapshot state 0') {
      throw new Error('Firebase server-local restore did not replay the snapshot state.');
    }
    if (restore.restoredDocuments.length !== 260) {
      throw new Error('Firebase server-local restore did not replace the full large dataset.');
    }

    const cleanupCredential = await serverAdapter.createCleanupCredential({
      datasetId: dataset.datasetId,
      operatorDeviceId: 'server-local-smoke',
    });
    await browserAdapter.joinDataset({
      artifact,
      deviceId: 'cleanup-revocation-smoke-client',
      deviceDisplayName: 'Cleanup revocation smoke client',
    });
    await browserAdapter.provisionCleanupAuthority({
      datasetId: dataset.datasetId,
      deviceId: 'cleanup-revocation-smoke-client',
      credentialId: cleanupCredential.credentialId,
      credentialSecret: cleanupCredential.secret,
    });
    await browserAdapter.joinDataset({
      artifact,
      deviceId: 'revocation-smoke-target',
      deviceDisplayName: 'Revocation smoke target',
    });
    await browserAdapter.revokeJoinedDevice({
      datasetId: dataset.datasetId,
      actorDeviceId: 'cleanup-revocation-smoke-client',
      targetDeviceId: 'revocation-smoke-target',
    });
    await assertRejects(
      () =>
        browserAdapter.pushDocuments({
          datasetId: dataset.datasetId,
          deviceId: 'revocation-smoke-target',
          documents: [],
        }),
      /revoked/
    );
    await assertRejects(
      () =>
        browserAdapter.pullChanges({
          datasetId: dataset.datasetId,
          deviceId: 'revocation-smoke-target',
          afterCursor: 0,
        }),
      /revoked/
    );
    await browserAdapter.joinDataset({
      artifact,
      deviceId: 'rejoin-recovery-smoke-client',
      deviceDisplayName: 'Rejoin recovery smoke client',
    });
    const recoveryBatch = await browserAdapter.submitRejoinRecoveryBatch({
      datasetId: dataset.datasetId,
      deviceId: 'rejoin-recovery-smoke-client',
      revokedDeviceId: 'revocation-smoke-target',
      documents: [
        {
          documentId: 'rejoin-recovery-smoke-entry-a',
          documentType: 'match-scouting-entry',
          scopeKey: '2026miket',
          tombstone: false,
          payload: { comments: 'recover a' },
        },
        {
          documentId: 'rejoin-recovery-smoke-entry-b',
          documentType: 'match-scouting-entry',
          scopeKey: '2026miket',
          tombstone: false,
          payload: { comments: 'recover b' },
        },
      ],
    });
    await assertRejects(
      () =>
        browserAdapter.listRejoinRecoveryBatches({
          datasetId: dataset.datasetId,
          deviceId: 'rejoin-recovery-smoke-client',
        }),
      /cleanup authority/
    );
    const browserRecoveryBatches = await browserAdapter.listRejoinRecoveryBatches({
      datasetId: dataset.datasetId,
      deviceId: 'cleanup-revocation-smoke-client',
    });
    if (browserRecoveryBatches[0]?.batchId !== recoveryBatch.batchId) {
      throw new Error('Firebase cleanup review could not list a submitted rejoin recovery batch.');
    }
    const recoveryPreview = await browserAdapter.previewRejoinRecoveryBatch({
      datasetId: dataset.datasetId,
      deviceId: 'cleanup-revocation-smoke-client',
      batchId: recoveryBatch.batchId,
    });
    if (recoveryPreview.entries.some(entry => entry.previewStatus !== 'smart-merge')) {
      throw new Error('Firebase rejoin recovery preview did not expose smart-merge candidates.');
    }
    const partialRecovery = await browserAdapter.reviewRejoinRecoveryBatch({
      datasetId: dataset.datasetId,
      deviceId: 'cleanup-revocation-smoke-client',
      batchId: recoveryBatch.batchId,
      decisions: [
        {
          entryId: recoveryBatch.entries[0].entryId,
          action: 'approve',
          resolution: 'smart-merge',
        },
        { entryId: recoveryBatch.entries[1].entryId, action: 'reject' },
      ],
    });
    if (partialRecovery.status !== 'completed') {
      throw new Error('Firebase rejoin recovery did not persist per-entry review decisions.');
    }
    const serverRecoveryBatches = await serverAdapter.listRejoinRecoveryBatchesServerLocal({
      datasetId: dataset.datasetId,
      actorDeviceId: 'server-local-smoke',
      actorDisplayName: 'Server-local smoke',
    });
    if (serverRecoveryBatches[0]?.batchId !== recoveryBatch.batchId) {
      throw new Error('Firebase server-local recovery authority could not list review batches.');
    }
    const reconsideredRecovery = await serverAdapter.reconsiderRejectedRejoinEntriesServerLocal({
      datasetId: dataset.datasetId,
      actorDeviceId: 'server-local-smoke',
      actorDisplayName: 'Server-local smoke',
      batchId: recoveryBatch.batchId,
      entryIds: [recoveryBatch.entries[1].entryId],
    });
    if (reconsideredRecovery.entries[1]?.status !== 'pending') {
      throw new Error('Firebase server-local recovery could not reconsider a held entry.');
    }
    const expiringCleanupCredential = await serverAdapter.createCleanupCredential({
      datasetId: dataset.datasetId,
      operatorDeviceId: 'server-local-smoke',
      expiresAt: Date.now() + 500,
    });
    await browserAdapter.joinDataset({
      artifact,
      deviceId: 'expiring-cleanup-smoke-client',
      deviceDisplayName: 'Expiring cleanup smoke client',
    });
    await browserAdapter.joinDataset({
      artifact,
      deviceId: 'expiry-revocation-smoke-target',
      deviceDisplayName: 'Expiry revocation smoke target',
    });
    await browserAdapter.provisionCleanupAuthority({
      datasetId: dataset.datasetId,
      deviceId: 'expiring-cleanup-smoke-client',
      credentialId: expiringCleanupCredential.credentialId,
      credentialSecret: expiringCleanupCredential.secret,
      credentialExpiresAt: expiringCleanupCredential.expiresAt,
    });
    await new Promise(resolve => setTimeout(resolve, 600));
    await assertRejects(
      () =>
        browserAdapter.revokeJoinedDevice({
          datasetId: dataset.datasetId,
          actorDeviceId: 'expiring-cleanup-smoke-client',
          targetDeviceId: 'expiry-revocation-smoke-target',
        }),
      /does not have cleanup authority/
    );
    const globalReset = await serverAdapter.resetDatasetForRejoinServerLocal({
      datasetId: dataset.datasetId,
      actorDeviceId: 'server-local-smoke',
      actorDisplayName: 'Server-local smoke',
    });
    if (globalReset.operation !== 'global-rejoin-reset') {
      throw new Error('Firebase global rejoin reset did not return the distinct reset result.');
    }
    await assertRejects(
      () =>
        browserAdapter.pullChanges({
          datasetId: dataset.datasetId,
          deviceId: 'cleanup-revocation-smoke-client',
          afterCursor: 0,
        }),
      /revoked/
    );
    await assertRejects(
      () =>
        browserAdapter.joinDataset({
          artifact,
          deviceId: 'old-artifact-smoke-client',
          deviceDisplayName: 'Old artifact smoke client',
        }),
      /credential has been revoked/
    );
    await browserAdapter.joinDataset({
      artifact: {
        ...artifact,
        credentialId: globalReset.replacementJoinCredential.credentialId,
        credentialSecret: globalReset.replacementJoinCredential.secret,
      },
      deviceId: 'rejoined-after-reset-smoke-client',
      deviceDisplayName: 'Rejoined after reset smoke client',
    });

    const migrationProjectId = `${projectId}-migration`;
    const migrationConfig = {
      ...config,
      firebase: {
        ...config.firebase,
        projectId: migrationProjectId,
        appId: `maneuver-${migrationProjectId}-restore-contract`,
      },
    };
    const migrationServerAdapter = createFirebaseRemoteSyncServerLocalAdapter(migrationConfig, {
      snapshotStore: createFileServerLocalSnapshotStore(
        path.join(tmpdir(), 'maneuver-remote-sync-smoke', migrationProjectId)
      ),
    });
    const migrationRestore = await migrationServerAdapter.restorePortableDatasetSnapshotServerLocal(
      {
        datasetId: portableSnapshot.dataset.datasetId,
        snapshot: portableSnapshot,
        actorDeviceId: 'migration-server-local-smoke',
        actorDisplayName: 'Migration server-local smoke',
        warningAccepted: true,
        typedDatasetName: portableSnapshot.dataset.displayName,
        reason: 'Fresh deployment migration contract',
      }
    );
    if (migrationRestore.status !== 'restored') {
      throw new Error(
        `Expected Firebase migration to complete, received ${migrationRestore.status}.`
      );
    }
    const migrationBrowserAdapter = createFirebaseRemoteSyncAdapter(migrationConfig);
    const migrationCredential = await migrationServerAdapter.createJoinCredential({
      datasetId: portableSnapshot.dataset.datasetId,
      operatorDeviceId: 'migration-server-local-smoke',
    });
    await migrationBrowserAdapter.joinDataset({
      artifact: {
        ...artifact,
        credentialId: migrationCredential.credentialId,
        credentialSecret: migrationCredential.secret,
        firebase: migrationConfig.firebase,
      },
      deviceId: 'migration-smoke-client',
      deviceDisplayName: 'Migration smoke client',
    });
    const migrationReplay = await migrationBrowserAdapter.pullChanges({
      datasetId: portableSnapshot.dataset.datasetId,
      deviceId: 'migration-smoke-client',
      afterCursor: 0,
      pageSize: 300,
    });
    if (migrationReplay.changes.length !== 260) {
      throw new Error('Fresh Firebase deployment did not replay the migrated snapshot.');
    }
    console.log('Remote sync Firebase server-local restore contract passed.');
  } finally {
    await vite.close();
  }
}

async function assertRejects(operation, expected) {
  try {
    await operation();
  } catch (error) {
    const errorText =
      error instanceof Error
        ? `${error.message} ${'code' in error ? String(error.code) : ''}`
        : String(error);
    if (expected.test(errorText)) {
      return;
    }
    throw error;
  }
  throw new Error(`Expected operation to reject with ${expected}.`);
}
