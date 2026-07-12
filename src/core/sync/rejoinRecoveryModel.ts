import { reconcileCanonicalDocumentCandidate } from './canonicalDocumentReconciliation';
import type {
  CanonicalSyncDocument,
  RejoinRecoveryBatch,
  RejoinRecoveryDocumentCandidate,
  RejoinRecoveryEntry,
  RejoinRecoveryPreviewEntry,
  RejoinRecoveryDecision,
} from './types';

export function previewRejoinRecoveryEntry<TPayload = unknown>(
  existing: CanonicalSyncDocument<TPayload> | undefined,
  entry: RejoinRecoveryEntry<TPayload>
): RejoinRecoveryPreviewEntry<TPayload> {
  const reconciliation = reconcileCanonicalDocumentCandidate(existing, entry.document);
  if (reconciliation.status === 'manual-conflict') {
    return {
      entry,
      previewStatus: 'manual-conflict',
      ...(existing ? { canonicalDocument: existing } : {}),
      conflictKey: reconciliation.conflictKey,
      conflictReason: reconciliation.reason,
    };
  }
  if (reconciliation.status === 'no-op') {
    return {
      entry,
      previewStatus: 'no-change',
      ...(existing ? { canonicalDocument: existing } : {}),
    };
  }
  return {
    entry,
    previewStatus: 'smart-merge',
    ...(existing ? { canonicalDocument: existing } : {}),
    proposedDocument: reconciliation.documentCandidate,
  };
}

export function resolveRejoinRecoveryApproval(
  existing: CanonicalSyncDocument | undefined,
  document: RejoinRecoveryDocumentCandidate,
  resolution: 'smart-merge' | 'use-submitted'
): RejoinRecoveryDocumentCandidate | undefined {
  const reconciliation = reconcileCanonicalDocumentCandidate(existing, document);
  if (reconciliation.status === 'manual-conflict') {
    if (resolution !== 'use-submitted') {
      throw new Error(`Manual resolution required for ${reconciliation.conflictKey}.`);
    }
    return document;
  }
  return reconciliation.status === 'commit' ? reconciliation.documentCandidate : undefined;
}

export function getRejoinRecoveryBatchStatus(
  batch: RejoinRecoveryBatch
): RejoinRecoveryBatch['status'] {
  const pendingCount = batch.entries.filter(entry => entry.status === 'pending').length;
  if (pendingCount === batch.entries.length) return 'pending';
  if (pendingCount > 0) return 'partially-reviewed';
  return 'completed';
}

export function getPendingRejoinRecoveryEntry(
  batch: RejoinRecoveryBatch,
  entryId: string
): RejoinRecoveryEntry {
  const entry = batch.entries.find(candidate => candidate.entryId === entryId);
  if (!entry) throw new Error(`Rejoin recovery entry not found: ${entryId}`);
  if (entry.status !== 'pending') {
    throw new Error(`Rejoin recovery entry is not pending: ${entryId}`);
  }
  return entry;
}

export function planRejoinRecoveryDecision(
  entry: RejoinRecoveryEntry,
  decision: RejoinRecoveryDecision,
  existing: CanonicalSyncDocument | undefined
): {
  nextStatus: 'held' | 'imported';
  documentCandidate?: RejoinRecoveryDocumentCandidate;
} {
  if (decision.action === 'reject') return { nextStatus: 'held' };
  const documentCandidate = resolveRejoinRecoveryApproval(
    existing,
    entry.document,
    decision.resolution
  );
  return {
    nextStatus: 'imported',
    ...(documentCandidate ? { documentCandidate } : {}),
  };
}

export function applyRejoinRecoveryDecision(
  batch: RejoinRecoveryBatch,
  entry: RejoinRecoveryEntry,
  nextStatus: 'held' | 'imported'
): void {
  entry.status = nextStatus;
  batch.status = getRejoinRecoveryBatchStatus(batch);
}

export function reconsiderHeldRejoinRecoveryEntries(
  batch: RejoinRecoveryBatch,
  entryIds: string[]
): void {
  for (const entryId of entryIds) {
    const entry = batch.entries.find(candidate => candidate.entryId === entryId);
    if (!entry || entry.status !== 'held') {
      throw new Error(`Held rejoin recovery entry not found: ${entryId}`);
    }
    entry.status = 'pending';
  }
  batch.status = getRejoinRecoveryBatchStatus(batch);
}
