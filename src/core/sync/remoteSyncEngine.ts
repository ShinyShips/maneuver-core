import { createFirebaseRemoteSyncAdapter } from './firebase';
import type { CanonicalSyncChange, RemoteSyncAdapter } from './types';
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

const CURSOR_STORAGE_PREFIX = 'maneuver.remoteSync.cursor';

export interface RemoteSyncRunResult {
  pushedCount: number;
  pulledCount: number;
  cursor: number;
}

export async function syncScoutingEntries(
  adapterOverride?: RemoteSyncAdapter
): Promise<RemoteSyncRunResult> {
  const connection = loadRemoteSyncConnection();

  if (!connection) {
    throw new Error('Join a Team dataset before syncing scouting entries.');
  }

  const adapter = adapterOverride ?? createAdapterForConnection(connection);

  try {
    await ensureRemoteDeviceJoined(connection, adapter);
    const pushedCount = await pushQueuedScoutingEntries(connection, adapter);
    const pullResult = await pullScoutingEntryChanges(connection, adapter);
    const queueHealth = getRemoteSyncQueueHealth();
    setRemoteSyncQueueHealth({
      state: queueHealth.pendingWrites > 0 ? 'healthy' : 'idle',
      pendingWrites: queueHealth.pendingWrites,
      lastSuccessfulSyncAt: Date.now(),
    });

    return {
      pushedCount,
      pulledCount: pullResult.pulledCount,
      cursor: pullResult.cursor,
    };
  } catch (error) {
    setRemoteSyncQueueHealth({
      ...getRemoteSyncQueueHealth(),
      state: typeof navigator !== 'undefined' && navigator.onLine ? 'error' : 'offline',
      blockedReason: error instanceof Error ? error.message : 'Remote sync failed.',
    });
    throw error;
  }
}

async function ensureRemoteDeviceJoined(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncAdapter
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
        scopeKey: connection.scopeKey,
        queueMode: 'local-first',
      },
    },
    deviceId: connection.deviceId,
    deviceDisplayName: connection.deviceDisplayName,
  });
}

async function pushQueuedScoutingEntries(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncAdapter
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
  removeRemoteSyncQueueItems(queueItems.map(item => item.id));

  return queueItems.length;
}

async function pullScoutingEntryChanges(
  connection: RemoteSyncConnection,
  adapter: RemoteSyncAdapter
): Promise<{ pulledCount: number; cursor: number }> {
  let cursor = loadSyncCursor(connection.datasetId);
  let pulledCount = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await adapter.pullChanges<ScoutingEntryBase<Record<string, unknown>>>({
      datasetId: connection.datasetId,
      afterCursor: cursor,
      pageSize: 100,
    });

    for (const change of result.changes) {
      await applyRemoteScoutingEntryChange(connection, change);
      pulledCount += 1;
      cursor = Math.max(cursor, change.cursor);
    }

    hasMore = result.hasMore;
  }

  saveSyncCursor(connection.datasetId, cursor);
  return { pulledCount, cursor };
}

async function applyRemoteScoutingEntryChange(
  connection: RemoteSyncConnection,
  change: CanonicalSyncChange<ScoutingEntryBase<Record<string, unknown>>>
): Promise<void> {
  if (change.documentType !== 'match-scouting-entry') {
    return;
  }

  const document = change.document as ScoutingEntrySyncDocument;

  if (!shouldQueueScoutingEntryForConnection(document.payload, connection.scopeKey)) {
    return;
  }

  if (document.updatedByDeviceId === connection.deviceId) {
    return;
  }

  const localEntry = await db.scoutingData.get(document.documentId);

  if (document.tombstone) {
    if (!localEntry || shouldApplyRemoteScoutingEntry(localEntry, document.payload)) {
      await deleteScoutingEntry(document.documentId, { queueRemoteSync: false });
    }
    return;
  }

  if (shouldApplyRemoteScoutingEntry(localEntry, document.payload)) {
    await saveScoutingEntry(document.payload, { queueRemoteSync: false });
  }
}

function createAdapterForConnection(connection: RemoteSyncConnection): RemoteSyncAdapter {
  return createFirebaseRemoteSyncAdapter({
    firebase: connection.firebase,
    firestoreEmulator: connection.firestoreEmulator,
  });
}

function loadSyncCursor(datasetId: string): number {
  const stored = window.localStorage.getItem(getCursorStorageKey(datasetId));
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : 0;
}

function saveSyncCursor(datasetId: string, cursor: number): void {
  window.localStorage.setItem(getCursorStorageKey(datasetId), String(cursor));
}

function getCursorStorageKey(datasetId: string): string {
  return `${CURSOR_STORAGE_PREFIX}.${datasetId}`;
}
