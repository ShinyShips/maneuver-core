const CURSOR_STORAGE_PREFIX = 'maneuver.remoteSync.cursor';

export function loadSyncCursor(datasetId: string): number {
  const stored = window.localStorage.getItem(getCursorStorageKey(datasetId));
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function saveSyncCursor(datasetId: string, cursor: number): void {
  window.localStorage.setItem(getCursorStorageKey(datasetId), String(cursor));
}

export function resetSyncCursor(datasetId: string): void {
  window.localStorage.removeItem(getCursorStorageKey(datasetId));
}

function getCursorStorageKey(datasetId: string): string {
  return `${CURSOR_STORAGE_PREFIX}.${datasetId}`;
}
