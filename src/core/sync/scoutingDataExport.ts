import { db } from '@/core/db/database';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import { getScopedOnlineExportDefault } from './eventSyncScope';
import { createRemoteSyncAdapterForConnection } from './remoteSyncAdapterFactory';
import { loadRemoteSyncConnection } from './remoteSyncConnection';
import { loadRemoteSyncQueue } from './remoteSyncQueue';
import { readScopedOnlineScoutingEntries } from './scopedOnlineExportRead';
import type { RemoteSyncClientAdapter } from './types';

const LOCAL_EXPORT_WARNING_STORAGE_KEY = 'maneuver.scoutingExport.localWarningAcknowledged';

export const SCOUTING_EXPORT_SCOPE_LABELS = {
  'device-local': "Current device's local replica",
  'scoped-online': 'Selected events from Team dataset',
  'full-online': 'Full Team dataset',
} as const;

export type ScoutingDataExportRequest =
  | { source: 'device-local' }
  | { source: 'scoped-online'; eventKeys?: readonly string[] }
  | { source: 'full-online' };

export interface ScoutingDataExportOptions {
  adapter?: RemoteSyncClientAdapter;
}

export interface HumanReadableScoutingDataExport {
  formatVersion: 1;
  exportedAt: string;
  scope:
    | {
        kind: 'device-local';
        label: (typeof SCOUTING_EXPORT_SCOPE_LABELS)['device-local'];
        completeForRequestedScope: false;
      }
    | {
        kind: 'scoped-online';
        label: (typeof SCOUTING_EXPORT_SCOPE_LABELS)['scoped-online'];
        completeForRequestedScope: true;
        eventKeys: string[];
        allEvents: boolean;
      }
    | {
        kind: 'full-online';
        label: (typeof SCOUTING_EXPORT_SCOPE_LABELS)['full-online'];
        completeForRequestedScope: true;
      };
  warnings: {
    incompleteLocalReplica: boolean;
    unsyncedLocalChanges: number;
  };
  entries: ScoutingEntryBase<Record<string, unknown>>[];
}

export async function createScoutingDataExport(
  request: ScoutingDataExportRequest,
  options: ScoutingDataExportOptions = {}
): Promise<HumanReadableScoutingDataExport> {
  if (request.source !== 'device-local') {
    const connection = loadRemoteSyncConnection();

    if (!connection) {
      const exportKind =
        request.source === 'scoped-online' ? 'Scoped online export' : 'Online dataset export';
      throw new Error(`Join a Team dataset before starting ${exportKind}.`);
    }

    const scopedEventKeys =
      request.source === 'scoped-online'
        ? (request.eventKeys ?? getScopedOnlineExportDefault(connection).eventKeys)
        : undefined;

    const adapter = options.adapter ?? createRemoteSyncAdapterForConnection(connection);
    const requestedEventKeys = request.source === 'full-online' ? [] : scopedEventKeys;
    const remoteRead = await readScopedOnlineScoutingEntries(adapter, requestedEventKeys);

    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      scope:
        request.source === 'full-online'
          ? {
              kind: 'full-online',
              label: SCOUTING_EXPORT_SCOPE_LABELS['full-online'],
              completeForRequestedScope: true,
            }
          : {
              kind: 'scoped-online',
              label: SCOUTING_EXPORT_SCOPE_LABELS['scoped-online'],
              completeForRequestedScope: true,
              eventKeys: remoteRead.selection.eventKeys ?? [],
              allEvents: remoteRead.selection.eventKeys === undefined,
            },
      warnings: {
        incompleteLocalReplica: false,
        unsyncedLocalChanges: 0,
      },
      entries: remoteRead.entries,
    };
  }

  const entries = (await db.scoutingData.toArray()) as ScoutingEntryBase<Record<string, unknown>>[];

  return {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    scope: {
      kind: request.source,
      label: SCOUTING_EXPORT_SCOPE_LABELS['device-local'],
      completeForRequestedScope: false,
    },
    warnings: {
      incompleteLocalReplica: true,
      unsyncedLocalChanges: loadRemoteSyncQueue().length,
    },
    entries,
  };
}

export function isLocalScoutingExportWarningAcknowledged(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.localStorage.getItem(LOCAL_EXPORT_WARNING_STORAGE_KEY) === 'true'
  );
}

export function acknowledgeLocalScoutingExportWarning(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCAL_EXPORT_WARNING_STORAGE_KEY, 'true');
  }
}
