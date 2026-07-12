import type {
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CreatePortableDatasetSnapshotServerLocalInput,
  DatasetActorIdentity,
  PortableDatasetSnapshot,
  RestoreDatasetEventRecord,
  RestorePortableDatasetSnapshotServerLocalInput,
  ServerLocalRestoreResult,
} from './types';
import { createCanonicalDocumentKey } from './canonicalDocumentIdentity';

export interface PortableDatasetRestorePlan {
  restoredDocuments: CanonicalSyncDocument[];
  changes: CanonicalSyncChange[];
  cursor: number;
  event: RestoreDatasetEventRecord;
}

export class ServerLocalRestoreFailedError extends Error {
  readonly safetySnapshotId: string;

  constructor(safetySnapshotId: string, cause: unknown) {
    super(`Server-local restore failed after safety snapshot ${safetySnapshotId} was created.`);
    this.name = 'ServerLocalRestoreFailedError';
    this.safetySnapshotId = safetySnapshotId;
    (this as Error & { cause?: unknown }).cause = cause;
  }
}

type RestoreConfirmationRequired = Extract<
  ServerLocalRestoreResult,
  { status: 'confirmation-required' }
>;
type EmergencyOverrideRequired = Extract<
  ServerLocalRestoreResult,
  { status: 'emergency-override-required' }
>;

export class ServerLocalRestorePolicy {
  private readonly overrideChallenges = new Map<string, string>();

  requireConfirmation(
    input: RestorePortableDatasetSnapshotServerLocalInput,
    requiredDatasetName: string
  ): RestoreConfirmationRequired | undefined {
    return input.warningAccepted && input.typedDatasetName === requiredDatasetName
      ? undefined
      : { status: 'confirmation-required', requiredDatasetName };
  }

  createSafetySnapshotInput(
    input: RestorePortableDatasetSnapshotServerLocalInput
  ): CreatePortableDatasetSnapshotServerLocalInput {
    return {
      datasetId: input.datasetId,
      actorDeviceId: input.actorDeviceId,
      actorDisplayName: input.actorDisplayName,
      snapshotLabel: `Pre-restore safety snapshot for ${input.snapshot.snapshotLabel}`,
    };
  }

  handleSafetySnapshotFailure(
    input: RestorePortableDatasetSnapshotServerLocalInput,
    error: unknown
  ): EmergencyOverrideRequired | undefined {
    const challengeKey = this.getChallengeKey(input);
    const existingChallenge = this.overrideChallenges.get(challengeKey);
    if (input.emergencyOverrideToken && input.emergencyOverrideToken === existingChallenge) {
      return undefined;
    }
    const emergencyOverrideToken = crypto.randomUUID();
    this.overrideChallenges.set(challengeKey, emergencyOverrideToken);
    return {
      status: 'emergency-override-required',
      safetySnapshotError:
        error instanceof Error ? error.message : 'Pre-restore safety snapshot failed.',
      emergencyOverrideToken,
    };
  }

  complete(input: RestorePortableDatasetSnapshotServerLocalInput): void {
    this.overrideChallenges.delete(this.getChallengeKey(input));
  }

  private getChallengeKey(input: RestorePortableDatasetSnapshotServerLocalInput): string {
    return `${input.datasetId}:${input.snapshot.snapshotId}`;
  }
}

export function assertPortableDatasetSnapshotMatchesDataset(
  snapshot: PortableDatasetSnapshot,
  datasetId: string
): void {
  const documentKeys = new Set<string>();
  const hasInvalidDocument = snapshot.documents.some(document => {
    const key = createCanonicalDocumentKey(document.documentType, document.documentId);
    const duplicate = documentKeys.has(key);
    documentKeys.add(key);
    return document.datasetId !== datasetId || duplicate;
  });
  if (
    snapshot.protocolVersion !== 1 ||
    snapshot.dataset.datasetId !== datasetId ||
    hasInvalidDocument
  ) {
    throw new Error('Portable dataset snapshot does not match the target Team dataset.');
  }
}

export function createPortableDatasetRestorePlan(
  input: DatasetActorIdentity & {
    datasetId: string;
    snapshot: PortableDatasetSnapshot;
    currentDocuments: CanonicalSyncDocument[];
    currentCursor: number;
    occurredAt: number;
    eventId: string;
    reason?: string;
  }
): PortableDatasetRestorePlan {
  assertPortableDatasetSnapshotMatchesDataset(input.snapshot, input.datasetId);
  const currentDocuments = new Map(
    input.currentDocuments.map(document => [
      createCanonicalDocumentKey(document.documentType, document.documentId),
      document,
    ])
  );
  const desiredDocuments = new Map(
    input.snapshot.documents.map(document => [
      createCanonicalDocumentKey(document.documentType, document.documentId),
      document,
    ])
  );
  const documentKeys = [
    ...new Set([...currentDocuments.keys(), ...desiredDocuments.keys()]),
  ].sort();
  const restoredDocuments: CanonicalSyncDocument[] = [];
  const changes: CanonicalSyncChange[] = [];
  let cursor = input.currentCursor;

  for (const documentKey of documentKeys) {
    const current = currentDocuments.get(documentKey);
    const desired = desiredDocuments.get(documentKey);
    const source = desired ?? current;
    if (!source) {
      continue;
    }
    const document: CanonicalSyncDocument = {
      ...structuredClone(source),
      datasetId: input.datasetId,
      revision: (current?.revision ?? 0) + 1,
      updatedAt: input.occurredAt,
      updatedByDeviceId: input.actorDeviceId,
      tombstone: desired?.tombstone ?? true,
    };
    cursor += 1;
    restoredDocuments.push(document);
    changes.push({
      datasetId: input.datasetId,
      cursor,
      documentId: document.documentId,
      documentType: document.documentType,
      revision: document.revision,
      changedAt: input.occurredAt,
      operation: document.tombstone ? 'tombstone' : 'upsert',
      document,
    });
  }

  return {
    restoredDocuments,
    changes,
    cursor,
    event: {
      datasetId: input.datasetId,
      eventId: input.eventId,
      eventType: 'restore',
      actorDeviceId: input.actorDeviceId,
      actorDisplayName: input.actorDisplayName,
      occurredAt: input.occurredAt,
      snapshotId: input.snapshot.snapshotId,
      snapshotLabel: input.snapshot.snapshotLabel,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
  };
}
