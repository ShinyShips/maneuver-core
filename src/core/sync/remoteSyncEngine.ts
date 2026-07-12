import type { CanonicalSyncChange, JoinedDatasetOverview, RemoteSyncClientAdapter } from './types';
import { db, deleteScoutingEntry, saveScoutingEntry } from '@/core/db/database';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import { loadRemoteSyncConnection, type RemoteSyncConnection } from './remoteSyncConnection';
import {
  getRemoteSyncQueueHealth,
  loadRemoteSyncQueueForDataset,
  markRemoteSyncQueueItemsAttempted,
  removeRemoteSyncQueueItems,
  setRemoteSyncQueueHealth,
} from './remoteSyncQueue';
import {
  shouldApplyRemoteScoutingEntry,
  shouldQueueScoutingEntryForConnection,
  type ScoutingEntrySyncDocument,
} from './scoutingEntryDocuments';
import { loadSyncCursor, saveSyncCursor } from './remoteSyncCursor';
import { markRemoteSyncDocumentsSynced } from './remoteSyncDocumentStatus';
import { createRemoteSyncAdapterForConnection } from './remoteSyncAdapterFactory';
import {
  loadScoutProfileQueueForDataset,
  markScoutProfileQueueItemsAttempted,
  removeScoutProfileQueueItems,
} from './scoutProfileQueue';
import {
  createScoutProfileSyncDocumentCandidate,
  reconcileScoutProfile,
  type ScoutProfileSyncDocument,
  type ScoutProfileSyncPayload,
} from './scoutProfileDocuments';
import {
  loadScoutProfileSyncPayload,
  saveScoutProfileSyncPayload,
} from '@/core/sync/scoutProfileStore';
import {
  isScoutProfileIdentityBound,
  markScoutProfileIdentityBound,
  recordScoutNameCollision,
  ScoutNameCollisionError,
} from './scoutNameCollision';

export interface RemoteSyncRunResult {
  pushedCount: number;
  pulledCount: number;
  cursor: number;
}

export async function readJoinedDatasetOverview(
  adapterOverride?: RemoteSyncClientAdapter
): Promise<JoinedDatasetOverview> {
  const connection = loadRemoteSyncConnection();

  if (!connection) {
    throw new Error('Join a Team dataset before reading dataset health.');
  }

  const adapter = adapterOverride ?? createRemoteSyncAdapterForConnection(connection);
  return adapter.getJoinedDatasetOverview({
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
  });
}

export async function syncScoutingEntries(
  adapterOverride?: RemoteSyncClientAdapter
): Promise<RemoteSyncRunResult> {
  const connection = loadRemoteSyncConnection();

  if (!connection) {
    throw new Error('Join a Team dataset before syncing scouting entries.');
  }

  const adapter = adapterOverride ?? createRemoteSyncAdapterForConnection(connection);

  try {
    await ensureRemoteDeviceJoined(connection, adapter);
    const pushedScoutingEntryCount = await pushQueuedScoutingEntries(connection, adapter);
    const initialPullResult = await pullRemoteChanges(connection, adapter);
    const pushedScoutProfileCount = await pushQueuedScoutProfiles(connection, adapter);
    const finalPullResult = await pullRemoteChanges(connection, adapter);
    const queueHealth = getRemoteSyncQueueHealth();
    setRemoteSyncQueueHealth({
      state: queueHealth.pendingWrites > 0 ? 'healthy' : 'idle',
      pendingWrites: queueHealth.pendingWrites,
      lastSuccessfulSyncAt: Date.now(),
    });

    return {
      pushedCount: pushedScoutingEntryCount + pushedScoutProfileCount,
      pulledCount: initialPullResult.pulledCount + finalPullResult.pulledCount,
      cursor: finalPullResult.cursor,
    };
  } catch (error) {
    setRemoteSyncQueueHealth({
      ...getRemoteSyncQueueHealth(),
      state:
        error instanceof ScoutNameCollisionError
          ? 'blocked'
          : typeof navigator !== 'undefined' && navigator.onLine
            ? 'error'
            : 'offline',
      blockedReason: error instanceof Error ? error.message : 'Remote sync failed.',
    });
    throw error;
  }
}

async function ensureRemoteDeviceJoined(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncClientAdapter
): Promise<void> {
  await adapter.joinDataset({
    artifact: {
      protocolVersion: 1,
      backend: connection.backend,
      datasetId: connection.datasetId,
      datasetName: connection.datasetName,
      credentialId: connection.credentialId,
      credentialSecret: connection.credentialSecret,
      firebase: connection.firebase,
      firestoreEmulator: connection.firestoreEmulator,
      recommendedDefaults: {
        scopeKey:
          connection.eventSyncScope.mode === 'selected' &&
          connection.eventSyncScope.eventKeys.length === 1
            ? connection.eventSyncScope.eventKeys[0]
            : undefined,
        queueMode: 'local-first',
      },
    },
    deviceId: connection.deviceId,
    deviceDisplayName: connection.deviceDisplayName,
  });
}

async function pushQueuedScoutingEntries(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncClientAdapter
): Promise<number> {
  const queueItems = loadRemoteSyncQueueForDataset(connection.datasetId);

  if (queueItems.length === 0) {
    return 0;
  }

  markRemoteSyncQueueItemsAttempted(queueItems.map(item => item.id));
  await adapter.pushDocuments({
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
    documents: queueItems.map(item => item.document),
  });
  markRemoteSyncDocumentsSynced(
    connection.datasetId,
    queueItems.map(item => item.documentId)
  );
  removeRemoteSyncQueueItems(queueItems.map(item => item.id));

  return queueItems.length;
}

async function pushQueuedScoutProfiles(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncClientAdapter
): Promise<number> {
  const queueItems = loadScoutProfileQueueForDataset(connection.datasetId);

  if (queueItems.length === 0) {
    return 0;
  }

  const queuedProfiles = (
    await Promise.all(
      queueItems.map(async item => ({
        item,
        payload: await loadScoutProfileSyncPayload(item.scoutName),
      }))
    )
  ).filter(
    (queued): queued is { item: (typeof queueItems)[number]; payload: ScoutProfileSyncPayload } =>
      queued.payload !== undefined
  );

  if (queuedProfiles.length === 0) {
    removeScoutProfileQueueItems(queueItems.map(item => item.id));
    return 0;
  }

  markScoutProfileQueueItemsAttempted(queuedProfiles.map(({ item }) => item.id));
  const result = await adapter.pushDocuments<ScoutProfileSyncPayload>({
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
    documents: queuedProfiles.map(({ payload }) =>
      createScoutProfileSyncDocumentCandidate(payload)
    ),
  });

  for (const document of result.committed) {
    if (document.documentType === 'scout-profile' && !document.tombstone) {
      await saveScoutProfileSyncPayload(document.payload);
      markScoutProfileIdentityBound(connection.datasetId, document.documentId);
    }
  }

  markRemoteSyncDocumentsSynced(
    connection.datasetId,
    queuedProfiles.map(({ item }) => `scout-profile:${item.documentId}`)
  );
  removeScoutProfileQueueItems(queuedProfiles.map(({ item }) => item.id));

  return queuedProfiles.length;
}

async function pullRemoteChanges(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncClientAdapter
): Promise<{ pulledCount: number; cursor: number }> {
  let cursor = loadSyncCursor(connection.datasetId);
  let pulledCount = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await adapter.pullChanges<unknown>({
      datasetId: connection.datasetId,
      afterCursor: cursor,
      pageSize: 100,
    });

    for (const change of result.changes) {
      const applied = await applyRemoteChange(connection, change);
      pulledCount += applied ? 1 : 0;
      cursor = Math.max(cursor, change.cursor);
    }

    hasMore = result.hasMore;
  }

  saveSyncCursor(connection.datasetId, cursor);
  return { pulledCount, cursor };
}

async function applyRemoteChange(
  connection: RemoteSyncConnection,
  change: CanonicalSyncChange<unknown>
): Promise<boolean> {
  if (change.documentType === 'match-scouting-entry') {
    return applyRemoteScoutingEntryChange(
      connection,
      change as CanonicalSyncChange<ScoutingEntryBase<Record<string, unknown>>>
    );
  }

  if (change.documentType === 'scout-profile') {
    return applyRemoteScoutProfileChange(
      connection,
      change as CanonicalSyncChange<ScoutProfileSyncPayload>
    );
  }

  return false;
}

async function applyRemoteScoutingEntryChange(
  connection: RemoteSyncConnection,
  change: CanonicalSyncChange<ScoutingEntryBase<Record<string, unknown>>>
): Promise<boolean> {
  if (change.documentType !== 'match-scouting-entry') {
    return false;
  }

  const document = change.document as ScoutingEntrySyncDocument;

  if (!shouldQueueScoutingEntryForConnection(document.payload, connection.eventSyncScope)) {
    return false;
  }

  if (document.updatedByDeviceId === connection.deviceId) {
    return false;
  }

  const localEntry = await db.scoutingData.get(document.documentId);

  if (document.tombstone) {
    if (!localEntry || shouldApplyRemoteScoutingEntry(localEntry, document.payload)) {
      await deleteScoutingEntry(document.documentId, { queueRemoteSync: false });
      markRemoteSyncDocumentsSynced(connection.datasetId, [document.documentId]);
      return true;
    }
    return false;
  }

  if (shouldApplyRemoteScoutingEntry(localEntry, document.payload)) {
    await saveScoutingEntry(document.payload, { queueRemoteSync: false });
    markRemoteSyncDocumentsSynced(connection.datasetId, [document.documentId]);
    return true;
  }

  return false;
}

async function applyRemoteScoutProfileChange(
  connection: RemoteSyncConnection,
  change: CanonicalSyncChange<ScoutProfileSyncPayload>
): Promise<boolean> {
  const document = change.document as ScoutProfileSyncDocument;

  if (document.updatedByDeviceId === connection.deviceId || document.tombstone) {
    return false;
  }

  const localProfile = await loadScoutProfileSyncPayload(document.payload.scout.name);

  if (localProfile && !isScoutProfileIdentityBound(connection.datasetId, document.documentId)) {
    const collision = recordScoutNameCollision({
      datasetId: connection.datasetId,
      documentId: document.documentId,
      localName: localProfile.scout.name,
      remoteName: document.payload.scout.name,
    });
    throw new ScoutNameCollisionError(collision);
  }

  const hasQueuedLocalProfile = loadScoutProfileQueueForDataset(connection.datasetId).some(
    item => item.documentId === document.documentId
  );

  if (localProfile && hasQueuedLocalProfile) {
    const reconciliation = reconcileScoutProfile(document.payload, localProfile);

    if (reconciliation.status === 'manual-conflict') {
      throw new Error(reconciliation.conflict.message);
    }

    await saveScoutProfileSyncPayload(reconciliation.payload);
    markScoutProfileIdentityBound(connection.datasetId, document.documentId);
    return true;
  }

  await saveScoutProfileSyncPayload(document.payload);
  markScoutProfileIdentityBound(connection.datasetId, document.documentId);
  markRemoteSyncDocumentsSynced(connection.datasetId, [`scout-profile:${document.documentId}`]);
  return true;
}
