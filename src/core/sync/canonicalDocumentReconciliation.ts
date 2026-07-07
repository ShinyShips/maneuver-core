import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import type { CanonicalSyncDocument } from './types';
import { shouldApplyRemoteScoutingEntry } from './scoutingEntryDocuments';

export type CanonicalSyncDocumentCandidate<TPayload = unknown> = Omit<
  CanonicalSyncDocument<TPayload>,
  'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'
>;

export function shouldCommitCanonicalDocumentCandidate<TPayload = unknown>(
  existingDocument: CanonicalSyncDocument<TPayload> | undefined,
  documentCandidate: CanonicalSyncDocumentCandidate<TPayload>
): boolean {
  if (!existingDocument) {
    return true;
  }

  if (
    existingDocument.documentType === 'match-scouting-entry' &&
    documentCandidate.documentType === 'match-scouting-entry'
  ) {
    return shouldApplyRemoteScoutingEntry(
      existingDocument.payload as ScoutingEntryBase<Record<string, unknown>>,
      documentCandidate.payload as ScoutingEntryBase<Record<string, unknown>>
    );
  }

  return true;
}
