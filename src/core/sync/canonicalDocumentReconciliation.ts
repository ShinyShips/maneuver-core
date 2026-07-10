import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import type { CanonicalSyncDocument } from './types';
import { shouldApplyRemoteScoutingEntry } from './scoutingEntryDocuments';
import {
  reconcileScoutProfile,
  type ScoutProfileSyncPayload,
} from './scoutProfileDocuments';

export type CanonicalSyncDocumentCandidate<TPayload = unknown> = Omit<
  CanonicalSyncDocument<TPayload>,
  'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'
>;

export type CanonicalDocumentReconciliation<TPayload = unknown> =
  | {
      status: 'commit';
      documentCandidate: CanonicalSyncDocumentCandidate<TPayload>;
    }
  | {
      status: 'no-op';
    }
  | {
      status: 'manual-conflict';
      reason: string;
      conflictKey: string;
    };

export class CanonicalDocumentManualConflictError extends Error {
  readonly conflictKey: string;

  constructor(conflictKey: string, message: string) {
    super(message);
    this.name = 'CanonicalDocumentManualConflictError';
    this.conflictKey = conflictKey;
  }
}

export function reconcileCanonicalDocumentCandidate<TPayload = unknown>(
  existingDocument: CanonicalSyncDocument<TPayload> | undefined,
  documentCandidate: CanonicalSyncDocumentCandidate<TPayload>
): CanonicalDocumentReconciliation<TPayload> {
  if (!existingDocument || existingDocument.tombstone || documentCandidate.tombstone) {
    return {
      status: 'commit',
      documentCandidate,
    };
  }

  if (
    existingDocument.documentType === 'match-scouting-entry' &&
    documentCandidate.documentType === 'match-scouting-entry'
  ) {
    return shouldApplyRemoteScoutingEntry(
      existingDocument.payload as ScoutingEntryBase<Record<string, unknown>>,
      documentCandidate.payload as ScoutingEntryBase<Record<string, unknown>>
    )
      ? {
          status: 'commit',
          documentCandidate,
        }
      : {
          status: 'no-op',
        };
  }

  if (
    existingDocument.documentType === 'scout-profile' &&
    documentCandidate.documentType === 'scout-profile'
  ) {
    const reconciliation = reconcileScoutProfile(
      existingDocument.payload as ScoutProfileSyncPayload,
      documentCandidate.payload as ScoutProfileSyncPayload
    );

    if (reconciliation.status === 'manual-conflict') {
      return {
        status: 'manual-conflict',
        reason: reconciliation.conflict.message,
        conflictKey: reconciliation.conflict.key,
      };
    }

    if (reconciliation.status === 'no-op') {
      return {
        status: 'no-op',
      };
    }

    return {
      status: 'commit',
      documentCandidate: {
        ...documentCandidate,
        payload: reconciliation.payload as TPayload,
      },
    };
  }

  return {
    status: 'commit',
    documentCandidate,
  };
}

export function shouldCommitCanonicalDocumentCandidate<TPayload = unknown>(
  existingDocument: CanonicalSyncDocument<TPayload> | undefined,
  documentCandidate: CanonicalSyncDocumentCandidate<TPayload>
): boolean {
  return reconcileCanonicalDocumentCandidate(existingDocument, documentCandidate).status === 'commit';
}
