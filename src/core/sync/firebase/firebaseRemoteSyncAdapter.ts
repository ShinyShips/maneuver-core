import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
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
  PushDocumentsInput,
  PushDocumentsResult,
  ProvisionCleanupAuthorityInput,
  RemoteSyncAdminAdapter,
  RemoteSyncAdapter,
  RejoinRecoveryBatch,
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
  ServerLocalRestoreFailedError,
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
import type { FirebaseRemoteSyncConfig } from './remoteSyncFirebaseConfig';
import type { ServerLocalSnapshotStore } from './serverLocalSnapshotStore';

interface FirestoreCursorMetadata {
  currentCursor?: number;
}

type DatasetOperationLockKind = 'restore' | 'membership-reset';

type StoredCredential = (DatasetJoinCredential | DatasetCleanupCredential) & {
  createdByDeviceId: string;
};

const DATASETS = 'datasets';
const DOCUMENTS = 'documents';
const CHANGES = 'document_changes';
const DEVICES = 'devices';
const CREDENTIALS = 'credentials';
const CLEANUP_CREDENTIALS = 'cleanup_credentials';
const CLEANUP_AUTHORITY_CLAIMS = 'cleanup_authority_claims';
const EVENTS = 'dataset_events';
const PUBLIC_CLEANUP_DEVICES = 'public_cleanup_devices';
const SHARED_RESTORE_EVENTS = 'shared_restore_events';
const SHARED_CLEANUP_EVENTS = 'shared_cleanup_events';
const REJOIN_RECOVERY_BATCHES = 'rejoin_recovery_batches';
const METADATA = 'metadata';
const CURSOR = 'cursor';
const RESTORE_LOCK = 'restore_lock';
const MEMBERSHIP_RESET_LOCK = 'membership_reset_lock';
const RESTORE_DOCUMENTS_PER_BATCH = 200;
const ADMIN_WRITES_PER_BATCH = 400;
const SYNC_AUTHORITY_DEVICE_ID = 'maneuver-sync-authority';
const connectedEmulators = new Set<string>();

export function createFirebaseRemoteSyncAdapter(
  config: FirebaseRemoteSyncConfig
): RemoteSyncAdapter {
  return new FirebaseRemoteSyncAdapter(config);
}

export function createFirebaseRemoteSyncServerLocalAdapter(
  config: FirebaseRemoteSyncConfig,
  capability: FirebaseServerLocalCapability
): RemoteSyncAdminAdapter {
  return new FirebaseRemoteSyncAdapter(config, capability);
}

export interface FirebaseServerLocalCapability {
  snapshotStore: ServerLocalSnapshotStore;
}

class FirebaseRemoteSyncAdapter implements RemoteSyncAdapter {
  private readonly app: FirebaseApp;
  private readonly firestore: Firestore;
  private readonly restorePolicy = new ServerLocalRestorePolicy();

  constructor(
    config: FirebaseRemoteSyncConfig,
    private readonly serverLocalCapability?: FirebaseServerLocalCapability
  ) {
    this.app =
      getApps().find(app => app.options.projectId === config.firebase.projectId) ??
      initializeApp(config.firebase, `maneuver-remote-sync-${config.firebase.projectId}`);
    this.firestore = getFirestore(this.app);

    if (config.firestoreEmulator) {
      const emulatorKey = `${this.app.name}:${config.firestoreEmulator.host}:${config.firestoreEmulator.port}`;

      if (!connectedEmulators.has(emulatorKey)) {
        connectFirestoreEmulator(
          this.firestore,
          config.firestoreEmulator.host,
          config.firestoreEmulator.port
        );
        connectedEmulators.add(emulatorKey);
      }
    }
  }

  async createDataset(input: CreateDatasetInput): Promise<TeamDataset> {
    const now = Date.now();
    const dataset: TeamDataset = {
      datasetId: crypto.randomUUID(),
      displayName: input.displayName,
      createdAt: now,
      createdByDeviceId: input.operatorDeviceId,
      ...(input.teamNumber === undefined ? {} : { teamNumber: input.teamNumber }),
      ...(input.season === undefined ? {} : { season: input.season }),
    };

    await setDoc(datasetRef(this.firestore, dataset.datasetId), dataset);
    await setDoc(cursorRef(this.firestore, dataset.datasetId), { currentCursor: 0 });

    return dataset;
  }

  async createJoinCredential(input: CreateJoinCredentialInput): Promise<DatasetJoinCredential> {
    const credential: StoredCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'join',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      createdByDeviceId: input.operatorDeviceId,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    };

    await runTransaction(this.firestore, async transaction => {
      const datasetSnapshot = await transaction.get(datasetRef(this.firestore, input.datasetId));
      await this.assertRemoteSyncMutationUnlocked(transaction, input.datasetId);
      if (!datasetSnapshot.exists()) {
        throw new Error(`Remote sync dataset not found: ${input.datasetId}`);
      }
      transaction.set(
        credentialRef(this.firestore, input.datasetId, credential.credentialId),
        credential
      );
    });

    return credential;
  }

  async createCleanupCredential(
    input: CreateCleanupCredentialInput
  ): Promise<DatasetCleanupCredential> {
    await assertDatasetExists(this.firestore, input.datasetId);

    const credential: StoredCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'cleanup',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      createdByDeviceId: input.operatorDeviceId,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    };

    await setDoc(
      cleanupCredentialRef(this.firestore, input.datasetId, credential.credentialId),
      credential
    );

    return credential;
  }

  async provisionCleanupAuthority(
    input: ProvisionCleanupAuthorityInput
  ): Promise<CleanupAuthorityGrant> {
    const provisionedAt = Date.now();
    const grant: CleanupAuthorityGrant = {
      datasetId: input.datasetId,
      deviceId: input.deviceId,
      credentialId: input.credentialId,
      provisionedAt,
      ...(input.credentialExpiresAt === undefined ? {} : { expiresAt: input.credentialExpiresAt }),
    };
    const cleanupCapability: CleanupCapabilityProjection = {
      deviceId: input.deviceId,
      ...(input.credentialExpiresAt === undefined ? {} : { expiresAt: input.credentialExpiresAt }),
    };
    await runTransaction(this.firestore, async transaction => {
      const deviceSnapshot = await transaction.get(
        deviceRef(this.firestore, input.datasetId, input.deviceId)
      );
      await this.assertRemoteSyncMutationUnlocked(transaction, input.datasetId);
      assertJoinedDeviceSnapshot(deviceSnapshot, input.datasetId, input.deviceId);
      transaction.set(cleanupAuthorityClaimRef(this.firestore, input.datasetId, input.deviceId), {
        deviceId: input.deviceId,
        credentialId: input.credentialId,
        credentialSecret: input.credentialSecret,
        provisionedAt,
        ...(input.credentialExpiresAt === undefined
          ? {}
          : { expiresAt: input.credentialExpiresAt }),
      });
      transaction.set(
        publicCleanupDeviceRef(this.firestore, input.datasetId, input.deviceId),
        cleanupCapability
      );
    });
    return grant;
  }

  async deprovisionCleanupAuthority(input: DeprovisionCleanupAuthorityInput): Promise<void> {
    const batch = writeBatch(this.firestore);
    batch.delete(cleanupAuthorityClaimRef(this.firestore, input.datasetId, input.deviceId));
    batch.delete(publicCleanupDeviceRef(this.firestore, input.datasetId, input.deviceId));
    await batch.commit();
  }

  async revokeJoinedDevice(input: RevokeJoinedDeviceInput): Promise<RevokeJoinedDeviceResult> {
    await assertJoinedDevice(this.firestore, input.datasetId, input.actorDeviceId);
    const capabilitySnapshot = await getDoc(
      publicCleanupDeviceRef(this.firestore, input.datasetId, input.actorDeviceId)
    );
    const capability = capabilitySnapshot.data() as CleanupCapabilityProjection | undefined;
    if (!capability || (capability.expiresAt !== undefined && capability.expiresAt <= Date.now())) {
      throw new Error(
        `Remote sync device ${input.actorDeviceId} does not have cleanup authority.`
      );
    }
    return this.commitJoinedDeviceRevocation(input.datasetId, input.targetDeviceId);
  }

  async cleanupCanonicalDocuments(
    input: CleanupCanonicalDocumentsInput
  ): Promise<CleanupCanonicalDocumentsResult> {
    const identity = await assertJoinedDevice(this.firestore, input.datasetId, input.deviceId);
    const capabilitySnapshot = await getDoc(
      publicCleanupDeviceRef(this.firestore, input.datasetId, input.deviceId)
    );
    if (!capabilitySnapshot.exists()) {
      throw new Error(`Remote sync device ${input.deviceId} does not have cleanup authority.`);
    }

    return this.commitCleanup(
      input.datasetId,
      input.targets,
      input.reason,
      identity.deviceId,
      identity.displayName
    );
  }

  async cleanupCanonicalDocumentsServerLocal(
    input: ServerLocalCleanupCanonicalDocumentsInput
  ): Promise<CleanupCanonicalDocumentsResult> {
    this.requireServerLocalCapability('Server-local cleanup');
    return this.commitCleanup(
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
    this.requireServerLocalCapability('Server-local device revocation');
    return this.commitJoinedDeviceRevocation(input.datasetId, input.targetDeviceId);
  }

  async resetDatasetForRejoinServerLocal(
    input: ResetDatasetForRejoinServerLocalInput
  ): Promise<GlobalRejoinResetResult> {
    this.requireServerLocalCapability('Global rejoin reset');
    const operationId = crypto.randomUUID();
    await this.acquireDatasetOperationLock(input.datasetId, operationId, 'membership-reset');
    try {
      const [deviceSnapshots, credentialSnapshots] = await Promise.all([
        getDocs(collection(datasetRef(this.firestore, input.datasetId), DEVICES)),
        getDocs(collection(datasetRef(this.firestore, input.datasetId), CREDENTIALS)),
      ]);
      const revokedAt = Date.now();
      const activeDevices = deviceSnapshots.docs
        .map(snapshot => snapshot.data() as JoinedDeviceIdentity)
        .filter(device => !device.revokedAt);
      const activeJoinCredentials = credentialSnapshots.docs
        .map(snapshot => snapshot.data() as StoredCredential)
        .filter(credential => credential.credentialKind === 'join' && !credential.revokedAt);
      const replacementJoinCredential: StoredCredential = {
        datasetId: input.datasetId,
        credentialId: crypto.randomUUID(),
        credentialKind: 'join',
        secret: crypto.randomUUID(),
        createdAt: revokedAt,
        createdByDeviceId: input.actorDeviceId,
      };
      const activeDeviceIds = new Set(activeDevices.map(device => device.deviceId));
      const operationGroups: FirestoreBatchOperationGroup[] = deviceSnapshots.docs.map(snapshot => {
        const device = snapshot.data() as JoinedDeviceIdentity;
        return {
          writeCount: activeDeviceIds.has(device.deviceId) ? 3 : 2,
          apply: batch => {
            if (activeDeviceIds.has(device.deviceId)) {
              batch.set(deviceRef(this.firestore, input.datasetId, device.deviceId), {
                ...device,
                revokedAt,
              });
            }
            batch.delete(cleanupAuthorityClaimRef(this.firestore, input.datasetId, device.deviceId));
            batch.delete(publicCleanupDeviceRef(this.firestore, input.datasetId, device.deviceId));
          },
        };
      });
      operationGroups.push(
        ...activeJoinCredentials.map(credential => ({
          writeCount: 1,
          apply: (batch: WriteBatch) =>
            batch.set(credentialRef(this.firestore, input.datasetId, credential.credentialId), {
              ...credential,
              revokedAt,
            }),
        })),
        {
          writeCount: 1,
          apply: batch =>
            batch.set(
              credentialRef(
                this.firestore,
                input.datasetId,
                replacementJoinCredential.credentialId
              ),
              replacementJoinCredential
            ),
        }
      );
      await commitFirestoreBatchOperationGroups(this.firestore, operationGroups);
      await this.releaseDatasetOperationLock(input.datasetId, operationId, 'membership-reset');
      return {
        operation: 'global-rejoin-reset',
        revokedDeviceIds: activeDevices.map(device => device.deviceId),
        revokedJoinCredentialIds: activeJoinCredentials.map(credential => credential.credentialId),
        replacementJoinCredential,
      };
    } catch (error) {
      await this.markDatasetOperationLockFailed(input.datasetId, operationId, 'membership-reset');
      throw error;
    }
  }

  async createPortableDatasetSnapshotServerLocal(
    input: CreatePortableDatasetSnapshotServerLocalInput
  ): Promise<PortableDatasetSnapshot> {
    this.requireServerLocalCapability('Portable dataset snapshot creation');
    const operationId = crypto.randomUUID();
    await this.acquireDatasetOperationLock(input.datasetId, operationId, 'restore');
    try {
      return await this.createPortableDatasetSnapshotWhileLocked(input);
    } finally {
      await this.releaseDatasetOperationLock(input.datasetId, operationId, 'restore');
    }
  }

  private async createPortableDatasetSnapshotWhileLocked(
    input: CreatePortableDatasetSnapshotServerLocalInput
  ): Promise<PortableDatasetSnapshot> {
    const [datasetSnapshot, cursorSnapshot, documentSnapshots] = await Promise.all([
      getDoc(datasetRef(this.firestore, input.datasetId)),
      getDoc(cursorRef(this.firestore, input.datasetId)),
      getDocs(collection(datasetRef(this.firestore, input.datasetId), DOCUMENTS)),
    ]);
    if (!datasetSnapshot.exists()) {
      throw new Error(`Remote sync dataset not found: ${input.datasetId}`);
    }
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
      dataset: datasetSnapshot.data() as TeamDataset,
      cursor: (cursorSnapshot.data() as FirestoreCursorMetadata | undefined)?.currentCursor ?? 0,
      documents: documentSnapshots.docs
        .map(snapshot => snapshot.data() as CanonicalSyncDocument)
        .sort((left, right) =>
          createCanonicalDocumentKey(left.documentType, left.documentId).localeCompare(
            createCanonicalDocumentKey(right.documentType, right.documentId)
          )
        ),
    };
    await this.persistPortableDatasetSnapshot(snapshot);
    return snapshot;
  }

  async getPortableDatasetSnapshotServerLocal(
    datasetId: string,
    snapshotId: string
  ): Promise<PortableDatasetSnapshot> {
    return this.requireServerLocalCapability(
      'Portable dataset snapshot retrieval'
    ).snapshotStore.get(datasetId, snapshotId);
  }

  private async persistPortableDatasetSnapshot(snapshot: PortableDatasetSnapshot): Promise<void> {
    await this.requireServerLocalCapability(
      'Portable dataset snapshot persistence'
    ).snapshotStore.put(snapshot);
    await this.recordDatasetEvent({
      datasetId: snapshot.dataset.datasetId,
      eventId: crypto.randomUUID(),
      eventType: 'backup',
      actorDeviceId: snapshot.createdBy.actorDeviceId,
      actorDisplayName: snapshot.createdBy.actorDisplayName,
      occurredAt: snapshot.createdAt,
      snapshotId: snapshot.snapshotId,
      snapshotLabel: snapshot.snapshotLabel,
    });
  }

  async restorePortableDatasetSnapshotServerLocal(
    input: RestorePortableDatasetSnapshotServerLocalInput
  ): Promise<ServerLocalRestoreResult> {
    this.requireServerLocalCapability('Server-local restore');
    const operationId = crypto.randomUUID();
    let restorePublished = false;
    let restoreWritesStarted = false;
    let safetySnapshot: PortableDatasetSnapshot | undefined;
    await this.acquireDatasetOperationLock(input.datasetId, operationId, 'restore');
    try {
      const targetDatasetSnapshot = await getDoc(datasetRef(this.firestore, input.datasetId));
      const targetDataset = targetDatasetSnapshot.data() as TeamDataset | undefined;
      const requiredDatasetName = targetDataset?.displayName ?? input.snapshot.dataset.displayName;
      const confirmationRequired = this.restorePolicy.requireConfirmation(
        input,
        requiredDatasetName
      );
      if (confirmationRequired) {
        return confirmationRequired;
      }
      assertPortableDatasetSnapshotMatchesDataset(input.snapshot, input.datasetId);

      if (targetDataset) {
        try {
          safetySnapshot = await this.createPortableDatasetSnapshotWhileLocked(
            this.restorePolicy.createSafetySnapshotInput(input)
          );
        } catch (error) {
          const overrideRequired = this.restorePolicy.handleSafetySnapshotFailure(input, error);
          if (overrideRequired) {
            return overrideRequired;
          }
        }
      }

      const [cursorSnapshot, currentDocumentSnapshots] = await Promise.all([
        getDoc(cursorRef(this.firestore, input.datasetId)),
        getDocs(collection(datasetRef(this.firestore, input.datasetId), DOCUMENTS)),
      ]);
      const occurredAt = Date.now();
      const eventId = crypto.randomUUID();
      const plan = createPortableDatasetRestorePlan({
        datasetId: input.datasetId,
        snapshot: input.snapshot,
        currentDocuments: currentDocumentSnapshots.docs.map(
          snapshot => snapshot.data() as CanonicalSyncDocument
        ),
        currentCursor:
          (cursorSnapshot.data() as FirestoreCursorMetadata | undefined)?.currentCursor ?? 0,
        actorDeviceId: input.actorDeviceId,
        actorDisplayName: input.actorDisplayName,
        occurredAt,
        eventId,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
      });

      for (
        let start = 0;
        start < plan.restoredDocuments.length;
        start += RESTORE_DOCUMENTS_PER_BATCH
      ) {
        restoreWritesStarted = true;
        const batch = writeBatch(this.firestore);
        const end = Math.min(start + RESTORE_DOCUMENTS_PER_BATCH, plan.restoredDocuments.length);
        for (let index = start; index < end; index += 1) {
          const document = plan.restoredDocuments[index]!;
          const change = plan.changes[index]!;
          batch.set(
            canonicalDocumentRef(
              this.firestore,
              input.datasetId,
              document.documentType,
              document.documentId
            ),
            document
          );
          batch.set(changeRef(this.firestore, input.datasetId, change.cursor), change);
        }
        await batch.commit();
      }

      const publication = writeBatch(this.firestore);
      publication.set(datasetRef(this.firestore, input.datasetId), input.snapshot.dataset);
      publication.set(cursorRef(this.firestore, input.datasetId), { currentCursor: plan.cursor });
      publication.set(datasetEventRef(this.firestore, input.datasetId, eventId), plan.event);
      publication.set(sharedRestoreEventRef(this.firestore, input.datasetId, eventId), plan.event);
      publication.delete(restoreLockRef(this.firestore, input.datasetId));
      await publication.commit();
      restorePublished = true;
      this.restorePolicy.complete(input);
      return {
        status: 'restored',
        restoredDocuments: plan.restoredDocuments,
        cursor: plan.cursor,
        event: plan.event,
        safetySnapshot,
      };
    } catch (error) {
      if (safetySnapshot) {
        throw new ServerLocalRestoreFailedError(safetySnapshot.snapshotId, error);
      }
      throw error;
    } finally {
      if (!restorePublished) {
        if (restoreWritesStarted) {
          await this.markDatasetOperationLockFailed(input.datasetId, operationId, 'restore');
        } else {
          await this.releaseDatasetOperationLock(input.datasetId, operationId, 'restore');
        }
      }
    }
  }

  private async acquireDatasetOperationLock(
    datasetId: string,
    operationId: string,
    kind: DatasetOperationLockKind
  ): Promise<void> {
    await runTransaction(this.firestore, async transaction => {
      const reference = datasetOperationLockRef(this.firestore, datasetId, kind);
      const otherKind: DatasetOperationLockKind =
        kind === 'restore' ? 'membership-reset' : 'restore';
      const snapshot = await transaction.get(reference);
      const otherSnapshot = await transaction.get(
        datasetOperationLockRef(this.firestore, datasetId, otherKind)
      );
      if (snapshot.exists() && snapshot.data()?.status !== 'failed') {
        throw new Error(
          `Remote sync dataset ${datasetId} already has a ${datasetOperationLabel(kind)} running.`
        );
      }
      if (otherSnapshot.exists()) {
        throw new Error(
          `Remote sync dataset ${datasetId} has a ${datasetOperationLabel(otherKind)} running.`
        );
      }
      transaction.set(reference, { operationId, acquiredAt: Date.now(), status: 'active' });
    });
  }

  private async markDatasetOperationLockFailed(
    datasetId: string,
    operationId: string,
    kind: DatasetOperationLockKind
  ): Promise<void> {
    await runTransaction(this.firestore, async transaction => {
      const reference = datasetOperationLockRef(this.firestore, datasetId, kind);
      const snapshot = await transaction.get(reference);
      if (snapshot.data()?.operationId === operationId) {
        transaction.set(reference, {
          ...snapshot.data(),
          status: 'failed',
          failedAt: Date.now(),
        });
      }
    });
  }

  private async releaseDatasetOperationLock(
    datasetId: string,
    operationId: string,
    kind: DatasetOperationLockKind
  ): Promise<void> {
    await runTransaction(this.firestore, async transaction => {
      const reference = datasetOperationLockRef(this.firestore, datasetId, kind);
      const snapshot = await transaction.get(reference);
      if (snapshot.data()?.operationId === operationId) {
        transaction.delete(reference);
      }
    });
  }

  private async assertRemoteSyncMutationUnlocked(
    transaction: Transaction,
    datasetId: string
  ): Promise<void> {
    for (const kind of ['restore', 'membership-reset'] as const) {
      const snapshot = await transaction.get(
        datasetOperationLockRef(this.firestore, datasetId, kind)
      );
      if (snapshot.exists()) {
        throw new Error(
          `Remote sync dataset ${datasetId} has a ${datasetOperationLabel(kind)} running.`
        );
      }
    }
  }

  private requireServerLocalCapability(operation: string): FirebaseServerLocalCapability {
    const isNodeServer =
      typeof window === 'undefined' &&
      typeof process !== 'undefined' &&
      process.release?.name === 'node';
    if (!this.serverLocalCapability || !isNodeServer) {
      throw new Error(
        `${operation} requires a privileged server adapter in a Node server process, not the Firebase browser adapter.`
      );
    }
    return this.serverLocalCapability;
  }

  private async commitCleanup(
    datasetId: string,
    targets: CleanupCanonicalDocumentsInput['targets'],
    reason: string | undefined,
    actorDeviceId: string,
    actorDisplayName: string
  ): Promise<CleanupCanonicalDocumentsResult> {
    const uniqueTargets = [
      ...new Map(
        targets.map(target => [
          createCanonicalDocumentKey(target.documentType, target.documentId),
          target,
        ])
      ).values(),
    ];
    return runTransaction(this.firestore, async transaction => {
      await this.assertRemoteSyncMutationUnlocked(transaction, datasetId);
      const cursorSnapshot = await transaction.get(cursorRef(this.firestore, datasetId));
      const cursorMetadata = cursorSnapshot.data() as FirestoreCursorMetadata | undefined;
      const targetReferences = uniqueTargets.map(target =>
        canonicalDocumentRef(this.firestore, datasetId, target.documentType, target.documentId)
      );
      const targetSnapshots: DocumentSnapshot[] = [];
      for (const targetReference of targetReferences) {
        targetSnapshots.push(await transaction.get(targetReference));
      }

      const plan = createCanonicalCleanupPlan({
        datasetId,
        eventId: crypto.randomUUID(),
        actorDeviceId,
        actorDisplayName,
        occurredAt: Date.now(),
        currentCursor: cursorMetadata?.currentCursor ?? 0,
        candidates: uniqueTargets.map((target, index) => ({
          target,
          document: targetSnapshots[index]?.data() as CanonicalSyncDocument | undefined,
        })),
        ...(reason === undefined ? {} : { reason }),
      });
      for (const document of plan.cleanedDocuments) {
        transaction.set(
          canonicalDocumentRef(
            this.firestore,
            datasetId,
            document.documentType,
            document.documentId
          ),
          document
        );
      }
      for (const change of plan.changes) {
        transaction.set(changeRef(this.firestore, datasetId, change.cursor), change);
      }
      transaction.set(cursorRef(this.firestore, datasetId), { currentCursor: plan.cursor });
      transaction.set(datasetEventRef(this.firestore, datasetId, plan.event.eventId), plan.event);
      transaction.set(
        sharedCleanupEventRef(this.firestore, datasetId, plan.event.eventId),
        plan.event
      );
      return {
        cleanedDocuments: plan.cleanedDocuments,
        cursor: plan.cursor,
        event: plan.event,
      };
    });
  }

  async rotateJoinCredential(input: RotateJoinCredentialInput): Promise<DatasetJoinCredential> {
    const rotatedAt = Date.now();
    const replacement: StoredCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'join',
      secret: crypto.randomUUID(),
      createdAt: rotatedAt,
      createdByDeviceId: input.operatorDeviceId,
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    };
    await runTransaction(this.firestore, async transaction => {
      const previousReference = credentialRef(
        this.firestore,
        input.datasetId,
        input.previousCredentialId
      );
      const previousSnapshot = await transaction.get(previousReference);
      await this.assertRemoteSyncMutationUnlocked(transaction, input.datasetId);
      const previous = previousSnapshot.data() as StoredCredential | undefined;
      if (!previous || previous.credentialKind !== 'join') {
        throw new Error('Previous join credential not found.');
      }
      transaction.set(previousReference, { ...previous, revokedAt: rotatedAt });
      transaction.set(
        credentialRef(this.firestore, input.datasetId, replacement.credentialId),
        replacement
      );
    });
    return replacement;
  }

  async recordDatasetEvent(input: DatasetEventRecord): Promise<DatasetEventRecord> {
    await assertDatasetExists(this.firestore, input.datasetId);
    const event = structuredClone(input);
    const batch = writeBatch(this.firestore);
    batch.set(datasetEventRef(this.firestore, input.datasetId, input.eventId), event);
    if (event.eventType === 'restore') {
      batch.set(
        sharedRestoreEventRef(this.firestore, input.datasetId, input.eventId),
        createSharedRestoreEvent(event)
      );
    } else if (event.eventType === 'cleanup') {
      batch.set(sharedCleanupEventRef(this.firestore, input.datasetId, input.eventId), event);
    }
    await batch.commit();
    return event;
  }

  async joinDataset(input: JoinDatasetInput): Promise<JoinedDeviceIdentity> {
    const identity: JoinedDeviceIdentity = {
      datasetId: input.artifact.datasetId,
      deviceId: input.deviceId,
      displayName: input.deviceDisplayName,
      joinedAt: Date.now(),
    };

    await runTransaction(this.firestore, async transaction => {
      const existingDeviceSnapshot = await transaction.get(
        deviceRef(this.firestore, input.artifact.datasetId, input.deviceId)
      );
      const credentialSnapshot = await transaction.get(
        credentialRef(this.firestore, input.artifact.datasetId, input.artifact.credentialId)
      );
      await this.assertRemoteSyncMutationUnlocked(transaction, input.artifact.datasetId);
      const existingDevice = existingDeviceSnapshot.data() as JoinedDeviceIdentity | undefined;
      if (existingDevice?.revokedAt) {
        throw new RemoteSyncDeviceRevokedError(input.artifact.datasetId, input.deviceId);
      }
      if (!credentialSnapshot.exists()) {
        throw new Error('Dataset join credential not found.');
      }
      const credential = credentialSnapshot.data() as StoredCredential;
      if (credential.credentialKind !== 'join') {
        throw new Error('Dataset credential is not valid for joining.');
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
      transaction.set(deviceRef(this.firestore, identity.datasetId, identity.deviceId), identity);
    });

    return identity;
  }

  async pushDocuments<TPayload = unknown>(
    input: PushDocumentsInput<TPayload>
  ): Promise<PushDocumentsResult<TPayload>> {
    return runTransaction(this.firestore, async transaction => {
      await this.assertRemoteSyncMutationUnlocked(transaction, input.datasetId);
      const deviceSnapshot = await transaction.get(
        deviceRef(this.firestore, input.datasetId, input.deviceId)
      );
      assertJoinedDeviceSnapshot(deviceSnapshot, input.datasetId, input.deviceId);
      const cursorSnapshot = await transaction.get(cursorRef(this.firestore, input.datasetId));
      const cursorMetadata = cursorSnapshot.data() as FirestoreCursorMetadata | undefined;
      const documentReferences = input.documents.map(documentCandidate =>
        canonicalDocumentRef(
          this.firestore,
          input.datasetId,
          documentCandidate.documentType,
          documentCandidate.documentId
        )
      );
      const existingSnapshots = [];

      for (const documentReference of documentReferences) {
        existingSnapshots.push(await transaction.get(documentReference));
      }

      let nextCursor = cursorMetadata?.currentCursor ?? 0;
      const committed: CanonicalSyncDocument<TPayload>[] = [];

      for (const [index, documentCandidate] of input.documents.entries()) {
        const documentReference = documentReferences[index]!;
        const existingSnapshot = existingSnapshots[index]!;
        const existingDocument = existingSnapshot.data() as
          | CanonicalSyncDocument<TPayload>
          | undefined;

        const reconciliation = reconcileCanonicalDocumentCandidate(
          existingDocument,
          documentCandidate
        );

        if (reconciliation.status === 'manual-conflict') {
          throw new CanonicalDocumentManualConflictError(
            reconciliation.conflictKey,
            reconciliation.reason
          );
        }

        if (reconciliation.status === 'no-op') {
          if (existingDocument) {
            nextCursor += 1;

            const authoritativeDocument: CanonicalSyncDocument<TPayload> = {
              ...existingDocument,
              updatedByDeviceId: SYNC_AUTHORITY_DEVICE_ID,
            };
            const authoritativeChange: CanonicalSyncChange<TPayload> = {
              datasetId: input.datasetId,
              cursor: nextCursor,
              documentId: authoritativeDocument.documentId,
              documentType: authoritativeDocument.documentType,
              revision: authoritativeDocument.revision,
              changedAt: Date.now(),
              operation: authoritativeDocument.tombstone ? 'tombstone' : 'upsert',
              document: authoritativeDocument,
            };

            transaction.set(
              changeRef(this.firestore, input.datasetId, nextCursor),
              authoritativeChange
            );
            committed.push(authoritativeDocument);
          }

          continue;
        }

        const committedDocument: CanonicalSyncDocument<TPayload> = {
          ...reconciliation.documentCandidate,
          datasetId: input.datasetId,
          revision: (existingDocument?.revision ?? 0) + 1,
          updatedAt: Date.now(),
          updatedByDeviceId: input.deviceId,
        };

        nextCursor += 1;

        const change: CanonicalSyncChange<TPayload> = {
          datasetId: input.datasetId,
          cursor: nextCursor,
          documentId: committedDocument.documentId,
          documentType: committedDocument.documentType,
          revision: committedDocument.revision,
          changedAt: committedDocument.updatedAt,
          operation: committedDocument.tombstone ? 'tombstone' : 'upsert',
          document: committedDocument,
        };

        transaction.set(documentReference, committedDocument);
        transaction.set(changeRef(this.firestore, input.datasetId, nextCursor), change);
        committed.push(committedDocument);
      }

      transaction.set(cursorRef(this.firestore, input.datasetId), { currentCursor: nextCursor });

      return {
        committed,
        cursor: nextCursor,
      };
    });
  }

  async submitRejoinRecoveryBatch<TPayload = unknown>(
    input: SubmitRejoinRecoveryBatchInput<TPayload>
  ): Promise<RejoinRecoveryBatch<TPayload>> {
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
        document,
      })),
    };
    await runTransaction(this.firestore, async transaction => {
      const [submittingDeviceSnapshot, revokedDeviceSnapshot] = await Promise.all([
        transaction.get(deviceRef(this.firestore, input.datasetId, input.deviceId)),
        transaction.get(deviceRef(this.firestore, input.datasetId, input.revokedDeviceId)),
      ]);
      await this.assertRemoteSyncMutationUnlocked(transaction, input.datasetId);
      assertJoinedDeviceSnapshot(submittingDeviceSnapshot, input.datasetId, input.deviceId);
      const revokedDevice = revokedDeviceSnapshot.data() as JoinedDeviceIdentity | undefined;
      if (!revokedDeviceSnapshot.exists() || !revokedDevice?.revokedAt) {
        throw new Error('Rejoin recovery requires a formerly revoked device.');
      }
      transaction.set(rejoinRecoveryBatchRef(this.firestore, input.datasetId, batch.batchId), batch);
    });
    return batch;
  }

  async listRejoinRecoveryBatches(
    input: ListRejoinRecoveryBatchesInput
  ): Promise<RejoinRecoveryBatch[]> {
    await this.assertCleanupCapableDevice(input.datasetId, input.deviceId);
    return this.loadRejoinRecoveryBatches(input.datasetId);
  }

  async previewRejoinRecoveryBatch<TPayload = unknown>(
    input: PreviewRejoinRecoveryBatchInput
  ): Promise<RejoinRecoveryPreview<TPayload>> {
    await this.assertCleanupCapableDevice(input.datasetId, input.deviceId);
    return this.loadRejoinRecoveryPreview<TPayload>(input.datasetId, input.batchId);
  }

  async reviewRejoinRecoveryBatch(
    input: ReviewRejoinRecoveryBatchInput
  ): Promise<RejoinRecoveryBatch> {
    await this.assertCleanupCapableDevice(input.datasetId, input.deviceId);
    return this.commitRejoinRecoveryReview(
      input.datasetId,
      input.deviceId,
      input.batchId,
      input.decisions
    );
  }

  async reconsiderRejectedRejoinEntries(
    input: ReconsiderRejectedRejoinEntriesInput
  ): Promise<RejoinRecoveryBatch> {
    await this.assertCleanupCapableDevice(input.datasetId, input.deviceId);
    return this.commitRejoinRecoveryReconsideration(
      input.datasetId,
      input.batchId,
      input.entryIds
    );
  }

  async listRejoinRecoveryBatchesServerLocal(
    input: ListRejoinRecoveryBatchesServerLocalInput
  ): Promise<RejoinRecoveryBatch[]> {
    this.requireServerLocalCapability('Server-local rejoin recovery review');
    return this.loadRejoinRecoveryBatches(input.datasetId);
  }

  async previewRejoinRecoveryBatchServerLocal<TPayload = unknown>(
    input: PreviewRejoinRecoveryBatchServerLocalInput
  ): Promise<RejoinRecoveryPreview<TPayload>> {
    this.requireServerLocalCapability('Server-local rejoin recovery review');
    return this.loadRejoinRecoveryPreview<TPayload>(input.datasetId, input.batchId);
  }

  async reviewRejoinRecoveryBatchServerLocal(
    input: ReviewRejoinRecoveryBatchServerLocalInput
  ): Promise<RejoinRecoveryBatch> {
    this.requireServerLocalCapability('Server-local rejoin recovery review');
    return this.commitRejoinRecoveryReview(
      input.datasetId,
      input.actorDeviceId,
      input.batchId,
      input.decisions
    );
  }

  async reconsiderRejectedRejoinEntriesServerLocal(
    input: ReconsiderRejectedRejoinEntriesServerLocalInput
  ): Promise<RejoinRecoveryBatch> {
    this.requireServerLocalCapability('Server-local rejoin recovery review');
    return this.commitRejoinRecoveryReconsideration(
      input.datasetId,
      input.batchId,
      input.entryIds
    );
  }

  async pullChanges<TPayload = unknown>(
    input: PullChangesInput
  ): Promise<PullChangesResult<TPayload>> {
    await assertJoinedDevice(this.firestore, input.datasetId, input.deviceId);
    const pageSize = input.pageSize ?? 100;
    const cursorSnapshot = await getDoc(cursorRef(this.firestore, input.datasetId));
    const publishedCursor =
      (cursorSnapshot.data() as FirestoreCursorMetadata | undefined)?.currentCursor ?? 0;
    if (publishedCursor <= input.afterCursor) {
      return {
        changes: [],
        nextCursor: input.afterCursor,
        hasMore: false,
      };
    }
    const changesQuery = query(
      collection(datasetRef(this.firestore, input.datasetId), CHANGES),
      where('cursor', '>', input.afterCursor),
      where('cursor', '<=', publishedCursor),
      orderBy('cursor', 'asc'),
      limit(pageSize + 1)
    );
    const snapshot = await getDocs(changesQuery);
    const changes = snapshot.docs
      .slice(0, pageSize)
      .map(changeDocument => changeDocument.data() as CanonicalSyncChange<TPayload>);
    const lastChange = changes.at(-1);

    return {
      changes,
      nextCursor: lastChange?.cursor ?? input.afterCursor,
      hasMore: snapshot.docs.length > pageSize,
    };
  }

  async getDatasetHealth(datasetId: string): Promise<DatasetHealth> {
    await assertDatasetExists(this.firestore, datasetId);

    const [documentCount, deviceCount, cursorSnapshot] = await Promise.all([
      getCountFromServer(collection(datasetRef(this.firestore, datasetId), DOCUMENTS)),
      getCountFromServer(collection(datasetRef(this.firestore, datasetId), DEVICES)),
      getDoc(cursorRef(this.firestore, datasetId)),
    ]);
    const cursorMetadata = cursorSnapshot.data() as FirestoreCursorMetadata | undefined;

    return {
      datasetId,
      documentCount: documentCount.data().count,
      deviceCount: deviceCount.data().count,
      currentCursor: cursorMetadata?.currentCursor ?? 0,
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
    await assertJoinedDevice(this.firestore, input.datasetId, input.deviceId);

    const [
      datasetSnapshot,
      documentCount,
      cursorSnapshot,
      latestChanges,
      deviceSnapshots,
      cleanupCapabilitySnapshots,
      sharedCleanupEventSnapshots,
      sharedRestoreEventSnapshots,
    ] = await Promise.all([
      getDoc(datasetRef(this.firestore, input.datasetId)),
      getCountFromServer(collection(datasetRef(this.firestore, input.datasetId), DOCUMENTS)),
      getDoc(cursorRef(this.firestore, input.datasetId)),
      getDocs(
        query(
          collection(datasetRef(this.firestore, input.datasetId), CHANGES),
          orderBy('cursor', 'desc'),
          limit(1)
        )
      ),
      getDocs(collection(datasetRef(this.firestore, input.datasetId), DEVICES)),
      getDocs(collection(datasetRef(this.firestore, input.datasetId), PUBLIC_CLEANUP_DEVICES)),
      getDocs(collection(datasetRef(this.firestore, input.datasetId), SHARED_CLEANUP_EVENTS)),
      getDocs(collection(datasetRef(this.firestore, input.datasetId), SHARED_RESTORE_EVENTS)),
    ]);
    const dataset = datasetSnapshot.data() as TeamDataset;
    const cursorMetadata = cursorSnapshot.data() as FirestoreCursorMetadata | undefined;
    const latestChange = latestChanges.docs[0]?.data() as CanonicalSyncChange | undefined;
    const cleanupCapableDevices = selectCleanupCapableDevices(
      deviceSnapshots.docs.map(snapshot => snapshot.data() as JoinedDeviceIdentity),
      cleanupCapabilitySnapshots.docs.map(
        snapshot => snapshot.data() as CleanupCapabilityProjection
      )
    );
    const recentRestoreEvents = selectRecentRestoreEvents(
      sharedRestoreEventSnapshots.docs.map(snapshot => snapshot.data() as SharedRestoreEvent)
    );
    const recentCleanupEvents = selectRecentCleanupEvents(
      sharedCleanupEventSnapshots.docs.map(snapshot => snapshot.data() as CleanupDatasetEventRecord)
    );
    const joinedDeviceCount = deviceSnapshots.docs
      .map(snapshot => snapshot.data() as JoinedDeviceIdentity)
      .filter(identity => !identity.revokedAt).length;

    return {
      datasetId: input.datasetId,
      summary: {
        documentCount: documentCount.data().count,
        joinedDeviceCount,
        currentCursor: cursorMetadata?.currentCursor ?? 0,
        createdAt: dataset.createdAt,
        lastChangedAt: latestChange?.changedAt,
      },
      joinedDevices: deviceSnapshots.docs
        .map(snapshot => snapshot.data() as JoinedDeviceIdentity)
        .filter(identity => !identity.revokedAt)
        .map(identity => ({ deviceId: identity.deviceId, displayName: identity.displayName }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
      cleanupCapableDevices,
      recentCleanupEvents,
      recentRestoreEvents,
      checkedAt: Date.now(),
    };
  }

  private async assertCleanupCapableDevice(
    datasetId: string,
    deviceId: string
  ): Promise<JoinedDeviceIdentity> {
    const device = await assertJoinedDevice(this.firestore, datasetId, deviceId);
    const capabilitySnapshot = await getDoc(
      publicCleanupDeviceRef(this.firestore, datasetId, deviceId)
    );
    const capability = capabilitySnapshot.data() as CleanupCapabilityProjection | undefined;
    if (!capability || (capability.expiresAt !== undefined && capability.expiresAt <= Date.now())) {
      throw new Error(`Remote sync device ${deviceId} does not have cleanup authority.`);
    }
    return device;
  }

  private async loadRejoinRecoveryBatches(datasetId: string): Promise<RejoinRecoveryBatch[]> {
    const snapshot = await getDocs(
      collection(datasetRef(this.firestore, datasetId), REJOIN_RECOVERY_BATCHES)
    );
    return snapshot.docs
      .map(documentSnapshot => documentSnapshot.data() as RejoinRecoveryBatch)
      .sort((left, right) => left.submittedAt - right.submittedAt);
  }

  private async loadRejoinRecoveryPreview<TPayload>(
    datasetId: string,
    batchId: string
  ): Promise<RejoinRecoveryPreview<TPayload>> {
    const batchSnapshot = await getDoc(rejoinRecoveryBatchRef(this.firestore, datasetId, batchId));
    if (!batchSnapshot.exists()) throw new Error(`Rejoin recovery batch not found: ${batchId}`);
    const batch = batchSnapshot.data() as RejoinRecoveryBatch<TPayload>;
    const canonicalSnapshots = await Promise.all(
      batch.entries.map(entry =>
        getDoc(
          canonicalDocumentRef(
            this.firestore,
            datasetId,
            entry.document.documentType,
            entry.document.documentId
          )
        )
      )
    );
    return {
      batch,
      entries: batch.entries.map((entry, index) => {
        const existing = canonicalSnapshots[index]?.data() as
          | CanonicalSyncDocument<TPayload>
          | undefined;
        return previewRejoinRecoveryEntry(existing, entry);
      }),
    };
  }

  private async commitRejoinRecoveryReview(
    datasetId: string,
    actorDeviceId: string,
    batchId: string,
    decisions: ReviewRejoinRecoveryBatchInput['decisions']
  ): Promise<RejoinRecoveryBatch> {
    return runTransaction(this.firestore, async transaction => {
      await this.assertRemoteSyncMutationUnlocked(transaction, datasetId);
      const batchReference = rejoinRecoveryBatchRef(this.firestore, datasetId, batchId);
      const batchSnapshot = await transaction.get(batchReference);
      if (!batchSnapshot.exists()) throw new Error(`Rejoin recovery batch not found: ${batchId}`);
      const recoveryBatch = batchSnapshot.data() as RejoinRecoveryBatch;
      const approvedDecisions = decisions.filter(decision => decision.action === 'approve');
      const approvedEntries = approvedDecisions.map(decision =>
        getPendingRejoinRecoveryEntry(recoveryBatch, decision.entryId)
      );
      const documentReferences = approvedEntries.map(entry =>
        canonicalDocumentRef(
          this.firestore,
          datasetId,
          entry.document.documentType,
          entry.document.documentId
        )
      );
      const canonicalSnapshots = [];
      for (const reference of documentReferences) canonicalSnapshots.push(await transaction.get(reference));
      const cursorReference = cursorRef(this.firestore, datasetId);
      const cursorSnapshot = await transaction.get(cursorReference);
      let nextCursor =
        (cursorSnapshot.data() as FirestoreCursorMetadata | undefined)?.currentCursor ?? 0;

      for (const decision of decisions) {
        const entry = getPendingRejoinRecoveryEntry(recoveryBatch, decision.entryId);
        const approvedIndex =
          decision.action === 'approve' ? approvedDecisions.indexOf(decision) : -1;
        const existing =
          approvedIndex >= 0
            ? (canonicalSnapshots[approvedIndex]?.data() as
                | CanonicalSyncDocument
                | undefined)
            : undefined;
        const plan = planRejoinRecoveryDecision(entry, decision, existing);
        if (plan.documentCandidate) {
          const committedDocument: CanonicalSyncDocument = {
            ...plan.documentCandidate,
            datasetId,
            revision: (existing?.revision ?? 0) + 1,
            updatedAt: Date.now(),
            updatedByDeviceId: actorDeviceId,
          };
          nextCursor += 1;
          transaction.set(documentReferences[approvedIndex]!, committedDocument);
          transaction.set(changeRef(this.firestore, datasetId, nextCursor), {
            datasetId,
            cursor: nextCursor,
            documentId: committedDocument.documentId,
            documentType: committedDocument.documentType,
            revision: committedDocument.revision,
            changedAt: committedDocument.updatedAt,
            operation: committedDocument.tombstone ? 'tombstone' : 'upsert',
            document: committedDocument,
          } satisfies CanonicalSyncChange);
        }
        applyRejoinRecoveryDecision(recoveryBatch, entry, plan.nextStatus);
      }
      transaction.set(batchReference, recoveryBatch);
      transaction.set(cursorReference, { currentCursor: nextCursor });
      return recoveryBatch;
    });
  }

  private async commitRejoinRecoveryReconsideration(
    datasetId: string,
    batchId: string,
    entryIds: string[]
  ): Promise<RejoinRecoveryBatch> {
    return runTransaction(this.firestore, async transaction => {
      await this.assertRemoteSyncMutationUnlocked(transaction, datasetId);
      const reference = rejoinRecoveryBatchRef(this.firestore, datasetId, batchId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) throw new Error(`Rejoin recovery batch not found: ${batchId}`);
      const batch = snapshot.data() as RejoinRecoveryBatch;
      reconsiderHeldRejoinRecoveryEntries(batch, entryIds);
      transaction.set(reference, batch);
      return batch;
    });
  }

  private async commitJoinedDeviceRevocation(
    datasetId: string,
    targetDeviceId: string
  ): Promise<RevokeJoinedDeviceResult> {
    const target = await assertJoinedDevice(this.firestore, datasetId, targetDeviceId);
    const revokedDevice = { ...target, revokedAt: Date.now() };
    const batch = writeBatch(this.firestore);
    batch.set(deviceRef(this.firestore, datasetId, targetDeviceId), revokedDevice);
    batch.delete(cleanupAuthorityClaimRef(this.firestore, datasetId, targetDeviceId));
    batch.delete(publicCleanupDeviceRef(this.firestore, datasetId, targetDeviceId));
    await batch.commit();
    return { device: revokedDevice };
  }
}

interface FirestoreBatchOperationGroup {
  writeCount: number;
  apply: (batch: WriteBatch) => void;
}

async function commitFirestoreBatchOperationGroups(
  firestore: Firestore,
  groups: FirestoreBatchOperationGroup[]
): Promise<void> {
  let batch = writeBatch(firestore);
  let writeCount = 0;
  for (const group of groups) {
    if (writeCount > 0 && writeCount + group.writeCount > ADMIN_WRITES_PER_BATCH) {
      await batch.commit();
      batch = writeBatch(firestore);
      writeCount = 0;
    }
    group.apply(batch);
    writeCount += group.writeCount;
  }
  if (writeCount > 0) {
    await batch.commit();
  }
}

function datasetRef(firestore: Firestore, datasetId: string) {
  return doc(firestore, DATASETS, datasetId);
}

function cursorRef(firestore: Firestore, datasetId: string) {
  return doc(datasetRef(firestore, datasetId), METADATA, CURSOR);
}

function restoreLockRef(firestore: Firestore, datasetId: string) {
  return doc(datasetRef(firestore, datasetId), METADATA, RESTORE_LOCK);
}

function membershipResetLockRef(firestore: Firestore, datasetId: string) {
  return doc(datasetRef(firestore, datasetId), METADATA, MEMBERSHIP_RESET_LOCK);
}

function datasetOperationLockRef(
  firestore: Firestore,
  datasetId: string,
  kind: DatasetOperationLockKind
) {
  return kind === 'restore'
    ? restoreLockRef(firestore, datasetId)
    : membershipResetLockRef(firestore, datasetId);
}

function datasetOperationLabel(kind: DatasetOperationLockKind): string {
  return kind === 'restore' ? 'recovery action' : 'membership reset';
}

function canonicalDocumentRef(
  firestore: Firestore,
  datasetId: string,
  documentType: string,
  documentId: string
) {
  return doc(datasetRef(firestore, datasetId), DOCUMENTS, `${documentType}_${documentId}`);
}

function changeRef(firestore: Firestore, datasetId: string, cursor: number) {
  return doc(datasetRef(firestore, datasetId), CHANGES, cursor.toString().padStart(16, '0'));
}

function deviceRef(firestore: Firestore, datasetId: string, deviceId: string) {
  return doc(datasetRef(firestore, datasetId), DEVICES, deviceId);
}

function credentialRef(firestore: Firestore, datasetId: string, credentialId: string) {
  return doc(datasetRef(firestore, datasetId), CREDENTIALS, credentialId);
}

function cleanupCredentialRef(firestore: Firestore, datasetId: string, credentialId: string) {
  return doc(datasetRef(firestore, datasetId), CLEANUP_CREDENTIALS, credentialId);
}

function datasetEventRef(firestore: Firestore, datasetId: string, eventId: string) {
  return doc(datasetRef(firestore, datasetId), EVENTS, eventId);
}

function cleanupAuthorityClaimRef(firestore: Firestore, datasetId: string, deviceId: string) {
  return doc(datasetRef(firestore, datasetId), CLEANUP_AUTHORITY_CLAIMS, deviceId);
}

function publicCleanupDeviceRef(firestore: Firestore, datasetId: string, deviceId: string) {
  return doc(datasetRef(firestore, datasetId), PUBLIC_CLEANUP_DEVICES, deviceId);
}

function sharedRestoreEventRef(firestore: Firestore, datasetId: string, eventId: string) {
  return doc(datasetRef(firestore, datasetId), SHARED_RESTORE_EVENTS, eventId);
}

function sharedCleanupEventRef(firestore: Firestore, datasetId: string, eventId: string) {
  return doc(datasetRef(firestore, datasetId), SHARED_CLEANUP_EVENTS, eventId);
}

function rejoinRecoveryBatchRef(firestore: Firestore, datasetId: string, batchId: string) {
  return doc(datasetRef(firestore, datasetId), REJOIN_RECOVERY_BATCHES, batchId);
}

async function assertDatasetExists(firestore: Firestore, datasetId: string): Promise<void> {
  const snapshot = await getDoc(datasetRef(firestore, datasetId));

  if (!snapshot.exists()) {
    throw new Error(`Remote sync dataset not found: ${datasetId}`);
  }
}

async function assertJoinedDevice(
  firestore: Firestore,
  datasetId: string,
  deviceId: string
): Promise<JoinedDeviceIdentity> {
  const snapshot = await getDoc(deviceRef(firestore, datasetId, deviceId));

  return assertJoinedDeviceSnapshot(snapshot, datasetId, deviceId);
}

function assertJoinedDeviceSnapshot(
  snapshot: DocumentSnapshot,
  datasetId: string,
  deviceId: string
): JoinedDeviceIdentity {
  if (!snapshot.exists()) {
    throw new RemoteSyncDeviceNotJoinedError(datasetId, deviceId);
  }

  const identity = snapshot.data() as JoinedDeviceIdentity;

  if (identity.revokedAt) {
    throw new RemoteSyncDeviceRevokedError(datasetId, deviceId);
  }

  return identity;
}
