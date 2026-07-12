import { db } from '@/core/db/database';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import { createCanonicalDocumentKey } from './canonicalDocumentIdentity';
import { createRemoteSyncAdapterForConnection } from './remoteSyncAdapterFactory';
import { loadRemoteSyncConnection, type RemoteSyncConnection } from './remoteSyncConnection';
import { loadRemoteSyncQueueForDataset } from './remoteSyncQueue';
import { createScoutingEntrySyncDocumentCandidate } from './scoutingEntryDocuments';
import { createScoutProfileSyncDocumentCandidate } from './scoutProfileDocuments';
import { loadScoutProfileQueueForDataset } from './scoutProfileQueue';
import { loadAllScoutProfileSyncPayloads } from '@/core/sync/scoutProfileStore';
import type {
  RejoinRecoveryBatch,
  RejoinRecoveryDocumentCandidate,
  RemoteSyncClientAdapter,
} from './types';

const REJOIN_RECOVERY_CONTEXT_KEY = 'maneuver.remoteSync.rejoinRecoveryContext';

export interface RevokedDeviceRecoveryContext {
  datasetId: string;
  revokedDeviceId: string;
  detectedAt: number;
  queuedDocuments: RejoinRecoveryDocumentCandidate[];
  queuedScoutNames: string[];
}

export interface PreparedPostRejoinRecoveryBatch {
  datasetId: string;
  revokedDeviceId: string;
  documents: RejoinRecoveryDocumentCandidate[];
}

export function captureRejoinRecoveryContext(connection: RemoteSyncConnection): void {
  if (typeof window === 'undefined') return;

  const existing = loadRejoinRecoveryContext();
  const sameRevocation =
    existing?.datasetId === connection.datasetId &&
    existing.revokedDeviceId === connection.deviceId;
  const queuedDocuments = new Map<string, RejoinRecoveryDocumentCandidate>();
  for (const document of sameRevocation ? existing.queuedDocuments : []) {
    queuedDocuments.set(
      createCanonicalDocumentKey(document.documentType, document.documentId),
      document
    );
  }
  for (const document of loadRemoteSyncQueueForDataset(connection.datasetId)
    .filter(item => item.deviceId === connection.deviceId)
    .map(item => item.document)) {
    queuedDocuments.set(
      createCanonicalDocumentKey(document.documentType, document.documentId),
      document
    );
  }
  const queuedScoutNames = new Set(sameRevocation ? existing.queuedScoutNames : []);
  for (const scoutName of loadScoutProfileQueueForDataset(connection.datasetId)
    .filter(item => item.deviceId === connection.deviceId)
    .map(item => item.scoutName)) {
    queuedScoutNames.add(scoutName);
  }
  const context: RevokedDeviceRecoveryContext = {
    datasetId: connection.datasetId,
    revokedDeviceId: connection.deviceId,
    detectedAt: sameRevocation ? existing.detectedAt : Date.now(),
    queuedDocuments: [...queuedDocuments.values()],
    queuedScoutNames: [...queuedScoutNames],
  };
  window.localStorage.setItem(REJOIN_RECOVERY_CONTEXT_KEY, JSON.stringify(context));
  window.dispatchEvent(new CustomEvent('remoteSyncRejoinRecoveryChanged'));
}

export function loadRejoinRecoveryContext(): RevokedDeviceRecoveryContext | null {
  if (typeof window === 'undefined') return null;
  const stored = window.localStorage.getItem(REJOIN_RECOVERY_CONTEXT_KEY);
  if (!stored) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return isRevokedDeviceRecoveryContext(value) ? value : null;
  } catch {
    return null;
  }
}

export async function preparePostRejoinRecoveryBatch(): Promise<PreparedPostRejoinRecoveryBatch> {
  const connection = loadRemoteSyncConnection();
  const context = loadRejoinRecoveryContext();
  if (!connection || !context || connection.datasetId !== context.datasetId) {
    throw new Error('Rejoin the formerly connected Team dataset before preparing local recovery.');
  }
  if (connection.deviceId === context.revokedDeviceId) {
    throw new Error('Rejoin recovery requires a new joined device identity.');
  }

  const documents = new Map<string, RejoinRecoveryDocumentCandidate>();
  for (const document of context.queuedDocuments) {
    documents.set(createCanonicalDocumentKey(document.documentType, document.documentId), document);
  }

  const localEntries = (await db.scoutingData.toArray()) as ScoutingEntryBase<
    Record<string, unknown>
  >[];
  for (const entry of localEntries) {
    if (Math.max(entry.timestamp, entry.lastCorrectedAt ?? 0) < context.detectedAt) continue;
    const document = createScoutingEntrySyncDocumentCandidate(entry);
    documents.set(createCanonicalDocumentKey(document.documentType, document.documentId), document);
  }

  const queuedScoutNames = new Set(
    context.queuedScoutNames.map(name => name.normalize('NFKC').trim().toLowerCase())
  );
  for (const payload of await loadAllScoutProfileSyncPayloads()) {
    const wasQueued = queuedScoutNames.has(
      payload.scout.name.normalize('NFKC').trim().toLowerCase()
    );
    if (!wasQueued && payload.scout.lastUpdated < context.detectedAt) continue;
    const document = createScoutProfileSyncDocumentCandidate(payload);
    documents.set(createCanonicalDocumentKey(document.documentType, document.documentId), document);
  }

  return {
    datasetId: context.datasetId,
    revokedDeviceId: context.revokedDeviceId,
    documents: [...documents.values()],
  };
}

export async function submitPostRejoinRecoveryBatch(
  adapterOverride?: RemoteSyncClientAdapter
): Promise<RejoinRecoveryBatch> {
  const connection = loadRemoteSyncConnection();
  if (!connection) throw new Error('Rejoin a Team dataset before submitting local recovery.');
  const prepared = await preparePostRejoinRecoveryBatch();
  const adapter = adapterOverride ?? createRemoteSyncAdapterForConnection(connection);
  const batch = await adapter.submitRejoinRecoveryBatch({
    datasetId: connection.datasetId,
    deviceId: connection.deviceId,
    revokedDeviceId: prepared.revokedDeviceId,
    documents: prepared.documents,
  });
  window.localStorage.removeItem(REJOIN_RECOVERY_CONTEXT_KEY);
  window.dispatchEvent(new CustomEvent('remoteSyncRejoinRecoveryChanged'));
  return batch;
}

function isRevokedDeviceRecoveryContext(value: unknown): value is RevokedDeviceRecoveryContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as RevokedDeviceRecoveryContext).datasetId === 'string' &&
    typeof (value as RevokedDeviceRecoveryContext).revokedDeviceId === 'string' &&
    typeof (value as RevokedDeviceRecoveryContext).detectedAt === 'number' &&
    Array.isArray((value as RevokedDeviceRecoveryContext).queuedDocuments) &&
    Array.isArray((value as RevokedDeviceRecoveryContext).queuedScoutNames)
  );
}
