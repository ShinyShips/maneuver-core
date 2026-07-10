const STATUS_STORAGE_PREFIX = 'maneuver.remoteSync.syncedDocuments';

export function isRemoteSyncDocumentKnownSynced(datasetId: string, documentId: string): boolean {
  return loadSyncedDocumentIds(datasetId).has(documentId);
}

export function markRemoteSyncDocumentsSynced(datasetId: string, documentIds: string[]): void {
  const syncedDocumentIds = loadSyncedDocumentIds(datasetId);
  documentIds.forEach(documentId => syncedDocumentIds.add(documentId));
  saveSyncedDocumentIds(datasetId, syncedDocumentIds);
}

export function markRemoteSyncDocumentUnsynced(datasetId: string, documentId: string): void {
  const syncedDocumentIds = loadSyncedDocumentIds(datasetId);
  syncedDocumentIds.delete(documentId);
  saveSyncedDocumentIds(datasetId, syncedDocumentIds);
}

export function forgetRemoteSyncDocuments(datasetId: string, documentIds: string[]): void {
  const syncedDocumentIds = loadSyncedDocumentIds(datasetId);
  documentIds.forEach(documentId => syncedDocumentIds.delete(documentId));
  saveSyncedDocumentIds(datasetId, syncedDocumentIds);
}

function loadSyncedDocumentIds(datasetId: string): Set<string> {
  if (typeof window === 'undefined') {
    return new Set();
  }

  const stored = window.localStorage.getItem(getStatusStorageKey(datasetId));

  if (!stored) {
    return new Set();
  }

  try {
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveSyncedDocumentIds(datasetId: string, documentIds: Set<string>): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getStatusStorageKey(datasetId), JSON.stringify([...documentIds]));
}

function getStatusStorageKey(datasetId: string): string {
  return `${STATUS_STORAGE_PREFIX}.${datasetId}`;
}
