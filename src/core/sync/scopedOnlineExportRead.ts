import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import { createEventSyncScope, eventSyncScopeIncludes } from './eventSyncScopeModel';
import {
  createScopedOnlineExportSelection,
  getScopedOnlineExportDefault,
  type ScopedOnlineExportSelection,
} from './eventSyncScope';
import {
  createJoinDatasetInputFromConnection,
  loadRemoteSyncConnection,
} from './remoteSyncConnection';
import type { RemoteSyncClientAdapter } from './types';
import { disconnectRemoteSyncDeviceIfRevoked } from './remoteSyncRevocation';
import { RemoteSyncDeviceNotJoinedError } from './remoteSyncErrors';

export interface ScopedOnlineScoutingEntriesRead {
  selection: ScopedOnlineExportSelection;
  entries: ScoutingEntryBase<Record<string, unknown>>[];
}

export async function readScopedOnlineScoutingEntries(
  adapter: RemoteSyncClientAdapter,
  requestedEventKeys?: readonly string[]
): Promise<ScopedOnlineScoutingEntriesRead> {
  const connection = loadRemoteSyncConnection();

  if (!connection) {
    throw new Error('Join a Team dataset before reading a scoped online export.');
  }

  const selection = requestedEventKeys
    ? createScopedOnlineExportSelection(requestedEventKeys)
    : getScopedOnlineExportDefault(connection);
  const exportScope = createEventSyncScope(selection.eventKeys);
  const entriesById = new Map<string, ScoutingEntryBase<Record<string, unknown>>>();
  let cursor = 0;
  let hasMore = true;
  let initialJoinAttempted = false;

  while (hasMore) {
    try {
      const result = await adapter.pullChanges<ScoutingEntryBase<Record<string, unknown>>>({
        datasetId: connection.datasetId,
        deviceId: connection.deviceId,
        afterCursor: cursor,
        pageSize: 100,
      });

      for (const change of result.changes) {
        cursor = Math.max(cursor, change.cursor);

        if (
          change.documentType !== 'match-scouting-entry' ||
          !eventSyncScopeIncludes(exportScope, change.document.scopeKey ?? '')
        ) {
          continue;
        }

        if (change.document.tombstone) {
          entriesById.delete(change.documentId);
        } else {
          entriesById.set(change.documentId, change.document.payload);
        }
      }

      hasMore = result.hasMore;
    } catch (error) {
      if (error instanceof RemoteSyncDeviceNotJoinedError && !initialJoinAttempted) {
        initialJoinAttempted = true;
        await adapter.joinDataset(createJoinDatasetInputFromConnection(connection));
        continue;
      }
      disconnectRemoteSyncDeviceIfRevoked(error, connection);
      throw error;
    }
  }

  return {
    selection,
    entries: [...entriesById.values()],
  };
}
