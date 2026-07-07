import type {
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CreateCleanupCredentialInput,
  CreateDatasetInput,
  CreateJoinCredentialInput,
  DatasetCleanupCredential,
  DatasetHealth,
  DatasetJoinCredential,
  JoinDatasetInput,
  JoinedDeviceIdentity,
  PullChangesInput,
  PullChangesResult,
  PushDocumentsInput,
  PushDocumentsResult,
  RemoteSyncAdapter,
  RotateJoinCredentialInput,
  TeamDataset,
} from '../types';
import { shouldCommitCanonicalDocumentCandidate } from '../canonicalDocumentReconciliation';

const SYNC_AUTHORITY_DEVICE_ID = 'maneuver-sync-authority';

interface InMemoryDatasetState {
  dataset: TeamDataset;
  currentDocuments: Map<string, CanonicalSyncDocument>;
  changes: CanonicalSyncChange[];
  credentials: Map<string, DatasetJoinCredential | DatasetCleanupCredential>;
  devices: Map<string, JoinedDeviceIdentity>;
  cursor: number;
}

export function createInMemoryRemoteSyncAdapter(): RemoteSyncAdapter {
  return new InMemoryRemoteSyncAdapter();
}

class InMemoryRemoteSyncAdapter implements RemoteSyncAdapter {
  private readonly datasets = new Map<string, InMemoryDatasetState>();

  async createDataset(input: CreateDatasetInput): Promise<TeamDataset> {
    const dataset: TeamDataset = {
      datasetId: crypto.randomUUID(),
      displayName: input.displayName,
      teamNumber: input.teamNumber,
      season: input.season,
      createdAt: Date.now(),
      createdByDeviceId: input.operatorDeviceId,
    };

    this.datasets.set(dataset.datasetId, {
      dataset,
      currentDocuments: new Map(),
      changes: [],
      credentials: new Map(),
      devices: new Map(),
      cursor: 0,
    });

    return dataset;
  }

  async createJoinCredential(input: CreateJoinCredentialInput): Promise<DatasetJoinCredential> {
    const dataset = this.requireDataset(input.datasetId);
    const credential: DatasetJoinCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'join',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
    };

    dataset.credentials.set(credential.credentialId, credential);
    return credential;
  }

  async createCleanupCredential(
    input: CreateCleanupCredentialInput
  ): Promise<DatasetCleanupCredential> {
    const dataset = this.requireDataset(input.datasetId);
    const credential: DatasetCleanupCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'cleanup',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      expiresAt: input.expiresAt,
    };

    dataset.credentials.set(credential.credentialId, credential);
    return credential;
  }

  async rotateJoinCredential(input: RotateJoinCredentialInput): Promise<DatasetJoinCredential> {
    const dataset = this.requireDataset(input.datasetId);
    const previous = dataset.credentials.get(input.previousCredentialId);

    if (!previous || previous.credentialKind !== 'join') {
      throw new Error('Previous join credential not found.');
    }

    dataset.credentials.set(input.previousCredentialId, {
      ...previous,
      revokedAt: Date.now(),
    });

    return this.createJoinCredential(input);
  }

  async joinDataset(input: JoinDatasetInput): Promise<JoinedDeviceIdentity> {
    const dataset = this.requireDataset(input.artifact.datasetId);
    const credential = dataset.credentials.get(input.artifact.credentialId);

    if (!credential || credential.credentialKind !== 'join') {
      throw new Error('Dataset join credential not found.');
    }

    if (credential.revokedAt) {
      throw new Error('Dataset join credential has been revoked.');
    }

    if (credential.expiresAt && credential.expiresAt <= Date.now()) {
      throw new Error('Dataset join credential has expired.');
    }

    if (credential.secret !== input.artifact.credentialSecret) {
      throw new Error('Dataset join credential secret does not match.');
    }

    const identity: JoinedDeviceIdentity = {
      datasetId: input.artifact.datasetId,
      deviceId: input.deviceId,
      displayName: input.deviceDisplayName,
      joinedAt: Date.now(),
    };

    dataset.devices.set(identity.deviceId, identity);
    return identity;
  }

  async pushDocuments<TPayload = unknown>(
    input: PushDocumentsInput<TPayload>
  ): Promise<PushDocumentsResult<TPayload>> {
    const dataset = this.requireDataset(input.datasetId);
    const device = dataset.devices.get(input.deviceId);

    if (!device || device.revokedAt) {
      throw new Error(`Remote sync device is not joined to dataset ${input.datasetId}.`);
    }

    const committed: CanonicalSyncDocument<TPayload>[] = [];

    for (const documentCandidate of input.documents) {
      const documentKey = getDocumentKey(
        documentCandidate.documentType,
        documentCandidate.documentId
      );
      const existing = dataset.currentDocuments.get(documentKey);

      if (
        !shouldCommitCanonicalDocumentCandidate(
          existing as CanonicalSyncDocument<TPayload> | undefined,
          documentCandidate
        )
      ) {
        if (existing) {
          const authoritativeDocument = {
            ...(existing as CanonicalSyncDocument<TPayload>),
            updatedByDeviceId: SYNC_AUTHORITY_DEVICE_ID,
          };

          dataset.cursor += 1;
          dataset.changes.push({
            datasetId: input.datasetId,
            cursor: dataset.cursor,
            documentId: authoritativeDocument.documentId,
            documentType: authoritativeDocument.documentType,
            revision: authoritativeDocument.revision,
            changedAt: Date.now(),
            operation: authoritativeDocument.tombstone ? 'tombstone' : 'upsert',
            document: authoritativeDocument,
          } as CanonicalSyncChange);
          committed.push(authoritativeDocument);
        }

        continue;
      }

      const nextDocument: CanonicalSyncDocument<TPayload> = {
        ...documentCandidate,
        datasetId: input.datasetId,
        revision: (existing?.revision ?? 0) + 1,
        updatedAt: Date.now(),
        updatedByDeviceId: input.deviceId,
      };

      dataset.cursor += 1;
      const change: CanonicalSyncChange<TPayload> = {
        datasetId: input.datasetId,
        cursor: dataset.cursor,
        documentId: nextDocument.documentId,
        documentType: nextDocument.documentType,
        revision: nextDocument.revision,
        changedAt: nextDocument.updatedAt,
        operation: nextDocument.tombstone ? 'tombstone' : 'upsert',
        document: nextDocument,
      };

      dataset.currentDocuments.set(documentKey, nextDocument);
      dataset.changes.push(change as CanonicalSyncChange);
      committed.push(nextDocument);
    }

    return {
      committed,
      cursor: dataset.cursor,
    };
  }

  async pullChanges<TPayload = unknown>(
    input: PullChangesInput
  ): Promise<PullChangesResult<TPayload>> {
    const dataset = this.requireDataset(input.datasetId);
    const pageSize = input.pageSize ?? 100;
    const matchingChanges = dataset.changes.filter(change => change.cursor > input.afterCursor);
    const changes = matchingChanges.slice(0, pageSize) as CanonicalSyncChange<TPayload>[];
    const lastChange = changes.at(-1);

    return {
      changes,
      nextCursor: lastChange?.cursor ?? input.afterCursor,
      hasMore: matchingChanges.length > pageSize,
    };
  }

  async getDatasetHealth(datasetId: string): Promise<DatasetHealth> {
    const dataset = this.requireDataset(datasetId);

    return {
      datasetId,
      documentCount: dataset.currentDocuments.size,
      deviceCount: dataset.devices.size,
      currentCursor: dataset.cursor,
      queueHealth: {
        state: 'idle',
        pendingWrites: 0,
      },
      checkedAt: Date.now(),
    };
  }

  private requireDataset(datasetId: string): InMemoryDatasetState {
    const dataset = this.datasets.get(datasetId);

    if (!dataset) {
      throw new Error(`Remote sync dataset not found: ${datasetId}`);
    }

    return dataset;
  }
}

function getDocumentKey(documentType: string, documentId: string): string {
  return `${documentType}:${documentId}`;
}
