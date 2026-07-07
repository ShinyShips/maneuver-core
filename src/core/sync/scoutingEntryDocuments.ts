import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import type { CanonicalSyncDocument } from './types';

export type ScoutingEntrySyncDocument = CanonicalSyncDocument<
  ScoutingEntryBase<Record<string, unknown>>
>;

export function createScoutingEntrySyncDocumentCandidate(
  entry: ScoutingEntryBase<Record<string, unknown>>
): Omit<ScoutingEntrySyncDocument, 'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'> {
  return {
    documentId: entry.id,
    documentType: 'match-scouting-entry',
    scopeKey: normalizeScopeKey(entry.eventKey),
    tombstone: false,
    payload: normalizeScoutingEntryPayload(entry),
  };
}

export function createScoutingEntryTombstoneDocumentCandidate(
  entry: ScoutingEntryBase<Record<string, unknown>>
): Omit<ScoutingEntrySyncDocument, 'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'> {
  return {
    documentId: entry.id,
    documentType: 'match-scouting-entry',
    scopeKey: normalizeScopeKey(entry.eventKey),
    tombstone: true,
    payload: normalizeScoutingEntryPayload(entry),
  };
}

export function shouldQueueScoutingEntryForConnection(
  entry: ScoutingEntryBase<Record<string, unknown>>,
  connectionScopeKey?: string
): boolean {
  return (
    !connectionScopeKey ||
    normalizeScopeKey(entry.eventKey) === normalizeScopeKey(connectionScopeKey)
  );
}

export function shouldApplyRemoteScoutingEntry(
  localEntry: ScoutingEntryBase<Record<string, unknown>> | undefined,
  remoteEntry: ScoutingEntryBase<Record<string, unknown>>
): boolean {
  if (!localEntry) {
    return true;
  }

  const localCorrectionTime = localEntry.lastCorrectedAt ?? 0;
  const remoteCorrectionTime = remoteEntry.lastCorrectedAt ?? 0;

  if (remoteCorrectionTime !== localCorrectionTime) {
    return remoteCorrectionTime > localCorrectionTime;
  }

  const localCorrectionCount = localEntry.correctionCount ?? 0;
  const remoteCorrectionCount = remoteEntry.correctionCount ?? 0;

  if (remoteCorrectionCount !== localCorrectionCount) {
    return remoteCorrectionCount > localCorrectionCount;
  }

  return remoteEntry.timestamp >= localEntry.timestamp;
}

function normalizeScoutingEntryPayload(
  entry: ScoutingEntryBase<Record<string, unknown>>
): ScoutingEntryBase<Record<string, unknown>> {
  return {
    ...entry,
    eventKey: normalizeScopeKey(entry.eventKey),
  };
}

function normalizeScopeKey(scopeKey: string): string {
  return scopeKey.trim().toLowerCase();
}
