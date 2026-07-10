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
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
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
import {
  CanonicalDocumentManualConflictError,
  reconcileCanonicalDocumentCandidate,
} from '../canonicalDocumentReconciliation';
import type { FirebaseRemoteSyncConfig } from './remoteSyncFirebaseConfig';

interface FirestoreCursorMetadata {
  currentCursor?: number;
}

type StoredCredential = (DatasetJoinCredential | DatasetCleanupCredential) & {
  createdByDeviceId: string;
};

const DATASETS = 'datasets';
const DOCUMENTS = 'documents';
const CHANGES = 'document_changes';
const DEVICES = 'devices';
const CREDENTIALS = 'credentials';
const METADATA = 'metadata';
const CURSOR = 'cursor';
const SYNC_AUTHORITY_DEVICE_ID = 'maneuver-sync-authority';
const connectedEmulators = new Set<string>();

export function createFirebaseRemoteSyncAdapter(
  config: FirebaseRemoteSyncConfig
): RemoteSyncAdapter {
  return new FirebaseRemoteSyncAdapter(config);
}

class FirebaseRemoteSyncAdapter implements RemoteSyncAdapter {
  private readonly app: FirebaseApp;
  private readonly firestore: Firestore;

  constructor(config: FirebaseRemoteSyncConfig) {
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
      teamNumber: input.teamNumber,
      season: input.season,
      createdAt: now,
      createdByDeviceId: input.operatorDeviceId,
    };

    await setDoc(datasetRef(this.firestore, dataset.datasetId), dataset);
    await setDoc(cursorRef(this.firestore, dataset.datasetId), { currentCursor: 0 });

    return dataset;
  }

  async createJoinCredential(input: CreateJoinCredentialInput): Promise<DatasetJoinCredential> {
    await assertDatasetExists(this.firestore, input.datasetId);

    const credential: StoredCredential = {
      datasetId: input.datasetId,
      credentialId: crypto.randomUUID(),
      credentialKind: 'join',
      secret: crypto.randomUUID(),
      createdAt: Date.now(),
      createdByDeviceId: input.operatorDeviceId,
      expiresAt: input.expiresAt,
    };

    await setDoc(
      credentialRef(this.firestore, input.datasetId, credential.credentialId),
      credential
    );

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
      expiresAt: input.expiresAt,
    };

    await setDoc(
      credentialRef(this.firestore, input.datasetId, credential.credentialId),
      credential
    );

    return credential;
  }

  async rotateJoinCredential(input: RotateJoinCredentialInput): Promise<DatasetJoinCredential> {
    await updateDoc(credentialRef(this.firestore, input.datasetId, input.previousCredentialId), {
      revokedAt: Date.now(),
    });

    return this.createJoinCredential(input);
  }

  async joinDataset(input: JoinDatasetInput): Promise<JoinedDeviceIdentity> {
    const credentialSnapshot = await getDoc(
      credentialRef(this.firestore, input.artifact.datasetId, input.artifact.credentialId)
    );

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

    const identity: JoinedDeviceIdentity = {
      datasetId: input.artifact.datasetId,
      deviceId: input.deviceId,
      displayName: input.deviceDisplayName,
      joinedAt: Date.now(),
    };

    await setDoc(deviceRef(this.firestore, identity.datasetId, identity.deviceId), identity);

    return identity;
  }

  async pushDocuments<TPayload = unknown>(
    input: PushDocumentsInput<TPayload>
  ): Promise<PushDocumentsResult<TPayload>> {
    await assertDeviceCanWrite(this.firestore, input.datasetId, input.deviceId);

    return runTransaction(this.firestore, async transaction => {
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

            transaction.set(changeRef(this.firestore, input.datasetId, nextCursor), authoritativeChange);
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

  async pullChanges<TPayload = unknown>(
    input: PullChangesInput
  ): Promise<PullChangesResult<TPayload>> {
    const pageSize = input.pageSize ?? 100;
    const changesQuery = query(
      collection(datasetRef(this.firestore, input.datasetId), CHANGES),
      where('cursor', '>', input.afterCursor),
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
}

function datasetRef(firestore: Firestore, datasetId: string) {
  return doc(firestore, DATASETS, datasetId);
}

function cursorRef(firestore: Firestore, datasetId: string) {
  return doc(datasetRef(firestore, datasetId), METADATA, CURSOR);
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

async function assertDatasetExists(firestore: Firestore, datasetId: string): Promise<void> {
  const snapshot = await getDoc(datasetRef(firestore, datasetId));

  if (!snapshot.exists()) {
    throw new Error(`Remote sync dataset not found: ${datasetId}`);
  }
}

async function assertDeviceCanWrite(
  firestore: Firestore,
  datasetId: string,
  deviceId: string
): Promise<void> {
  const snapshot = await getDoc(deviceRef(firestore, datasetId, deviceId));

  if (!snapshot.exists()) {
    throw new Error(`Remote sync device is not joined to dataset ${datasetId}.`);
  }

  const identity = snapshot.data() as JoinedDeviceIdentity;

  if (identity.revokedAt) {
    throw new Error(`Remote sync device has been revoked for dataset ${datasetId}.`);
  }
}
