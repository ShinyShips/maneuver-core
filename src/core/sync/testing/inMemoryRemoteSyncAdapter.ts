import type {
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CleanupAuthorityGrant,
  CleanupCanonicalDocumentsInput,
  CleanupCanonicalDocumentsResult,
  CleanupDatasetEventRecord,
  CreatePortableDatasetSnapshotServerLocalInput,
  CreateCleanupCredentialInput,
  CreateDatasetInput,
  CreateJoinCredentialInput,
  DatasetCleanupCredential,
  DeprovisionCleanupAuthorityInput,
  DatasetHealth,
  DatasetEventRecord,
  GetJoinedDatasetOverviewInput,
  GlobalRejoinResetResult,
  JoinedDatasetOverview,
  DatasetJoinCredential,
  JoinDatasetInput,
  JoinedDeviceIdentity,
  ListRejoinRecoveryBatchesInput,
  ListRejoinRecoveryBatchesServerLocalInput,
  PullChangesInput,
  PullChangesResult,
  PortableDatasetSnapshot,
  PreviewRejoinRecoveryBatchInput,
  PreviewRejoinRecoveryBatchServerLocalInput,
  ProvisionCleanupAuthorityInput,
  PushDocumentsInput,
  PushDocumentsResult,
  RemoteSyncAdapter,
  RejoinRecoveryBatch,
  RejoinRecoveryDocumentCandidate,
  RejoinRecoveryPreview,
  ReconsiderRejectedRejoinEntriesInput,
  ReconsiderRejectedRejoinEntriesServerLocalInput,
  ResetDatasetForRejoinServerLocalInput,
  RevokeJoinedDeviceInput,
  RevokeJoinedDeviceResult,
  RestorePortableDatasetSnapshotServerLocalInput,
  RotateJoinCredentialInput,
  ServerLocalCleanupCanonicalDocumentsInput,
  ServerLocalRevokeJoinedDeviceInput,
  ServerLocalRestoreResult,
  ReviewRejoinRecoveryBatchInput,
  ReviewRejoinRecoveryBatchServerLocalInput,
  SubmitRejoinRecoveryBatchInput,
  SharedRestoreEvent,
  TeamDataset,
} from '../types';
import {
  CanonicalDocumentManualConflictError,
  reconcileCanonicalDocumentCandidate,
} from '../canonicalDocumentReconciliation';
import { createCanonicalDocumentKey } from '../canonicalDocumentIdentity';
import { createCanonicalCleanupPlan } from '../canonicalDocumentCleanup';
import {
  assertPortableDatasetSnapshotMatchesDataset,
  createPortableDatasetRestorePlan,
  ServerLocalRestorePolicy,
} from '../portableDatasetRestore';
import {
  createSharedRestoreEvent,
  selectCleanupCapableDevices,
  selectRecentCleanupEvents,
  selectRecentRestoreEvents,
  type CleanupCapabilityProjection,
} from '../datasetOverview';
import { RemoteSyncDeviceNotJoinedError, RemoteSyncDeviceRevokedError } from '../remoteSyncErrors';
import {
  applyRejoinRecoveryDecision,
  getPendingRejoinRecoveryEntry,
  planRejoinRecoveryDecision,
  previewRejoinRecoveryEntry,
  reconsiderHeldRejoinRecoveryEntries,
} from '../rejoinRecoveryModel';

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
  snapshots: Map<string, PortableDatasetSnapshot>;
  rejoinRecoveryBatches: Map<string, RejoinRecoveryBatch>;
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
  private readonly restorePolicy = new ServerLocalRestorePolicy();

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
      snapshots: new Map(),
      rejoinRecoveryBatches: new Map(),
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

    if (!device) {
      throw new Error(`Remote sync device is not joined to dataset ${input.datasetId}.`);
    }
    if (device.revokedAt) {
      throw new Error(`Remote sync device has been revoked for dataset ${input.datasetId}.`);
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

  async deprovisionCleanupAuthority(input: DeprovisionCleanupAuthorityInput): Promise<void> {
    const dataset = this.requireDataset(input.datasetId);
    for (const [credentialId, capability] of dataset.cleanupCapabilities) {
      if (capability.deviceId === input.deviceId) {
        dataset.cleanupCapabilities.delete(credentialId);
      }
    }
  }

  async revokeJoinedDevice(input: RevokeJoinedDeviceInput): Promise<RevokeJoinedDeviceResult> {
    const dataset = this.requireDataset(input.datasetId);
    const actor = dataset.devices.get(input.actorDeviceId);
    const hasCleanupAuthority = [...dataset.cleanupCapabilities.values()].some(
      capability =>
        capability.deviceId === input.actorDeviceId &&
        !capability.revokedAt &&
        (!capability.expiresAt || capability.expiresAt > Date.now())
    );
    if (!actor || actor.revokedAt || !hasCleanupAuthority) {
      throw new Error(`Remote sync device ${input.actorDeviceId} does not have cleanup authority.`);
    }

    return this.commitJoinedDeviceRevocation(dataset, input.datasetId, input.targetDeviceId);
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

  async revokeJoinedDeviceServerLocal(
    input: ServerLocalRevokeJoinedDeviceInput
  ): Promise<RevokeJoinedDeviceResult> {
    return this.commitJoinedDeviceRevocation(
      this.requireDataset(input.datasetId),
      input.datasetId,
      input.targetDeviceId
    );
  }

  async resetDatasetForRejoinServerLocal(
    input: ResetDatasetForRejoinServerLocalInput
  ): Promise<GlobalRejoinResetResult> {
    const dataset = this.requireDataset(input.datasetId);
    const revokedAt = Date.now();
    const revokedDeviceIds: string[] = [];
    for (const [deviceId, device] of dataset.devices) {
      if (!device.revokedAt) {
        revokedDeviceIds.push(deviceId);
        dataset.devices.set(deviceId, { ...device, revokedAt });
      }
    }
    const revokedJoinCredentialIds: string[] = [];
    for (const [credentialId, credential] of dataset.credentials) {
      if (credential.credentialKind === 'join' && !credential.revokedAt) {
        revokedJoinCredentialIds.push(credentialId);
        dataset.credentials.set(credentialId, { ...credential, revokedAt });
      }
    }
    dataset.cleanupCapabilities.clear();
    const replacementJoinCredential = await this.createJoinCredential({
      datasetId: input.datasetId,
      operatorDeviceId: input.actorDeviceId,
    });
    return {
      operation: 'global-rejoin-reset',
      revokedDeviceIds,
      revokedJoinCredentialIds,
      replacementJoinCredential,
    };
  }

  async createPortableDatasetSnapshotServerLocal(
    input: CreatePortableDatasetSnapshotServerLocalInput
  ): Promise<PortableDatasetSnapshot> {
    const state = this.requireDataset(input.datasetId);
    const createdAt = Date.now();
    const snapshot: PortableDatasetSnapshot = {
      protocolVersion: 1,
      snapshotId: crypto.randomUUID(),
      snapshotLabel: input.snapshotLabel,
      createdAt,
      createdBy: {
        actorDeviceId: input.actorDeviceId,
        actorDisplayName: input.actorDisplayName,
      },
      dataset: structuredClone(state.dataset),
      cursor: state.cursor,
      documents: [...state.currentDocuments.values()]
        .sort((left, right) =>
          createCanonicalDocumentKey(left.documentType, left.documentId).localeCompare(
            createCanonicalDocumentKey(right.documentType, right.documentId)
          )
        )
        .map(document => structuredClone(document)),
    };
    state.events.push({
      datasetId: input.datasetId,
      eventId: crypto.randomUUID(),
      eventType: 'backup',
      actorDeviceId: input.actorDeviceId,
      actorDisplayName: input.actorDisplayName,
      occurredAt: createdAt,
      snapshotId: snapshot.snapshotId,
      snapshotLabel: snapshot.snapshotLabel,
    });
    state.snapshots.set(snapshot.snapshotId, structuredClone(snapshot));
    return snapshot;
  }

  async getPortableDatasetSnapshotServerLocal(
    datasetId: string,
    snapshotId: string
  ): Promise<PortableDatasetSnapshot> {
    const snapshot = this.requireDataset(datasetId).snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Portable dataset snapshot not found: ${snapshotId}`);
    }
    return structuredClone(snapshot);
  }

  async restorePortableDatasetSnapshotServerLocal(
    input: RestorePortableDatasetSnapshotServerLocalInput
  ): Promise<ServerLocalRestoreResult> {
    let state = this.datasets.get(input.datasetId);
    const requiredDatasetName = state?.dataset.displayName ?? input.snapshot.dataset.displayName;
    const confirmationRequired = this.restorePolicy.requireConfirmation(input, requiredDatasetName);
    if (confirmationRequired) {
      return confirmationRequired;
    }
    assertPortableDatasetSnapshotMatchesDataset(input.snapshot, input.datasetId);
    const isMigration = !state;
    if (!state) {
      state = {
        dataset: structuredClone(input.snapshot.dataset),
        currentDocuments: new Map(),
        changes: [],
        credentials: new Map(),
        devices: new Map(),
        events: [],
        cleanupCapabilities: new Map(),
        sharedRestoreEvents: [],
        sharedCleanupEvents: [],
        snapshots: new Map(),
        rejoinRecoveryBatches: new Map(),
        cursor: 0,
      };
      this.datasets.set(input.datasetId, state);
    }

    let safetySnapshot: PortableDatasetSnapshot | undefined;
    if (!isMigration) {
      try {
        safetySnapshot = await this.createPortableDatasetSnapshotServerLocal(
          this.restorePolicy.createSafetySnapshotInput(input)
        );
      } catch (error) {
        const overrideRequired = this.restorePolicy.handleSafetySnapshotFailure(input, error);
        if (overrideRequired) {
          return overrideRequired;
        }
      }
    }
    const plan = createPortableDatasetRestorePlan({
      datasetId: input.datasetId,
      snapshot: input.snapshot,
      currentDocuments: [...state.currentDocuments.values()],
      currentCursor: state.cursor,
      actorDeviceId: input.actorDeviceId,
      actorDisplayName: input.actorDisplayName,
      occurredAt: Date.now(),
      eventId: crypto.randomUUID(),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    for (const document of plan.restoredDocuments) {
      state.currentDocuments.set(
        createCanonicalDocumentKey(document.documentType, document.documentId),
        document
      );
    }
    state.cursor = plan.cursor;
    state.changes.push(...plan.changes);
    state.dataset = structuredClone(input.snapshot.dataset);
    state.events.push(plan.event);
    state.sharedRestoreEvents.push(createSharedRestoreEvent(plan.event));
    this.restorePolicy.complete(input);
    return {
      status: 'restored',
      restoredDocuments: plan.restoredDocuments.map(document => structuredClone(document)),
      cursor: state.cursor,
      event: structuredClone(plan.event),
      safetySnapshot,
    };
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
          createCanonicalDocumentKey(target.documentType, target.documentId)
        ),
      })),
      ...(reason === undefined ? {} : { reason }),
    });
    for (const document of plan.cleanedDocuments) {
      dataset.currentDocuments.set(
        createCanonicalDocumentKey(document.documentType, document.documentId),
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
    const existingDevice = dataset.devices.get(input.deviceId);
    if (existingDevice?.revokedAt) {
      throw new RemoteSyncDeviceRevokedError(input.artifact.datasetId, input.deviceId);
    }
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

    if (!device) {
      throw new Error(`Remote sync device is not joined to dataset ${input.datasetId}.`);
    }
    if (device.revokedAt) {
      throw new RemoteSyncDeviceRevokedError(input.datasetId, input.deviceId);
    }

    const committed: CanonicalSyncDocument<TPayload>[] = [];

    for (const documentCandidate of input.documents) {
      const documentKey = createCanonicalDocumentKey(
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

  async submitRejoinRecoveryBatch<TPayload = unknown>(
    input: SubmitRejoinRecoveryBatchInput<TPayload>
  ): Promise<RejoinRecoveryBatch<TPayload>> {
    const dataset = this.requireDataset(input.datasetId);
    const submittingDevice = dataset.devices.get(input.deviceId);
    if (!submittingDevice || submittingDevice.revokedAt) {
      throw new Error(`Remote sync device is not joined to dataset ${input.datasetId}.`);
    }
    const revokedDevice = dataset.devices.get(input.revokedDeviceId);
    if (!revokedDevice?.revokedAt) {
      throw new Error('Rejoin recovery requires a formerly revoked device.');
    }
    if (input.documents.length === 0) {
      throw new Error('Rejoin recovery batch must contain at least one document.');
    }

    const batch: RejoinRecoveryBatch<TPayload> = {
      batchId: crypto.randomUUID(),
      datasetId: input.datasetId,
      revokedDeviceId: input.revokedDeviceId,
      submittedByDeviceId: input.deviceId,
      submittedAt: Date.now(),
      status: 'pending',
      entries: input.documents.map(document => ({
        entryId: crypto.randomUUID(),
        status: 'pending',
        document: structuredClone(document),
      })),
    };
    dataset.rejoinRecoveryBatches.set(batch.batchId, batch as RejoinRecoveryBatch);
    return structuredClone(batch);
  }

  async listRejoinRecoveryBatches(
    input: ListRejoinRecoveryBatchesInput
  ): Promise<RejoinRecoveryBatch[]> {
    const dataset = this.requireDataset(input.datasetId);
    this.requireCleanupCapableDevice(dataset, input.deviceId);
    return [...dataset.rejoinRecoveryBatches.values()]
      .sort((left, right) => left.submittedAt - right.submittedAt)
      .map(batch => structuredClone(batch));
  }

  async previewRejoinRecoveryBatch<TPayload = unknown>(
    input: PreviewRejoinRecoveryBatchInput
  ): Promise<RejoinRecoveryPreview<TPayload>> {
    const dataset = this.requireDataset(input.datasetId);
    this.requireCleanupCapableDevice(dataset, input.deviceId);
    const batch = this.requireRejoinRecoveryBatch(dataset, input.batchId) as RejoinRecoveryBatch<TPayload>;
    return this.createRejoinRecoveryPreview(dataset, batch);
  }

  async reviewRejoinRecoveryBatch(
    input: ReviewRejoinRecoveryBatchInput
  ): Promise<RejoinRecoveryBatch> {
    const dataset = this.requireDataset(input.datasetId);
    this.requireCleanupCapableDevice(dataset, input.deviceId);
    return this.applyRejoinRecoveryReview(
      dataset,
      input.datasetId,
      input.deviceId,
      input.batchId,
      input.decisions
    );
  }

  async reconsiderRejectedRejoinEntries(
    input: ReconsiderRejectedRejoinEntriesInput
  ): Promise<RejoinRecoveryBatch> {
    const dataset = this.requireDataset(input.datasetId);
    this.requireCleanupCapableDevice(dataset, input.deviceId);
    return this.applyRejoinRecoveryReconsideration(dataset, input.batchId, input.entryIds);
  }

  async listRejoinRecoveryBatchesServerLocal(
    input: ListRejoinRecoveryBatchesServerLocalInput
  ): Promise<RejoinRecoveryBatch[]> {
    return [...this.requireDataset(input.datasetId).rejoinRecoveryBatches.values()].map(batch =>
      structuredClone(batch)
    );
  }

  async previewRejoinRecoveryBatchServerLocal<TPayload = unknown>(
    input: PreviewRejoinRecoveryBatchServerLocalInput
  ): Promise<RejoinRecoveryPreview<TPayload>> {
    const dataset = this.requireDataset(input.datasetId);
    return this.createRejoinRecoveryPreview(
      dataset,
      this.requireRejoinRecoveryBatch(dataset, input.batchId) as RejoinRecoveryBatch<TPayload>
    );
  }

  async reviewRejoinRecoveryBatchServerLocal(
    input: ReviewRejoinRecoveryBatchServerLocalInput
  ): Promise<RejoinRecoveryBatch> {
    const dataset = this.requireDataset(input.datasetId);
    return this.applyRejoinRecoveryReview(
      dataset,
      input.datasetId,
      input.actorDeviceId,
      input.batchId,
      input.decisions
    );
  }

  async reconsiderRejectedRejoinEntriesServerLocal(
    input: ReconsiderRejectedRejoinEntriesServerLocalInput
  ): Promise<RejoinRecoveryBatch> {
    const dataset = this.requireDataset(input.datasetId);
    return this.applyRejoinRecoveryReconsideration(dataset, input.batchId, input.entryIds);
  }

  async pullChanges<TPayload = unknown>(
    input: PullChangesInput
  ): Promise<PullChangesResult<TPayload>> {
    const dataset = this.requireDataset(input.datasetId);
    const device = dataset.devices.get(input.deviceId);
    if (!device) {
      throw new RemoteSyncDeviceNotJoinedError(input.datasetId, input.deviceId);
    }
    if (device.revokedAt) {
      throw new RemoteSyncDeviceRevokedError(input.datasetId, input.deviceId);
    }
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
      joinedDevices: [...dataset.devices.values()]
        .filter(identity => !identity.revokedAt)
        .map(identity => ({ deviceId: identity.deviceId, displayName: identity.displayName }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
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

  private commitJoinedDeviceRevocation(
    dataset: InMemoryDatasetState,
    datasetId: string,
    targetDeviceId: string
  ): RevokeJoinedDeviceResult {
    const target = dataset.devices.get(targetDeviceId);
    if (!target) {
      throw new Error(`Remote sync device is not joined to dataset ${datasetId}.`);
    }
    const revokedDevice = { ...target, revokedAt: Date.now() };
    dataset.devices.set(targetDeviceId, revokedDevice);
    for (const [credentialId, capability] of dataset.cleanupCapabilities) {
      if (capability.deviceId === targetDeviceId) {
        dataset.cleanupCapabilities.delete(credentialId);
      }
    }
    return { device: structuredClone(revokedDevice) };
  }

  private requireCleanupCapableDevice(
    dataset: InMemoryDatasetState,
    deviceId: string
  ): JoinedDeviceIdentity {
    const device = dataset.devices.get(deviceId);
    const hasCleanupAuthority = [...dataset.cleanupCapabilities.values()].some(
      capability =>
        capability.deviceId === deviceId &&
        !capability.revokedAt &&
        (!capability.expiresAt || capability.expiresAt > Date.now())
    );
    if (!device || device.revokedAt || !hasCleanupAuthority) {
      throw new Error(`Remote sync device ${deviceId} does not have cleanup authority.`);
    }
    return device;
  }

  private requireRejoinRecoveryBatch(
    dataset: InMemoryDatasetState,
    batchId: string
  ): RejoinRecoveryBatch {
    const batch = dataset.rejoinRecoveryBatches.get(batchId);
    if (!batch) {
      throw new Error(`Rejoin recovery batch not found: ${batchId}`);
    }
    return batch;
  }

  private createRejoinRecoveryPreview<TPayload>(
    dataset: InMemoryDatasetState,
    batch: RejoinRecoveryBatch<TPayload>
  ): RejoinRecoveryPreview<TPayload> {
    return {
      batch: structuredClone(batch),
      entries: batch.entries.map(entry => {
        const existing = dataset.currentDocuments.get(
          createCanonicalDocumentKey(entry.document.documentType, entry.document.documentId)
        ) as CanonicalSyncDocument<TPayload> | undefined;
        return structuredClone(previewRejoinRecoveryEntry(existing, entry));
      }),
    };
  }

  private commitRejoinRecoveryDocument(
    dataset: InMemoryDatasetState,
    datasetId: string,
    actorDeviceId: string,
    documentCandidate: RejoinRecoveryDocumentCandidate
  ): void {
    const key = createCanonicalDocumentKey(
      documentCandidate.documentType,
      documentCandidate.documentId
    );
    const existing = dataset.currentDocuments.get(key);
    const committedDocument: CanonicalSyncDocument = {
      ...documentCandidate,
      datasetId,
      revision: (existing?.revision ?? 0) + 1,
      updatedAt: Date.now(),
      updatedByDeviceId: actorDeviceId,
    };
    dataset.cursor += 1;
    dataset.currentDocuments.set(key, committedDocument);
    dataset.changes.push({
      datasetId,
      cursor: dataset.cursor,
      documentId: committedDocument.documentId,
      documentType: committedDocument.documentType,
      revision: committedDocument.revision,
      changedAt: committedDocument.updatedAt,
      operation: committedDocument.tombstone ? 'tombstone' : 'upsert',
      document: committedDocument,
    });
  }

  private applyRejoinRecoveryReview(
    dataset: InMemoryDatasetState,
    datasetId: string,
    actorDeviceId: string,
    batchId: string,
    decisions: ReviewRejoinRecoveryBatchInput['decisions']
  ): RejoinRecoveryBatch {
    const batch = this.requireRejoinRecoveryBatch(dataset, batchId);
    for (const decision of decisions) {
      const entry = getPendingRejoinRecoveryEntry(batch, decision.entryId);
      const existing =
        decision.action === 'approve'
          ? dataset.currentDocuments.get(
              createCanonicalDocumentKey(
                entry.document.documentType,
                entry.document.documentId
              )
            )
          : undefined;
      const plan = planRejoinRecoveryDecision(entry, decision, existing);
      if (plan.documentCandidate) {
        this.commitRejoinRecoveryDocument(
          dataset,
          datasetId,
          actorDeviceId,
          plan.documentCandidate
        );
      }
      applyRejoinRecoveryDecision(batch, entry, plan.nextStatus);
    }
    dataset.rejoinRecoveryBatches.set(batch.batchId, batch);
    return structuredClone(batch);
  }

  private applyRejoinRecoveryReconsideration(
    dataset: InMemoryDatasetState,
    batchId: string,
    entryIds: string[]
  ): RejoinRecoveryBatch {
    const batch = this.requireRejoinRecoveryBatch(dataset, batchId);
    reconsiderHeldRejoinRecoveryEntries(batch, entryIds);
    dataset.rejoinRecoveryBatches.set(batch.batchId, batch);
    return structuredClone(batch);
  }

}
