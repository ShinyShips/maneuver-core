import { createCanonicalDocumentIdentity } from './canonicalDocumentIdentity';
import { loadRemoteSyncConnection } from './remoteSyncConnection';
import { markRemoteSyncDocumentUnsynced } from './remoteSyncDocumentStatus';
import { excludeRemoteSyncItemsForDevice } from './remoteSyncQueueFilter';

const SCOUT_PROFILE_QUEUE_STORAGE_KEY = 'maneuver.remoteSync.scoutProfileQueue';

export interface ScoutProfileQueueItem {
  id: string;
  datasetId: string;
  deviceId: string;
  documentId: string;
  scoutName: string;
  queuedAt: number;
  attempts: number;
}

export function enqueueScoutProfileUpsert(scoutName: string): void {
  const connection = loadRemoteSyncConnection();

  if (!connection) {
    return;
  }

  const identity = createCanonicalDocumentIdentity({
    documentType: 'scout-profile',
    scoutName,
  });
  const queue = loadScoutProfileQueue().filter(
    item => item.datasetId !== connection.datasetId || item.documentId !== identity.documentId
  );

  queue.push({
    id: `${connection.datasetId}:scout-profile:${identity.documentId}`,
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
    documentId: identity.documentId,
    scoutName: scoutName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    queuedAt: Date.now(),
    attempts: 0,
  });

  markRemoteSyncDocumentUnsynced(
    connection.datasetId,
    `scout-profile:${identity.documentId}`
  );
  saveScoutProfileQueue(queue);
}

export function loadScoutProfileQueue(): ScoutProfileQueueItem[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = window.localStorage.getItem(SCOUT_PROFILE_QUEUE_STORAGE_KEY);

  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isScoutProfileQueueItem) : [];
  } catch {
    return [];
  }
}

export function loadScoutProfileQueueForDataset(datasetId: string): ScoutProfileQueueItem[] {
  return loadScoutProfileQueue().filter(item => item.datasetId === datasetId);
}

export function markScoutProfileQueueItemsAttempted(itemIds: string[]): void {
  const ids = new Set(itemIds);
  saveScoutProfileQueue(
    loadScoutProfileQueue().map(item =>
      ids.has(item.id) ? { ...item, attempts: item.attempts + 1 } : item
    )
  );
}

export function removeScoutProfileQueueItems(itemIds: string[]): void {
  const ids = new Set(itemIds);
  saveScoutProfileQueue(loadScoutProfileQueue().filter(item => !ids.has(item.id)));
}

export function discardScoutProfileQueueForDevice(datasetId: string, deviceId: string): void {
  saveScoutProfileQueue(
    excludeRemoteSyncItemsForDevice(loadScoutProfileQueue(), datasetId, deviceId)
  );
}

function saveScoutProfileQueue(queue: ScoutProfileQueueItem[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(SCOUT_PROFILE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('remoteSyncQueueChanged'));
}

function isScoutProfileQueueItem(value: unknown): value is ScoutProfileQueueItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.datasetId === 'string' &&
    typeof value.deviceId === 'string' &&
    typeof value.documentId === 'string' &&
    typeof value.scoutName === 'string' &&
    typeof value.queuedAt === 'number' &&
    typeof value.attempts === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
