import type {
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CleanupAuthorityGrant,
  CleanupCanonicalDocumentsInput,
  CleanupCanonicalDocumentsResult,
  CleanupDatasetEventRecord,
  CreateCleanupCredentialInput,
  CreateDatasetInput,
  CreateJoinCredentialInput,
  DatasetCleanupCredential,
  DeprovisionCleanupAuthorityInput,
  DatasetHealth,
  DatasetEventRecord,
  GetJoinedDatasetOverviewInput,
  JoinedDatasetOverview,
  DatasetJoinCredential,
  JoinDatasetInput,
  JoinedDeviceIdentity,
  PullChangesInput,
  PullChangesResult,
  ProvisionCleanupAuthorityInput,
  PushDocumentsInput,
  PushDocumentsResult,
  RemoteSyncAdapter,
  RotateJoinCredentialInput,
  ServerLocalCleanupCanonicalDocumentsInput,
  SharedRestoreEvent,
  TeamDataset,
} from '../types';
import {
  CanonicalDocumentManualConflictError,
  reconcileCanonicalDocumentCandidate,
} from '../canonicalDocumentReconciliation';
import { createCanonicalCleanupPlan } from '../canonicalDocumentCleanup';
import {
  createSharedRestoreEvent,
  selectCleanupCapableDevices,
  selectRecentCleanupEvents,
  selectRecentRestoreEvents,
  type CleanupCapabilityProjection,
} from '../datasetOverview';

const SYNC_AUTHORITY_DEVICE_ID = 'maneuver-sync-authority';

interface InMemoryDatasetState {
  dataset: TeamDataset;
  currentDocuments: Map<string, CanonicalSyncDocument>;
  changes: CanonicalSyncChange[];
  credentials: Map<string, InMemoryStoredCredential>;
  devices: Map<string, JoinedDeviceIdentity>;
  events: DatasetEventRecord[];
  cleanupCapabilities: Map<string, CleanupCapabilityProjection>;
  sharedRestoreEvents: SharedRestoreEvent[];
  sharedCleanupEvents: CleanupDatasetEventRecord[];
  cursor: number;
}

type InMemoryStoredCredential = (DatasetJoinCredential | DatasetCleanupCredential) & {
  createdByDeviceId: string;
};

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
      events: [],
      cleanupCapabilities: new Map(),
      sharedRestoreEvents: [],
      sharedCleanupEvents: [],
      cursor: 0,
    });

    return dataset;
  }

  async createJoinCredential(input: CreateJoinCredentialInput): Promise<DatasetJoinCredential> {
    const dataset = this.requireDataset(input.datasetId);
    const credential: InMemoryStoredCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'join',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      createdByDeviceId: input.operatorDeviceId,
      expiresAt: input.expiresAt,
    };

    dataset.credentials.set(credential.credentialId, credential);
    return credential;
  }

  async createCleanupCredential(
    input: CreateCleanupCredentialInput
  ): Promise<DatasetCleanupCredential> {
    const dataset = this.requireDataset(input.datasetId);
    const credential: InMemoryStoredCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'cleanup',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      createdByDeviceId: input.operatorDeviceId,
      expiresAt: input.expiresAt,
    };

    dataset.credentials.set(credential.credentialId, credential);
    return credential;
  }

  async provisionCleanupAuthority(
    input: ProvisionCleanupAuthorityInput
  ): Promise<CleanupAuthorityGrant> {
    const dataset = this.requireDataset(input.datasetId);
    const device = dataset.devices.get(input.deviceId);

    if (!device || device.revokedAt) {
      throw new Error(`Remote sync device is not joined to dataset ${input.datasetId}.`);
    }

    const credential = dataset.credentials.get(input.credentialId);

    if (!credential || credential.credentialKind !== 'cleanup') {
      throw new Error('Cleanup credential not found.');
    }
    if (credential.revokedAt) {
      throw new Error('Cleanup credential has been revoked.');
    }
    if (credential.expiresAt && credential.expiresAt <= Date.now()) {
      throw new Error('Cleanup credential has expired.');
    }
    if (credential.secret !== input.credentialSecret) {
      throw new Error('Cleanup credential secret does not match.');
    }

    const grant: CleanupAuthorityGrant = {
      datasetId: input.datasetId,
      deviceId: input.deviceId,
      credentialId: input.credentialId,
      provisionedAt: Date.now(),
      expiresAt: credential.expiresAt,
    };
    dataset.cleanupCapabilities.set(input.credentialId, {
      deviceId: input.deviceId,
      expiresAt: credential.expiresAt,
    });
    return grant;
  }

  async deprovisionCleanupAuthority(
    input: DeprovisionCleanupAuthorityInput
  ): Promise<void> {
    const dataset = this.requireDataset(input.datasetId);
    for (const [credentialId, capability] of dataset.cleanupCapabilities) {
      if (capability.deviceId === input.deviceId) {
        dataset.cleanupCapabilities.delete(credentialId);
      }
    }
  }

  async cleanupCanonicalDocuments(
    input: CleanupCanonicalDocumentsInput
  ): Promise<CleanupCanonicalDocumentsResult> {
    const dataset = this.requireDataset(input.datasetId);
    const device = dataset.devices.get(input.deviceId);
    const hasCleanupAuthority = [...dataset.cleanupCapabilities.values()].some(
      capability =>
        capability.deviceId === input.deviceId &&
        !capability.revokedAt &&
        (!capability.expiresAt || capability.expiresAt > Date.now())
    );
    if (!device || device.revokedAt || !hasCleanupAuthority) {
      throw new Error(`Remote sync device ${input.deviceId} does not have cleanup authority.`);
    }

    return this.commitCleanup(
      dataset,
      input.datasetId,
      input.targets,
      input.reason,
      device.deviceId,
      device.displayName
    );
  }

  async cleanupCanonicalDocumentsServerLocal(
    input: ServerLocalCleanupCanonicalDocumentsInput
  ): Promise<CleanupCanonicalDocumentsResult> {
    return this.commitCleanup(
      this.requireDataset(input.datasetId),
      input.datasetId,
      input.targets,
      input.reason,
      input.actorDeviceId,
      input.actorDisplayName
    );
  }

  private commitCleanup(
    dataset: InMemoryDatasetState,
    datasetId: string,
    targets: CleanupCanonicalDocumentsInput['targets'],
    reason: string | undefined,
    actorDeviceId: string,
    actorDisplayName: string
  ): CleanupCanonicalDocumentsResult {
    const plan = createCanonicalCleanupPlan({
      datasetId,
      eventId: crypto.randomUUID(),
      actorDeviceId,
      actorDisplayName,
      occurredAt: Date.now(),
      currentCursor: dataset.cursor,
      candidates: targets.map(target => ({
        target,
        document: dataset.currentDocuments.get(
          getDocumentKey(target.documentType, target.documentId)
        ),
      })),
      ...(reason === undefined ? {} : { reason }),
    });
    for (const document of plan.cleanedDocuments) {
      dataset.currentDocuments.set(
        getDocumentKey(document.documentType, document.documentId),
        document
      );
    }
    dataset.cursor = plan.cursor;
    dataset.changes.push(...plan.changes);
    dataset.events.push(plan.event);
    dataset.sharedCleanupEvents.push(plan.event);
    return { ...plan, event: structuredClone(plan.event) };
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

  async recordDatasetEvent(input: DatasetEventRecord): Promise<DatasetEventRecord> {
    const dataset = this.requireDataset(input.datasetId);
    const event = structuredClone(input);
    dataset.events.push(event);
    if (event.eventType === 'restore') {
      dataset.sharedRestoreEvents.push(createSharedRestoreEvent(event));
    } else if (event.eventType === 'cleanup') {
      dataset.sharedCleanupEvents.push(event);
    }
    return event;
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

      const reconciliation = reconcileCanonicalDocumentCandidate(
        existing as CanonicalSyncDocument<TPayload> | undefined,
        documentCandidate
      );

      if (reconciliation.status === 'manual-conflict') {
        throw new CanonicalDocumentManualConflictError(
          reconciliation.conflictKey,
          reconciliation.reason
        );
      }

      if (reconciliation.status === 'no-op') {
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
        ...reconciliation.documentCandidate,
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

  async getJoinedDatasetOverview(
    input: GetJoinedDatasetOverviewInput
  ): Promise<JoinedDatasetOverview> {
    const dataset = this.requireDataset(input.datasetId);
    const device = dataset.devices.get(input.deviceId);

    if (!device || device.revokedAt) {
      throw new Error(`Remote sync device is not joined to dataset ${input.datasetId}.`);
    }

    return {
      datasetId: input.datasetId,
      summary: {
        documentCount: dataset.currentDocuments.size,
        joinedDeviceCount: [...dataset.devices.values()].filter(identity => !identity.revokedAt)
          .length,
        currentCursor: dataset.cursor,
        createdAt: dataset.dataset.createdAt,
        lastChangedAt: dataset.changes.at(-1)?.changedAt,
      },
      cleanupCapableDevices: selectCleanupCapableDevices(
        [...dataset.devices.values()],
        [...dataset.cleanupCapabilities.values()]
      ),
      recentCleanupEvents: selectRecentCleanupEvents(dataset.sharedCleanupEvents),
      recentRestoreEvents: selectRecentRestoreEvents(dataset.sharedRestoreEvents),
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
