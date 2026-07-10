import { db, deleteScoutingEntry } from '@/core/db/database';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import {
  loadRemoteSyncConnection,
  saveRemoteSyncConnection,
  type RemoteSyncConnection,
} from './remoteSyncConnection';
import { resetSyncCursor } from './remoteSyncCursor';
import {
  forgetRemoteSyncDocuments,
  isRemoteSyncDocumentKnownSynced,
} from './remoteSyncDocumentStatus';
import {
  enqueueScoutingEntryUpsert,
  loadRemoteSyncQueueForDataset,
  removeRemoteSyncQueueItems,
} from './remoteSyncQueue';
import {
  createEventSyncScope,
  eventSyncScopeIncludes,
  type EventSyncScope,
} from './eventSyncScopeModel';

export { createEventSyncScope, eventSyncScopeIncludes } from './eventSyncScopeModel';
export type { EventSyncScope } from './eventSyncScopeModel';

export interface EventSyncScopeChangeOptions {
  confirmDiscardUnsyncedWrites?: boolean;
  connection?: RemoteSyncConnection;
}

export interface EventSyncScopeChangeResult {
  status: 'applied' | 'confirmation-required';
  previousScope: EventSyncScope;
  nextScope: EventSyncScope;
  prunableRecordCount: number;
  unsyncedWriteCount: number;
  prunedRecordCount: number;
  discardedQueueCount: number;
}

export interface ScopedOnlineExportSelection {
  eventKeys?: string[];
}

export function getEventSyncScope(
  connection: RemoteSyncConnection | null = loadRemoteSyncConnection()
): EventSyncScope {
  return connection?.eventSyncScope ?? createEventSyncScope();
}

export async function updateEventSyncScope(
  eventKeys: readonly string[] | undefined,
  options: EventSyncScopeChangeOptions = {}
): Promise<EventSyncScopeChangeResult> {
  const connection = options.connection ?? loadRemoteSyncConnection();

  if (!connection) {
    throw new Error('Join a Team dataset before editing Event sync scope.');
  }

  const previousScope = connection.eventSyncScope;
  const nextScope = createEventSyncScope(eventKeys);
  const localEntries = (await db.scoutingData.toArray()) as ScoutingEntryBase<
    Record<string, unknown>
  >[];
  const prunableEntries = localEntries.filter(
    entry => !eventSyncScopeIncludes(nextScope, entry.eventKey)
  );
  const queuedItems = loadRemoteSyncQueueForDataset(connection.datasetId);
  const discardedQueueItems = queuedItems.filter(item => {
    const scopeKey = item.document.scopeKey ?? item.document.payload.eventKey;
    return !scopeKey || !eventSyncScopeIncludes(nextScope, scopeKey);
  });
  const unsyncedDocumentIds = new Set(discardedQueueItems.map(item => item.documentId));
  prunableEntries.forEach(entry => {
    if (!isRemoteSyncDocumentKnownSynced(connection.datasetId, entry.id)) {
      unsyncedDocumentIds.add(entry.id);
    }
  });

  const resultBase = {
    previousScope,
    nextScope,
    prunableRecordCount: prunableEntries.length,
    unsyncedWriteCount: unsyncedDocumentIds.size,
  };

  if (unsyncedDocumentIds.size > 0 && !options.confirmDiscardUnsyncedWrites) {
    return {
      status: 'confirmation-required',
      ...resultBase,
      prunedRecordCount: 0,
      discardedQueueCount: 0,
    };
  }

  if (discardedQueueItems.length > 0) {
    removeRemoteSyncQueueItems(discardedQueueItems.map(item => item.id));
  }

  for (const entry of prunableEntries) {
    await deleteScoutingEntry(entry.id, { queueRemoteSync: false });
  }
  forgetRemoteSyncDocuments(
    connection.datasetId,
    prunableEntries.map(entry => entry.id)
  );

  const scopeWasWidened = isScopeWider(previousScope, nextScope);
  saveRemoteSyncConnection({
    ...connection,
    eventSyncScope: nextScope,
  });

  if (scopeWasWidened) {
    resetSyncCursor(connection.datasetId);

    for (const entry of localEntries) {
      if (
        !eventSyncScopeIncludes(previousScope, entry.eventKey) &&
        eventSyncScopeIncludes(nextScope, entry.eventKey)
      ) {
        enqueueScoutingEntryUpsert(entry);
      }
    }
  }

  return {
    status: 'applied',
    ...resultBase,
    prunedRecordCount: prunableEntries.length,
    discardedQueueCount: discardedQueueItems.length,
  };
}

export function getScopedOnlineExportDefault(
  connection: RemoteSyncConnection | null = loadRemoteSyncConnection()
): ScopedOnlineExportSelection {
  const scope = getEventSyncScope(connection);
  return scope.mode === 'all' ? {} : { eventKeys: [...scope.eventKeys] };
}

export function createScopedOnlineExportSelection(
  eventKeys?: readonly string[]
): ScopedOnlineExportSelection {
  const scope = createEventSyncScope(eventKeys);
  return scope.mode === 'all' ? {} : { eventKeys: [...scope.eventKeys] };
}

function isScopeWider(previousScope: EventSyncScope, nextScope: EventSyncScope): boolean {
  if (previousScope.mode === 'all') {
    return false;
  }

  if (nextScope.mode === 'all') {
    return true;
  }

  return nextScope.eventKeys.some(eventKey => !previousScope.eventKeys.includes(eventKey));
}
