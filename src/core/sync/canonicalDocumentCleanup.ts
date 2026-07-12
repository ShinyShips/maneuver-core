import type {
  CanonicalDocumentTarget,
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CleanupDatasetEventRecord,
  DatasetActorIdentity,
} from './types';
import { createCanonicalDocumentKey } from './canonicalDocumentIdentity';

export interface CanonicalCleanupCandidate {
  target: CanonicalDocumentTarget;
  document?: CanonicalSyncDocument;
}

export interface CreateCanonicalCleanupPlanInput extends DatasetActorIdentity {
  datasetId: string;
  candidates: CanonicalCleanupCandidate[];
  currentCursor: number;
  eventId: string;
  occurredAt: number;
  reason?: string;
}

export interface CanonicalCleanupPlan {
  cleanedDocuments: CanonicalSyncDocument[];
  changes: CanonicalSyncChange[];
  cursor: number;
  event: CleanupDatasetEventRecord;
}

export function createCanonicalCleanupPlan(
  input: CreateCanonicalCleanupPlanInput
): CanonicalCleanupPlan {
  const uniqueCandidates = [
    ...new Map(
      input.candidates.map(candidate => [
        createCanonicalDocumentKey(candidate.target.documentType, candidate.target.documentId),
        candidate,
      ])
    ).values(),
  ];
  const cleanedDocuments: CanonicalSyncDocument[] = [];
  const changes: CanonicalSyncChange[] = [];
  const cleanedTargets: CanonicalDocumentTarget[] = [];
  let cursor = input.currentCursor;

  for (const { target, document } of uniqueCandidates) {
    if (!document || document.tombstone) {
      continue;
    }

    const tombstone: CanonicalSyncDocument = {
      ...document,
      revision: document.revision + 1,
      updatedAt: input.occurredAt,
      updatedByDeviceId: input.actorDeviceId,
      tombstone: true,
    };
    cursor += 1;
    cleanedDocuments.push(tombstone);
    cleanedTargets.push(structuredClone(target));
    changes.push({
      datasetId: input.datasetId,
      cursor,
      documentId: tombstone.documentId,
      documentType: tombstone.documentType,
      revision: tombstone.revision,
      changedAt: tombstone.updatedAt,
      operation: 'tombstone',
      document: tombstone,
    });
  }

  return {
    cleanedDocuments,
    changes,
    cursor,
    event: {
      datasetId: input.datasetId,
      eventId: input.eventId,
      eventType: 'cleanup',
      actorDeviceId: input.actorDeviceId,
      actorDisplayName: input.actorDisplayName,
      occurredAt: input.occurredAt,
      targets: cleanedTargets,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
  };
}
