import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import {
  createScoutingEntrySyncDocumentCandidate,
  createScoutingEntryTombstoneDocumentCandidate,
  shouldQueueScoutingEntryForConnection,
  type ScoutingEntrySyncDocument,
} from './scoutingEntryDocuments';
import { loadRemoteSyncConnection } from './remoteSyncConnection';
import type { QueueHealth } from './types';

const QUEUE_STORAGE_KEY = 'maneuver.remoteSync.scoutingQueue';
const HEALTH_STORAGE_KEY = 'maneuver.remoteSync.queueHealth';

export type RemoteSyncQueueOperation = 'upsert' | 'tombstone';

export interface RemoteSyncQueueItem {
  id: string;
  datasetId: string;
  deviceId: string;
  documentId: string;
  operation: RemoteSyncQueueOperation;
  queuedAt: number;
  attempts: number;
  document: Omit<
    ScoutingEntrySyncDocument,
    'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'
  >;
}

export function enqueueScoutingEntryUpsert(
  entry: ScoutingEntryBase<Record<string, unknown>>
): void {
  const connection = loadRemoteSyncConnection();

  if (!connection || !shouldQueueScoutingEntryForConnection(entry, connection.scopeKey)) {
    return;
  }

  upsertQueueItem({
    id: createQueueItemId(connection.datasetId, entry.id, 'upsert'),
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
    documentId: entry.id,
    operation: 'upsert',
    queuedAt: Date.now(),
    attempts: 0,
    document: createScoutingEntrySyncDocumentCandidate(entry),
  });
}

export function enqueueScoutingEntryTombstone(
  entry: ScoutingEntryBase<Record<string, unknown>>
): void {
  const connection = loadRemoteSyncConnection();

  if (!connection || !shouldQueueScoutingEntryForConnection(entry, connection.scopeKey)) {
    return;
  }

  upsertQueueItem({
    id: createQueueItemId(connection.datasetId, entry.id, 'tombstone'),
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
    documentId: entry.id,
    operation: 'tombstone',
    queuedAt: Date.now(),
    attempts: 0,
    document: createScoutingEntryTombstoneDocumentCandidate(entry),
  });
}

export function loadRemoteSyncQueue(): RemoteSyncQueueItem[] {
  return readJsonArray<RemoteSyncQueueItem>(QUEUE_STORAGE_KEY).filter(isRemoteSyncQueueItem);
}

export function loadRemoteSyncQueueForDataset(datasetId: string): RemoteSyncQueueItem[] {
  return loadRemoteSyncQueue().filter(item => item.datasetId === datasetId);
}

export function removeRemoteSyncQueueItems(itemIds: string[]): void {
  const itemIdSet = new Set(itemIds);
  saveRemoteSyncQueue(loadRemoteSyncQueue().filter(item => !itemIdSet.has(item.id)));
}

export function markRemoteSyncQueueItemsAttempted(itemIds: string[]): void {
  const itemIdSet = new Set(itemIds);
  saveRemoteSyncQueue(
    loadRemoteSyncQueue().map(item =>
      itemIdSet.has(item.id) ? { ...item, attempts: item.attempts + 1 } : item
    )
  );
}

export function getRemoteSyncQueueHealth(): QueueHealth {
  const stored = readJsonObject<QueueHealth>(HEALTH_STORAGE_KEY);
  const pendingWrites = loadRemoteSyncQueue().length;

  if (stored) {
    const state =
      pendingWrites > 0 && stored.state === 'idle'
        ? 'offline'
        : pendingWrites === 0 && stored.state === 'healthy'
          ? 'idle'
          : stored.state;

    return {
      ...stored,
      pendingWrites,
      state,
    };
  }

  return {
    state: pendingWrites > 0 ? 'offline' : 'idle',
    pendingWrites,
  };
}

export function setRemoteSyncQueueHealth(health: QueueHealth): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(HEALTH_STORAGE_KEY, JSON.stringify(health));
  window.dispatchEvent(new CustomEvent('remoteSyncQueueChanged'));
}

function upsertQueueItem(nextItem: RemoteSyncQueueItem): void {
  const queue = loadRemoteSyncQueue();
  const nextQueue = queue.filter(
    item => item.datasetId !== nextItem.datasetId || item.documentId !== nextItem.documentId
  );
  nextQueue.push(nextItem);
  saveRemoteSyncQueue(nextQueue);
  setRemoteSyncQueueHealth({
    ...getRemoteSyncQueueHealth(),
    state: 'offline',
    pendingWrites: nextQueue.length,
  });
}

function saveRemoteSyncQueue(queue: RemoteSyncQueueItem[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent('remoteSyncQueueChanged'));
}

function createQueueItemId(
  datasetId: string,
  documentId: string,
  operation: RemoteSyncQueueOperation
): string {
  return `${datasetId}:${documentId}:${operation}`;
}

function isRemoteSyncQueueItem(value: unknown): value is RemoteSyncQueueItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.datasetId === 'string' &&
    typeof value.deviceId === 'string' &&
    typeof value.documentId === 'string' &&
    (value.operation === 'upsert' || value.operation === 'tombstone') &&
    typeof value.queuedAt === 'number' &&
    typeof value.attempts === 'number' &&
    isRecord(value.document)
  );
}

function readJsonArray<T>(storageKey: string): T[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function readJsonObject<T>(storageKey: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
