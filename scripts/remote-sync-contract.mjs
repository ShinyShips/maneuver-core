import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const repoRoot = process.cwd();
const workDir = path.join(repoRoot, `tmp-remote-sync-contract-${process.pid}`);
const fakeDbPath = path.join(workDir, 'fake-database.ts');
const fakeScoutProfileStorePath = path.join(workDir, 'fake-scout-profile-store.ts');
const entryPath = path.join(workDir, 'remote-sync-contract.ts');

await rm(workDir, { force: true, recursive: true });
await mkdir(workDir, { recursive: true });

await writeFile(
  fakeDbPath,
  `
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';

const clientStores = new Map<string, Map<string, ScoutingEntryBase<Record<string, unknown>>>>();
let activeClientId = 'default';

function activeStore() {
  let store = clientStores.get(activeClientId);

  if (!store) {
    store = new Map();
    clientStores.set(activeClientId, store);
  }

  return store;
}

export function __useRemoteSyncContractDbClient(clientId: string): void {
  activeClientId = clientId;
  activeStore();
}

export function __resetRemoteSyncContractDb(): void {
  clientStores.clear();
  activeClientId = 'default';
}

export function __getRemoteSyncContractEntry(
  id: string
): ScoutingEntryBase<Record<string, unknown>> | undefined {
  return activeStore().get(id);
}

export const db = {
  scoutingData: {
    async get(id: string) {
      return activeStore().get(id);
    },
    async put(entry: ScoutingEntryBase<Record<string, unknown>>) {
      activeStore().set(entry.id, entry);
    },
    async delete(id: string) {
      activeStore().delete(id);
    },
    async toArray() {
      return [...activeStore().values()];
    },
  },
};

export async function saveScoutingEntry<TGameData = Record<string, unknown>>(
  entry: ScoutingEntryBase<TGameData>,
  options: { queueRemoteSync?: boolean } = {}
): Promise<void> {
  activeStore().set(entry.id, entry as ScoutingEntryBase<Record<string, unknown>>);

  if (options.queueRemoteSync !== false) {
    const { enqueueScoutingEntryUpsert } = await import('@/core/sync/remoteSyncQueue');
    enqueueScoutingEntryUpsert(entry as ScoutingEntryBase<Record<string, unknown>>);
  }
}

export async function deleteScoutingEntry(
  id: string,
  options: { queueRemoteSync?: boolean } = {}
): Promise<void> {
  const existing = activeStore().get(id);
  activeStore().delete(id);

  if (existing && options.queueRemoteSync !== false) {
    const { enqueueScoutingEntryTombstone } = await import('@/core/sync/remoteSyncQueue');
    enqueueScoutingEntryTombstone(existing);
  }
}
`,
  'utf8'
);

await writeFile(
  fakeScoutProfileStorePath,
  `
import type { ScoutProfileSyncPayload } from '@/core/sync/scoutProfileDocuments';
import { normalizeScoutProfileName } from '@/core/sync/canonicalDocumentIdentity';

const clientStores = new Map<string, Map<string, ScoutProfileSyncPayload>>();
let activeClientId = 'default';

function activeStore() {
  let store = clientStores.get(activeClientId);

  if (!store) {
    store = new Map();
    clientStores.set(activeClientId, store);
  }

  return store;
}

export function __useRemoteSyncContractScoutProfileClient(clientId: string): void {
  activeClientId = clientId;
  activeStore();
}

export function __resetRemoteSyncContractScoutProfiles(): void {
  clientStores.clear();
  activeClientId = 'default';
}

export function __setRemoteSyncContractScoutProfile(payload: ScoutProfileSyncPayload): void {
  activeStore().set(normalizeScoutProfileName(payload.scout.name), structuredClone(payload));
}

export function __getRemoteSyncContractScoutProfile(
  scoutName: string
): ScoutProfileSyncPayload | undefined {
  const payload = activeStore().get(normalizeScoutProfileName(scoutName));
  return payload ? structuredClone(payload) : undefined;
}

export async function loadScoutProfileSyncPayload(
  scoutName: string
): Promise<ScoutProfileSyncPayload | undefined> {
  return __getRemoteSyncContractScoutProfile(scoutName);
}

export async function loadAllScoutProfileSyncPayloads(): Promise<ScoutProfileSyncPayload[]> {
  return [...activeStore().values()].map(payload => structuredClone(payload));
}

export async function saveScoutProfileSyncPayload(
  payload: ScoutProfileSyncPayload
): Promise<void> {
  __setRemoteSyncContractScoutProfile(payload);
}

export async function renameScoutProfileSyncPayload(
  currentName: string,
  replacementName: string
): Promise<void> {
  const currentKey = normalizeScoutProfileName(currentName);
  const payload = activeStore().get(currentKey);

  if (!payload) {
    throw new Error('Local Scout profile was not found.');
  }

  activeStore().delete(currentKey);
  __setRemoteSyncContractScoutProfile({
    scout: { ...payload.scout, name: replacementName },
    predictions: payload.predictions.map(prediction => ({
      ...prediction,
      scoutName: replacementName,
    })),
    achievements: payload.achievements.map(achievement => ({
      ...achievement,
      scoutName: replacementName,
    })),
  });
}
`,
  'utf8'
);

await writeFile(
  entryPath,
  `
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createCanonicalDocumentIdentity,
  createInMemoryRemoteSyncAdapter,
  createJoinDatasetInputFromConnection,
  createRemoteSyncConnection,
  createScoutingDataExport,
  createScopedOnlineExportSelection,
  getEventSyncScope,
  getScopedOnlineExportDefault,
  getRemoteSyncQueueHealth,
  enqueueScoutProfileUpsert,
  loadPendingScoutNameCollisions,
  loadRemoteSyncConnection,
  loadRemoteSyncQueue,
  loadScoutProfileQueue,
  parseDatasetCleanupProvisioningArtifact,
  preparePostRejoinRecoveryBatch,
  readScopedOnlineScoutingEntries,
  resolveScoutNameCollision,
  reconcileScoutProfile,
  saveRemoteSyncConnection,
  syncScoutingEntries,
  updateEventSyncScope,
} from '@/core/sync';
import { inspectScoutNameCollision } from '@/core/sync/canonicalDocumentIdentity';
import { reconcileCanonicalDocumentCandidate } from '@/core/sync/canonicalDocumentReconciliation';
import { disconnectRemoteSyncDeviceIfRevoked } from '@/core/sync/remoteSyncRevocation';
import { RemoteSyncDeviceRevokedError } from '@/core/sync/remoteSyncErrors';
import {
  createScoutProfileSyncDocumentCandidate,
  type ScoutProfileSyncPayload,
} from '@/core/sync/scoutProfileDocuments';
import {
  __getRemoteSyncContractEntry,
  __resetRemoteSyncContractDb,
  __useRemoteSyncContractDbClient,
  deleteScoutingEntry,
  saveScoutingEntry,
} from '@/core/db/database';
import type { DatasetJoinArtifact } from '@/core/sync';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';
import { JoinedDatasetOverviewPanel } from '@/core/components/remote-sync/JoinedDatasetOverviewPanel';
import { CleanupAuthorityPanel } from '@/core/components/remote-sync/CleanupAuthorityPanel';
import { PostRejoinRecoveryPanel } from '@/core/components/remote-sync/PostRejoinRecoveryPanel';
import { RejoinRecoveryReviewPanel } from '@/core/components/remote-sync/RejoinRecoveryReviewPanel';
import { ScoutingExportScopePanel } from '@/core/components/data-transfer/ScoutingExportScopePanel';
import {
  __getRemoteSyncContractScoutProfile,
  __resetRemoteSyncContractScoutProfiles,
  __setRemoteSyncContractScoutProfile,
  __useRemoteSyncContractScoutProfileClient,
} from '@/core/sync/scoutProfileStore';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const browserStores = new Map<string, MemoryStorage>();

function useClient(clientId: string): void {
  __useRemoteSyncContractDbClient(clientId);
  __useRemoteSyncContractScoutProfileClient(clientId);

  let storage = browserStores.get(clientId);

  if (!storage) {
    storage = new MemoryStorage();
    browserStores.set(clientId, storage);
  }

  const windowLike = {
    localStorage: storage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: true }),
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: windowLike,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true, platform: 'RemoteSyncContract' },
  });

  if (!('CustomEvent' in globalThis)) {
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: class CustomEvent {
        type: string;
        detail: unknown;

        constructor(type: string, init: { detail?: unknown } = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
    });
  }
}

function scoutingEntry(overrides: Partial<ScoutingEntryBase<Record<string, unknown>>> = {}) {
  return {
    id: '2026miket::qm1::3314::red',
    scoutName: 'Scout A',
    teamNumber: 3314,
    matchNumber: 1,
    eventKey: '2026MIKET',
    matchKey: 'qm1',
    allianceColor: 'red',
    timestamp: 1_000,
    comments: 'baseline',
    gameData: {
      auto: 1,
    },
    ...overrides,
  } satisfies ScoutingEntryBase<Record<string, unknown>>;
}

function attachClient(
  clientId: string,
  artifact: DatasetJoinArtifact,
  eventKeys: string[] | undefined = ['2026miket']
): void {
  useClient(clientId);
  saveRemoteSyncConnection(
    createRemoteSyncConnection(artifact, {
      deviceDisplayName: clientId,
      eventKeys,
    })
  );
}

async function runContract(): Promise<void> {
  __resetRemoteSyncContractDb();
  __resetRemoteSyncContractScoutProfiles();

  assert.deepEqual(
    createCanonicalDocumentIdentity({
      documentType: 'match-scouting-entry',
      payload: scoutingEntry(),
    }),
    {
      documentType: 'match-scouting-entry',
      documentId: '2026miket::qm1::3314::red',
      scopeKey: '2026miket',
    },
    'match scouting identity preserves its transport-independent record id'
  );
  assert.deepEqual(
    createCanonicalDocumentIdentity({
      documentType: 'pit-scouting-entry',
      payload: {
        id: 'random-local-pit-id',
        teamNumber: 3314,
        eventKey: ' 2026MIKET ',
        scoutName: 'Scout A',
        timestamp: 1_000,
        gameData: {},
      },
    }),
    {
      documentType: 'pit-scouting-entry',
      documentId: '2026miket:3314',
      scopeKey: '2026miket',
    },
    'pit scouting identity converges on one team per event instead of a random local id'
  );
  assert.deepEqual(
    createCanonicalDocumentIdentity({
      documentType: 'scout-profile',
      scoutName: '  Scout   A  ',
    }),
    {
      documentType: 'scout-profile',
      documentId: 'scout a',
    },
    'Scout profile identity is season-wide and normalized without an Event scope key'
  );
  assert.deepEqual(
    inspectScoutNameCollision(['Scout A'], ' scout   a '),
    {
      status: 'collision',
      normalizedName: 'scout a',
      existingName: 'Scout A',
    },
    'an existing normalized Scout name requires an explicit collision decision'
  );

  const existingScoutProfile = {
    scout: {
      name: 'Scout A',
      stakes: 10,
      stakesFromPredictions: 8,
      totalPredictions: 2,
      correctPredictions: 1,
      currentStreak: 1,
      longestStreak: 2,
      detailedCommentsCount: 3,
      createdAt: 100,
      lastUpdated: 200,
    },
    predictions: [
      {
        id: 'local-qm1',
        scoutName: 'Scout A',
        eventKey: '2026MIKET',
        matchNumber: 1,
        predictedWinner: 'red',
        timestamp: 100,
        verified: false,
      },
    ],
    achievements: [
      {
        id: 'local-first',
        achievementId: 'first',
        scoutName: 'Scout A',
        unlockedAt: 150,
        progress: 100,
      },
    ],
  } satisfies ScoutProfileSyncPayload;
  const incomingScoutProfile = {
    scout: {
      name: ' scout   a ',
      stakes: 12,
      stakesFromPredictions: 9,
      totalPredictions: 3,
      correctPredictions: 2,
      currentStreak: 2,
      longestStreak: 3,
      detailedCommentsCount: 2,
      createdAt: 120,
      lastUpdated: 300,
    },
    predictions: [
      {
        id: 'remote-qm1',
        scoutName: ' scout   a ',
        eventKey: '2026miket',
        matchNumber: 1,
        predictedWinner: 'blue',
        timestamp: 200,
        verified: false,
      },
      {
        id: 'remote-qm2',
        scoutName: ' scout   a ',
        eventKey: '2026miket',
        matchNumber: 2,
        predictedWinner: 'red',
        timestamp: 250,
        verified: false,
      },
    ],
    achievements: [
      {
        id: 'remote-first',
        achievementId: 'first',
        scoutName: ' scout   a ',
        unlockedAt: 140,
        progress: 50,
      },
    ],
  } satisfies ScoutProfileSyncPayload;
  assert.deepEqual(
    reconcileScoutProfile(existingScoutProfile, incomingScoutProfile),
    {
      status: 'upsert',
      payload: {
        scout: {
          name: 'Scout A',
          stakes: 12,
          stakesFromPredictions: 9,
          totalPredictions: 3,
          correctPredictions: 2,
          currentStreak: 2,
          longestStreak: 3,
          detailedCommentsCount: 3,
          createdAt: 100,
          lastUpdated: 300,
        },
        predictions: [
          {
            id: 'remote-qm1',
            scoutName: 'Scout A',
            eventKey: '2026miket',
            matchNumber: 1,
            predictedWinner: 'blue',
            timestamp: 200,
            verified: false,
          },
          {
            id: 'remote-qm2',
            scoutName: 'Scout A',
            eventKey: '2026miket',
            matchNumber: 2,
            predictedWinner: 'red',
            timestamp: 250,
            verified: false,
          },
        ],
        achievements: [
          {
            id: 'remote-first',
            achievementId: 'first',
            scoutName: 'Scout A',
            unlockedAt: 140,
            progress: 100,
          },
        ],
      },
    },
    'Scout profile reconciliation durably merges aggregate state, predictions, and achievements'
  );
  assert.equal(
    reconcileScoutProfile(existingScoutProfile, {
      ...existingScoutProfile,
      predictions: existingScoutProfile.predictions.map(prediction => ({
        ...prediction,
        id: 'same-prediction-from-another-transport',
        eventKey: prediction.eventKey.toLowerCase(),
      })),
    }).status,
    'no-op',
    'mixed transports preserve one logical prediction despite transport-local row ids'
  );
  const profileCandidate = createScoutProfileSyncDocumentCandidate(incomingScoutProfile);
  assert.deepEqual(
    {
      documentId: profileCandidate.documentId,
      documentType: profileCandidate.documentType,
      scopeKey: profileCandidate.scopeKey,
      tombstone: profileCandidate.tombstone,
    },
    {
      documentId: 'scout a',
      documentType: 'scout-profile',
      scopeKey: undefined,
      tombstone: false,
    },
    'Scout profile canonical documents are season-wide and keyed by normalized Scout name'
  );
  const canonicalProfileReconciliation = reconcileCanonicalDocumentCandidate(
    {
      ...createScoutProfileSyncDocumentCandidate(existingScoutProfile),
      datasetId: 'identity-contract-dataset',
      revision: 1,
      updatedAt: 200,
      updatedByDeviceId: 'client-a',
    },
    profileCandidate
  );
  assert.deepEqual(
    canonicalProfileReconciliation.status === 'commit'
      ? {
          status: canonicalProfileReconciliation.status,
          documentId: canonicalProfileReconciliation.documentCandidate.documentId,
          scopeKey: canonicalProfileReconciliation.documentCandidate.scopeKey,
          detailedCommentsCount:
            canonicalProfileReconciliation.documentCandidate.payload.scout.detailedCommentsCount,
          predictionIds: canonicalProfileReconciliation.documentCandidate.payload.predictions.map(
            prediction => prediction.id
          ),
          achievementIds:
            canonicalProfileReconciliation.documentCandidate.payload.achievements.map(
              achievement => achievement.achievementId
            ),
        }
      : canonicalProfileReconciliation,
    {
      status: 'commit',
      documentId: 'scout a',
      scopeKey: undefined,
      detailedCommentsCount: 3,
      predictionIds: ['remote-qm1', 'remote-qm2'],
      achievementIds: ['first'],
    },
    'the authoritative reconciliation boundary commits a merged Scout profile candidate'
  );

  const profileAdapter = createInMemoryRemoteSyncAdapter();
  const profileDataset = await profileAdapter.createDataset({
    displayName: 'Scout profile reconciliation dataset',
    operatorDeviceId: 'profile-operator',
  });
  const profileCredential = await profileAdapter.createJoinCredential({
    datasetId: profileDataset.datasetId,
    operatorDeviceId: 'profile-operator',
  });
  const profileArtifact: DatasetJoinArtifact = {
    protocolVersion: 1,
    backend: 'firebase',
    datasetId: profileDataset.datasetId,
    datasetName: profileDataset.displayName,
    credentialId: profileCredential.credentialId,
    credentialSecret: profileCredential.secret,
    firebase: {
      projectId: 'profile-reconciliation-contract',
    },
    recommendedDefaults: {
      queueMode: 'local-first',
    },
  };
  for (const deviceId of ['profile-client-a', 'profile-client-b']) {
    await profileAdapter.joinDataset({
      artifact: profileArtifact,
      deviceId,
      deviceDisplayName: deviceId,
    });
  }
  await profileAdapter.pushDocuments({
    datasetId: profileDataset.datasetId,
    deviceId: 'profile-client-a',
    documents: [createScoutProfileSyncDocumentCandidate(existingScoutProfile)],
  });
  const mergedProfilePush = await profileAdapter.pushDocuments({
    datasetId: profileDataset.datasetId,
    deviceId: 'profile-client-b',
    documents: [profileCandidate],
  });
  assert.deepEqual(
    {
      revision: mergedProfilePush.committed[0]?.revision,
      detailedCommentsCount:
        mergedProfilePush.committed[0]?.payload.scout.detailedCommentsCount,
      predictionIds: mergedProfilePush.committed[0]?.payload.predictions.map(
        prediction => prediction.id
      ),
    },
    {
      revision: 2,
      detailedCommentsCount: 3,
      predictionIds: ['remote-qm1', 'remote-qm2'],
    },
    'the adapter stores the merged Scout profile rather than blindly replacing it'
  );

  useClient('offline-only');
  await saveScoutingEntry(scoutingEntry());
  assert.equal(loadRemoteSyncQueue().length, 0, 'offline local writes do not create a remote queue');

  const adapter = createInMemoryRemoteSyncAdapter();
  const dataset = await adapter.createDataset({
    displayName: 'Remote sync contract dataset',
    operatorDeviceId: 'operator',
  });
  const credential = await adapter.createJoinCredential({
    datasetId: dataset.datasetId,
    operatorDeviceId: 'operator',
  });
  const artifact: DatasetJoinArtifact = {
    protocolVersion: 1,
    backend: 'firebase',
    datasetId: dataset.datasetId,
    datasetName: dataset.displayName,
    credentialId: credential.credentialId,
    credentialSecret: credential.secret,
    firebase: {
      projectId: 'remote-sync-contract',
    },
    recommendedDefaults: {
      scopeKey: '2026miket',
      queueMode: 'local-first',
    },
  };

  useClient('join-prune-client');
  await saveScoutingEntry(
    scoutingEntry({
      id: '2026oncmp::qm9::3314::red',
      eventKey: '2026oncmp',
      matchKey: 'qm9',
      matchNumber: 9,
    })
  );
  const joinPruneConnection = createRemoteSyncConnection(artifact, {
    deviceDisplayName: 'join-prune-client',
    eventKeys: ['2026miket'],
  });
  const joinPrunePreview = await updateEventSyncScope(['2026miket'], {
    connection: joinPruneConnection,
  });
  assert.equal(
    joinPrunePreview.status,
    'confirmation-required',
    'joining with a narrow scope protects pre-join local records as unsynced writes'
  );
  assert.equal(loadRemoteSyncConnection(), null, 'join remains pending until local pruning is confirmed');
  assert.ok(
    __getRemoteSyncContractEntry('2026oncmp::qm9::3314::red'),
    'pending join preserves the pre-join local record'
  );
  const confirmedJoinPrune = await updateEventSyncScope(['2026miket'], {
    connection: joinPruneConnection,
    confirmDiscardUnsyncedWrites: true,
  });
  assert.equal(confirmedJoinPrune.status, 'applied', 'confirmed join applies the device-local scope');
  assert.equal(
    __getRemoteSyncContractEntry('2026oncmp::qm9::3314::red'),
    undefined,
    'confirmed join prunes the out-of-scope pre-join record locally'
  );

  attachClient('client-a', artifact);
  await saveScoutingEntry(scoutingEntry());
  assert.equal(loadRemoteSyncQueue().length, 1, 'local scouting entry is queued');
  assert.equal(getRemoteSyncQueueHealth().state, 'offline', 'pending queue is actionable');

  const firstSync = await syncScoutingEntries(adapter);
  assert.equal(firstSync.pushedCount, 1, 'queued entry is pushed');
  assert.equal(firstSync.cursor, 1, 'push advances the sync cursor');
  assert.equal(loadRemoteSyncQueue().length, 0, 'successful push drains the queue');
  const joinedDeviceId = loadRemoteSyncConnection()?.deviceId;
  assert.ok(joinedDeviceId, 'sync preserves the joined device identity');

  const portableSnapshot = await adapter.createPortableDatasetSnapshotServerLocal({
    datasetId: dataset.datasetId,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    snapshotLabel: 'Before qualification 12',
  });
  assert.deepEqual(
    {
      protocolVersion: portableSnapshot.protocolVersion,
      dataset: portableSnapshot.dataset,
      cursor: portableSnapshot.cursor,
      documentIds: portableSnapshot.documents.map(document => document.documentId),
      snapshotLabel: portableSnapshot.snapshotLabel,
      actorDeviceId: portableSnapshot.createdBy.actorDeviceId,
    },
    {
      protocolVersion: 1,
      dataset,
      cursor: 1,
      documentIds: ['2026miket::qm1::3314::red'],
      snapshotLabel: 'Before qualification 12',
      actorDeviceId: 'utilities-server-local',
    },
    'the privileged admin seam produces a portable current-state dataset snapshot'
  );
  assert.deepEqual(
    await adapter.getPortableDatasetSnapshotServerLocal(
      dataset.datasetId,
      portableSnapshot.snapshotId
    ),
    portableSnapshot,
    'portable snapshots are durably retrievable for later restore or migration'
  );
  const unconfirmedRestore = await adapter.restorePortableDatasetSnapshotServerLocal({
    datasetId: dataset.datasetId,
    snapshot: portableSnapshot,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    warningAccepted: false,
    typedDatasetName: dataset.displayName,
  });
  assert.deepEqual(
    unconfirmedRestore,
    {
      status: 'confirmation-required',
      requiredDatasetName: dataset.displayName,
    },
    'server-local destructive restore requires both the warning and typed dataset name'
  );

  const joinedOverview = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
  });
  assert.deepEqual(
    {
      datasetId: joinedOverview.datasetId,
      documentCount: joinedOverview.summary.documentCount,
      joinedDeviceCount: joinedOverview.summary.joinedDeviceCount,
      currentCursor: joinedOverview.summary.currentCursor,
      hasCreatedAt: joinedOverview.summary.createdAt > 0,
      hasLastChangedAt: (joinedOverview.summary.lastChangedAt ?? 0) > 0,
      cleanupCapableDevices: joinedOverview.cleanupCapableDevices,
      recentRestoreEvents: joinedOverview.recentRestoreEvents,
    },
    {
      datasetId: dataset.datasetId,
      documentCount: 1,
      joinedDeviceCount: 1,
      currentCursor: 1,
      hasCreatedAt: true,
      hasLastChangedAt: true,
      cleanupCapableDevices: [],
      recentRestoreEvents: [],
    },
    'an ordinary joined device can read broad dataset health without privileged state'
  );
  await assert.rejects(
    () =>
      adapter.getJoinedDatasetOverview({
        datasetId: dataset.datasetId,
        deviceId: 'not-joined',
      }),
    /not joined/,
    'dataset health remains limited to joined devices'
  );

  const unprovisionedCleanupCredential = await adapter.createCleanupCredential({
    datasetId: dataset.datasetId,
    operatorDeviceId: joinedDeviceId,
  });
  const expiredCleanupCredential = await adapter.createCleanupCredential({
    datasetId: dataset.datasetId,
    operatorDeviceId: 'operator',
    expiresAt: 1,
  });
  await assert.rejects(
    () =>
      adapter.provisionCleanupAuthority({
        datasetId: dataset.datasetId,
        deviceId: joinedDeviceId,
        credentialId: credential.credentialId,
        credentialSecret: credential.secret,
      }),
    /Cleanup credential not found/,
    'an ordinary Dataset join credential cannot grant cleanup authority'
  );
  await assert.rejects(
    () =>
      adapter.provisionCleanupAuthority({
        datasetId: dataset.datasetId,
        deviceId: joinedDeviceId,
        credentialId: unprovisionedCleanupCredential.credentialId,
        credentialSecret: 'incorrect-secret',
      }),
    /secret does not match/,
    'cleanup authority requires the Cleanup credential secret'
  );
  await assert.rejects(
    () =>
      adapter.provisionCleanupAuthority({
        datasetId: dataset.datasetId,
        deviceId: joinedDeviceId,
        credentialId: expiredCleanupCredential.credentialId,
        credentialSecret: expiredCleanupCredential.secret,
      }),
    /expired/,
    'expired Cleanup credentials cannot grant cleanup authority'
  );
  await assert.rejects(
    () =>
      adapter.provisionCleanupAuthority({
        datasetId: dataset.datasetId,
        deviceId: 'not-joined',
        credentialId: unprovisionedCleanupCredential.credentialId,
        credentialSecret: unprovisionedCleanupCredential.secret,
      }),
    /not joined/,
    'cleanup authority can only be provisioned to a joined device'
  );
  const overviewWithoutCleanupAuthority = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
  });
  assert.deepEqual(
    overviewWithoutCleanupAuthority.cleanupCapableDevices,
    [],
    'credential creators and expired provisions are not shown as current cleanup authority'
  );
  await adapter.provisionCleanupAuthority({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    credentialId: unprovisionedCleanupCredential.credentialId,
    credentialSecret: unprovisionedCleanupCredential.secret,
  });
  const overviewWithCleanupAuthority = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
  });
  assert.deepEqual(
    overviewWithCleanupAuthority.cleanupCapableDevices,
    [
      {
        deviceId: joinedDeviceId,
        displayName: 'client-a',
      },
    ],
    'joined devices can see which device currently holds cleanup authority'
  );

  await adapter.recordDatasetEvent({
    datasetId: dataset.datasetId,
    eventId: 'backup-before-restore',
    eventType: 'backup',
    actorDeviceId: joinedDeviceId,
    actorDisplayName: 'client-a',
    occurredAt: 2_000,
    snapshotId: 'snapshot-backup',
    snapshotLabel: 'Routine 11:55 backup',
  });
  await adapter.recordDatasetEvent({
    datasetId: dataset.datasetId,
    eventId: 'restore-after-bad-import',
    eventType: 'restore',
    actorDeviceId: joinedDeviceId,
    actorDisplayName: 'client-a',
    occurredAt: 3_000,
    snapshotId: 'snapshot-good-state',
    snapshotLabel: 'Before qualification 12',
    reason: 'Undo accidental duplicate import',
  });
  const overviewWithRestore = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
  });
  assert.deepEqual(
    overviewWithRestore.recentRestoreEvents,
    [
      {
        eventId: 'restore-after-bad-import',
        actorDeviceId: joinedDeviceId,
        actorDisplayName: 'client-a',
        occurredAt: 3_000,
        snapshotId: 'snapshot-good-state',
        snapshotLabel: 'Before qualification 12',
        reason: 'Undo accidental duplicate import',
      },
    ],
    'shared history includes attributed restore context but excludes routine backup noise'
  );
  const overviewMarkup = renderToStaticMarkup(
    createElement(JoinedDatasetOverviewPanel, { overview: overviewWithRestore })
  );
  for (const visibleText of [
    'Dataset health',
    '1 canonical document',
    '1 joined device',
    'client-a',
    'Cleanup capable',
    'Before qualification 12',
    'snapshot-good-state',
    'Undo accidental duplicate import',
  ]) {
    assert.match(overviewMarkup, new RegExp(visibleText), 'joined overview shows ' + visibleText);
  }
  assert.doesNotMatch(
    overviewMarkup,
    /Routine 11:55 backup|snapshot-backup|cleanup credential|Create backup|Restore dataset/i,
    'joined overview does not render backup noise, credentials, or recovery controls'
  );

  attachClient('client-b', artifact);
  const secondSync = await syncScoutingEntries(adapter);
  assert.equal(secondSync.pulledCount, 1, 'second client catches up from cursor zero');
  assert.equal(
    __getRemoteSyncContractEntry('2026miket::qm1::3314::red')?.timestamp,
    1_000,
    'second client applied the canonical scouting entry'
  );
  assert.equal(loadRemoteSyncQueue().length, 0, 'remote pulls do not requeue entries');

  useClient('client-a');
  await saveScoutingEntry(
    scoutingEntry({
      timestamp: 900,
      comments: 'stale local overwrite',
    })
  );
  assert.equal(loadRemoteSyncQueue().length, 1, 'stale local write still enters the queue');

  const staleSync = await syncScoutingEntries(adapter);
  assert.equal(staleSync.cursor, 2, 'stale write produces an authoritative cursor echo');
  assert.equal(
    __getRemoteSyncContractEntry('2026miket::qm1::3314::red')?.timestamp,
    1_000,
    'stale client converges back to the authoritative scouting entry'
  );

  useClient('client-b');
  const catchUpAfterStale = await syncScoutingEntries(adapter);
  assert.equal(catchUpAfterStale.cursor, 2, 'second client can replay the conflict cursor');
  assert.equal(
    __getRemoteSyncContractEntry('2026miket::qm1::3314::red')?.timestamp,
    1_000,
    'authoritative conflict replay does not regress another client'
  );

  useClient('scoped-client');
  attachClient('scoped-client', artifact, ['2026miket', '2026oncmp']);
  await saveScoutingEntry(scoutingEntry());
  await saveScoutingEntry(
    scoutingEntry({
      id: '2026oncmp::qm2::3314::blue',
      eventKey: '2026ONCMP',
      matchKey: 'qm2',
      matchNumber: 2,
      allianceColor: 'blue',
      timestamp: 2_000,
    })
  );
  assert.equal(loadRemoteSyncQueue().length, 2, 'selected Event sync scope queues each selected event');

  const blockedScopeChange = await updateEventSyncScope(['2026miket']);
  assert.equal(
    blockedScopeChange.status,
    'confirmation-required',
    'scope reduction with unsynced writes requires confirmation'
  );
  assert.equal(blockedScopeChange.unsyncedWriteCount, 1, 'destructive scope change reports discarded writes');
  assert.deepEqual(
    getEventSyncScope().eventKeys,
    ['2026miket', '2026oncmp'],
    'blocked scope change preserves device configuration'
  );
  assert.ok(
    __getRemoteSyncContractEntry('2026oncmp::qm2::3314::blue'),
    'blocked scope change preserves local scouting records'
  );

  const appliedScopeChange = await updateEventSyncScope(['2026miket'], {
    confirmDiscardUnsyncedWrites: true,
  });
  assert.equal(appliedScopeChange.status, 'applied', 'confirmed destructive scope change is applied');
  assert.equal(appliedScopeChange.prunedRecordCount, 1, 'out-of-scope scouting records are pruned locally');
  assert.equal(appliedScopeChange.discardedQueueCount, 1, 'out-of-scope queued writes are discarded');
  assert.equal(
    __getRemoteSyncContractEntry('2026oncmp::qm2::3314::blue'),
    undefined,
    'Scope pruning removes only the out-of-scope local record'
  );
  assert.equal(loadRemoteSyncQueue().length, 1, 'in-scope queued writes survive Scope pruning');

  attachClient('tombstone-scope-client', artifact, ['2026miket', '2026oncmp']);
  await saveScoutingEntry(
    scoutingEntry({
      id: '2026oncmp::qm8::3314::red',
      eventKey: '2026oncmp',
      matchKey: 'qm8',
      matchNumber: 8,
      timestamp: 8_000,
    })
  );
  await syncScoutingEntries(adapter);
  await deleteScoutingEntry('2026oncmp::qm8::3314::red');
  assert.equal(loadRemoteSyncQueue()[0]?.operation, 'tombstone', 'local deletion queues a tombstone');
  const tombstoneScopeChange = await updateEventSyncScope(['2026miket']);
  assert.equal(
    tombstoneScopeChange.status,
    'confirmation-required',
    'scope reduction protects an out-of-scope queued tombstone'
  );
  assert.equal(tombstoneScopeChange.unsyncedWriteCount, 1, 'queued tombstone is counted as unsynced');
  assert.equal(loadRemoteSyncQueue().length, 1, 'blocked scope change preserves the queued tombstone');
  const confirmedTombstoneScopeChange = await updateEventSyncScope(['2026miket'], {
    confirmDiscardUnsyncedWrites: true,
  });
  assert.equal(confirmedTombstoneScopeChange.discardedQueueCount, 1, 'confirmation discards tombstone');

  attachClient('all-events-publisher', artifact, []);
  await saveScoutingEntry(
    scoutingEntry({
      id: '2026oncmp::qm3::3314::red',
      eventKey: '2026ONCMP',
      matchKey: 'qm3',
      matchNumber: 3,
      timestamp: 3_000,
    })
  );
  await syncScoutingEntries(adapter);

  attachClient('scope-widening-client', artifact, ['2026miket']);
  await syncScoutingEntries(adapter);
  assert.equal(
    __getRemoteSyncContractEntry('2026oncmp::qm3::3314::red'),
    undefined,
    'narrow scope does not retain another event'
  );

  const widerExportRead = await readScopedOnlineScoutingEntries(adapter, ['2026miket', '2026oncmp']);
  assert.equal(
    widerExportRead.entries.some(entry => entry.id === '2026oncmp::qm3::3314::red'),
    true,
    'Scoped online export can read a wider remote event subset'
  );
  assert.equal(
    __getRemoteSyncContractEntry('2026oncmp::qm3::3314::red'),
    undefined,
    'wider export reads do not retain the remote record locally'
  );
  assert.deepEqual(
    getEventSyncScope().eventKeys,
    ['2026miket'],
    'wider export reads do not widen Event sync scope'
  );

  await updateEventSyncScope(['2026miket', '2026oncmp']);
  await syncScoutingEntries(adapter);
  assert.equal(
    __getRemoteSyncContractEntry('2026oncmp::qm3::3314::red')?.timestamp,
    3_000,
    'widening Event sync scope replays previously skipped cursor history'
  );

  await updateEventSyncScope(['2026miket']);
  assert.deepEqual(
    getScopedOnlineExportDefault().eventKeys,
    ['2026miket'],
    'Scoped online export defaults from the current Event sync scope'
  );
  const exportSelection = createScopedOnlineExportSelection(['2026miket', '2026oncmp']);
  assert.deepEqual(
    exportSelection.eventKeys,
    ['2026miket', '2026oncmp'],
    'Scoped online export may read beyond the current replication scope'
  );
  assert.deepEqual(
    getEventSyncScope().eventKeys,
    ['2026miket'],
    'wider export reads do not widen local retention'
  );
  assert.deepEqual(
    loadRemoteSyncConnection()?.eventSyncScope.eventKeys,
    ['2026miket'],
    'export selection leaves the stored device configuration unchanged'
  );

  attachClient('profile-sync-client-a', artifact, ['2026miket']);
  __setRemoteSyncContractScoutProfile(existingScoutProfile);
  enqueueScoutProfileUpsert('Scout A');
  assert.equal(
    getRemoteSyncQueueHealth().pendingWrites,
    1,
    'a local Scout profile change enters the durable Remote sync queue'
  );
  await syncScoutingEntries(adapter);

  attachClient('profile-sync-client-b', artifact, ['2026oncmp']);
  await syncScoutingEntries(adapter);
  assert.deepEqual(
    __getRemoteSyncContractScoutProfile('scout a'),
    createScoutProfileSyncDocumentCandidate(existingScoutProfile).payload,
    'Scout profiles pull onto another joined device regardless of Event sync scope'
  );

  __setRemoteSyncContractScoutProfile(incomingScoutProfile);
  enqueueScoutProfileUpsert(' scout   a ');
  await syncScoutingEntries(adapter);

  useClient('profile-sync-client-a');
  await syncScoutingEntries(adapter);
  assert.deepEqual(
    {
      detailedCommentsCount:
        __getRemoteSyncContractScoutProfile('Scout A')?.scout.detailedCommentsCount,
      predictionIds: __getRemoteSyncContractScoutProfile('Scout A')?.predictions.map(
        prediction => prediction.id
      ),
    },
    {
      detailedCommentsCount: 3,
      predictionIds: ['remote-qm1', 'remote-qm2'],
    },
    'joined devices converge the merged durable Scout profile instead of replacing it'
  );

  const remoteCollisionProfile = {
    ...existingScoutProfile,
    scout: {
      ...existingScoutProfile.scout,
      name: 'Casey',
    },
    predictions: existingScoutProfile.predictions.map(prediction => ({
      ...prediction,
      id: 'casey-remote-qm1',
      scoutName: 'Casey',
    })),
    achievements: existingScoutProfile.achievements.map(achievement => ({
      ...achievement,
      id: 'casey-remote-first',
      scoutName: 'Casey',
    })),
  } satisfies ScoutProfileSyncPayload;
  __setRemoteSyncContractScoutProfile(remoteCollisionProfile);
  enqueueScoutProfileUpsert('Casey');
  await syncScoutingEntries(adapter);

  attachClient('profile-collision-client', artifact, ['2026miket']);
  const localCollisionProfile = {
    ...incomingScoutProfile,
    scout: {
      ...incomingScoutProfile.scout,
      name: ' casey ',
      detailedCommentsCount: 7,
    },
    predictions: incomingScoutProfile.predictions.map(prediction => ({
      ...prediction,
      id: 'casey-local-' + prediction.matchNumber,
      scoutName: ' casey ',
    })),
    achievements: incomingScoutProfile.achievements.map(achievement => ({
      ...achievement,
      id: 'casey-local-first',
      scoutName: ' casey ',
    })),
  } satisfies ScoutProfileSyncPayload;
  __setRemoteSyncContractScoutProfile(localCollisionProfile);
  enqueueScoutProfileUpsert(' casey ');
  await assert.rejects(
    () => syncScoutingEntries(adapter),
    error => error instanceof Error && error.name === 'ScoutNameCollisionError',
    'an unbound local Scout profile cannot silently merge into an existing normalized name'
  );
  assert.deepEqual(
    loadPendingScoutNameCollisions(dataset.datasetId).map(collision => ({
      documentId: collision.documentId,
      localName: collision.localName,
      remoteName: collision.remoteName,
    })),
    [
      {
        documentId: 'casey',
        localName: 'casey',
        remoteName: 'Casey',
      },
    ],
    'Scout-name collision details remain available for an explicit user choice'
  );
  await resolveScoutNameCollision({
    datasetId: dataset.datasetId,
    documentId: 'casey',
    decision: 'join-existing',
  });
  await syncScoutingEntries(adapter);
  assert.equal(
    __getRemoteSyncContractScoutProfile('Casey')?.scout.detailedCommentsCount,
    7,
    'confirming join-existing allows durable profile reconciliation to continue'
  );

  attachClient('local-export-client', artifact, ['2026miket']);
  await saveScoutingEntry(
    scoutingEntry({
      id: '2026miket::qm21::3314::red',
      matchKey: 'qm21',
      matchNumber: 21,
      timestamp: 21_000,
    })
  );
  const localExport = await createScoutingDataExport({ source: 'device-local' });
  assert.equal(localExport.scope.kind, 'device-local', 'local export identifies its source');
  assert.equal(
    localExport.scope.label,
    "Current device's local replica",
    'local export uses explicit replica wording'
  );
  assert.equal(
    localExport.scope.completeForRequestedScope,
    false,
    'local export never claims replica completeness'
  );
  assert.equal(
    localExport.warnings.unsyncedLocalChanges,
    1,
    'local export labels known queued scouting changes'
  );
  assert.equal(
    localExport.entries.some(entry => entry.id === '2026miket::qm21::3314::red'),
    true,
    'local export reads the current device replica without service access'
  );

  const scopedRemoteExport = await createScoutingDataExport(
    { source: 'scoped-online', eventKeys: ['2026miket'] },
    { adapter }
  );
  assert.deepEqual(
    scopedRemoteExport.scope,
    {
      kind: 'scoped-online',
      label: 'Selected events from Team dataset',
      completeForRequestedScope: true,
      eventKeys: ['2026miket'],
      allEvents: false,
    },
    'scoped online export labels the selected remote subset'
  );
  assert.equal(
    scopedRemoteExport.entries.some(entry => entry.eventKey.toLowerCase() === '2026oncmp'),
    false,
    'scoped online export excludes remote events outside its independent selection'
  );
  const allEventsScopedExport = await createScoutingDataExport(
    { source: 'scoped-online', eventKeys: [] },
    { adapter }
  );
  assert.equal(
    allEventsScopedExport.scope.kind === 'scoped-online' && allEventsScopedExport.scope.allEvents,
    true,
    'an all-events Event sync scope remains a valid scoped-export default'
  );

  const fullRemoteExport = await createScoutingDataExport(
    { source: 'full-online' },
    { adapter }
  );
  assert.deepEqual(
    fullRemoteExport.scope,
    {
      kind: 'full-online',
      label: 'Full Team dataset',
      completeForRequestedScope: true,
    },
    'full online export explicitly labels dataset-wide output'
  );
  assert.equal(
    fullRemoteExport.entries.some(entry => entry.eventKey.toLowerCase() === '2026oncmp'),
    true,
    'full online export includes scouting entries from every remote event'
  );
  assert.deepEqual(
    loadRemoteSyncConnection()?.eventSyncScope.eventKeys,
    ['2026miket'],
    'remote export choices leave the device Event sync scope unchanged'
  );

  const exportScopeMarkup = renderToStaticMarkup(
    createElement(ScoutingExportScopePanel, {
      connected: true,
      source: 'scoped-online',
      eventKeysText: '2026miket',
      pendingUnsyncedChanges: 2,
      localWarningConfirmationRequired: true,
      remoteFailure: 'Service unavailable',
      onSourceChange: () => undefined,
      onEventKeysTextChange: () => undefined,
      onConfirmLocalExport: () => undefined,
      onUseLocalFallback: () => undefined,
    })
  );
  assert.match(exportScopeMarkup, /Current device&#x27;s local replica/);
  assert.match(exportScopeMarkup, /Selected events from Team dataset/);
  assert.match(exportScopeMarkup, /Full Team dataset/);
  assert.match(exportScopeMarkup, /leave blank when the current scope is all events/);
  assert.match(exportScopeMarkup, /may be incomplete/);
  assert.match(exportScopeMarkup, /2 queued unsynced scouting changes/);
  assert.match(exportScopeMarkup, /Continue with local export/);
  assert.match(exportScopeMarkup, /Scoped online export failed/);
  assert.match(exportScopeMarkup, /Export current device&#x27;s local replica instead/);

  const ordinaryCleanupMarkup = renderToStaticMarkup(
    createElement(CleanupAuthorityPanel, {
      cleanupCapable: false,
      currentDeviceId: 'ordinary-device',
      joinedDevices: [],
      revocationTargetDeviceId: '',
      cleanupProvisioningArtifactText: '',
      cleanupTargetsText: '',
      cleanupReason: '',
      busy: false,
      onCleanupProvisioningArtifactTextChange: () => undefined,
      onCleanupTargetsTextChange: () => undefined,
      onCleanupReasonChange: () => undefined,
      onRevocationTargetDeviceIdChange: () => undefined,
      onProvision: () => undefined,
      onCleanup: () => undefined,
      onRevokeDevice: () => undefined,
    })
  );
  assert.match(ordinaryCleanupMarkup, /Provision cleanup authority/);
  assert.match(ordinaryCleanupMarkup, /Cleanup provisioning artifact/);
  assert.doesNotMatch(
    ordinaryCleanupMarkup,
    /Delete selected shared documents|Revoke selected device/,
    'ordinary devices do not receive destructive shared controls'
  );
  const recoveryArtifactWithoutDevice = {
    protocolVersion: 1,
    backend: 'firebase',
    datasetId: dataset.datasetId,
    datasetName: dataset.displayName,
    cleanupCredentialId: unprovisionedCleanupCredential.credentialId,
    cleanupCredentialSecret: unprovisionedCleanupCredential.secret,
    firebase: { projectId: 'remote-sync-contract' },
  };
  assert.equal(
    parseDatasetCleanupProvisioningArtifact(
      JSON.stringify(recoveryArtifactWithoutDevice)
    ).ok,
    false,
    'an operator recovery artifact is not itself a device cleanup grant'
  );
  assert.equal(
    parseDatasetCleanupProvisioningArtifact(
      JSON.stringify({
        ...recoveryArtifactWithoutDevice,
        provisionedDeviceId: joinedDeviceId,
      })
    ).ok,
    true,
    'Utilities can target a cleanup provisioning artifact to one joined device'
  );
  const privilegedCleanupMarkup = renderToStaticMarkup(
    createElement(CleanupAuthorityPanel, {
      cleanupCapable: true,
      currentDeviceId: joinedDeviceId,
      joinedDevices: [
        { deviceId: joinedDeviceId, displayName: 'client-a' },
        { deviceId: 'ordinary-cleanup-device', displayName: 'Ordinary cleanup device' },
      ],
      revocationTargetDeviceId: 'ordinary-cleanup-device',
      cleanupProvisioningArtifactText: '',
      cleanupTargetsText: 'match-scouting-entry|2026miket::qm1::3314::red',
      cleanupReason: 'Invalid entry',
      busy: false,
      onCleanupProvisioningArtifactTextChange: () => undefined,
      onCleanupTargetsTextChange: () => undefined,
      onCleanupReasonChange: () => undefined,
      onRevocationTargetDeviceIdChange: () => undefined,
      onProvision: () => undefined,
      onCleanup: () => undefined,
      onRevokeDevice: () => undefined,
    })
  );
  assert.match(privilegedCleanupMarkup, /Cleanup authority active/);
  assert.match(privilegedCleanupMarkup, /Delete selected shared documents/);
  assert.match(privilegedCleanupMarkup, /replicated tombstones/);
  assert.match(privilegedCleanupMarkup, /does not change this device&#x27;s Event sync scope/);
  assert.match(privilegedCleanupMarkup, /Revoke joined device/);
  assert.match(privilegedCleanupMarkup, /Ordinary cleanup device/);
  assert.match(privilegedCleanupMarkup, /Revoke selected device/);
  assert.doesNotMatch(
    privilegedCleanupMarkup,
    />client-a</,
    'the cleanup UI does not offer the current device as a revocation target'
  );

  const ordinaryCleanupDevice = await adapter.joinDataset({
    artifact,
    deviceId: 'ordinary-cleanup-device',
    deviceDisplayName: 'Ordinary cleanup device',
  });
  const cleanupTarget = {
    documentType: 'match-scouting-entry' as const,
    documentId: '2026miket::qm1::3314::red',
  };
  await assert.rejects(
    () =>
      adapter.cleanupCanonicalDocuments({
        datasetId: dataset.datasetId,
        deviceId: ordinaryCleanupDevice.deviceId,
        targets: [cleanupTarget],
        reason: 'Remove invalid shared scouting entry',
      }),
    /does not have cleanup authority/,
    'ordinary joined devices cannot destructively clean shared documents'
  );

  const beforeCleanup = Date.now();
  const cleanupResult = await adapter.cleanupCanonicalDocuments({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    targets: [cleanupTarget],
    reason: 'Remove invalid shared scouting entry',
  });
  assert.deepEqual(
    {
      cleanedDocumentCount: cleanupResult.cleanedDocuments.length,
      tombstone: cleanupResult.cleanedDocuments[0]?.tombstone,
      updatedByDeviceId: cleanupResult.cleanedDocuments[0]?.updatedByDeviceId,
      actorDeviceId: cleanupResult.event.actorDeviceId,
      actorDisplayName: cleanupResult.event.actorDisplayName,
      reason: cleanupResult.event.reason,
      occurredAfterRequest: cleanupResult.event.occurredAt >= beforeCleanup,
    },
    {
      cleanedDocumentCount: 1,
      tombstone: true,
      updatedByDeviceId: joinedDeviceId,
      actorDeviceId: joinedDeviceId,
      actorDisplayName: 'client-a',
      reason: 'Remove invalid shared scouting entry',
      occurredAfterRequest: true,
    },
    'cleanup authority creates an attributed replicated tombstone and audit event'
  );
  const overviewAfterCleanup = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: ordinaryCleanupDevice.deviceId,
  });
  assert.deepEqual(
    overviewAfterCleanup.recentCleanupEvents[0],
    cleanupResult.event,
    'ordinary joined devices can see the recent attributed cleanup action'
  );
  const cleanupHistoryMarkup = renderToStaticMarkup(
    createElement(JoinedDatasetOverviewPanel, { overview: overviewAfterCleanup })
  );
  assert.match(cleanupHistoryMarkup, /Recent shared cleanups/);
  assert.match(cleanupHistoryMarkup, /client-a/);
  assert.match(cleanupHistoryMarkup, /Remove invalid shared scouting entry/);

  const revocationTarget = await adapter.joinDataset({
    artifact,
    deviceId: 'revocation-target',
    deviceDisplayName: 'Revocation target',
  });
  const targetedRevocation = await adapter.revokeJoinedDevice({
    datasetId: dataset.datasetId,
    actorDeviceId: joinedDeviceId,
    targetDeviceId: revocationTarget.deviceId,
  });
  assert.deepEqual(
    {
      targetDeviceId: targetedRevocation.device.deviceId,
      revoked: Boolean(targetedRevocation.device.revokedAt),
    },
    {
      targetDeviceId: revocationTarget.deviceId,
      revoked: true,
    },
    'a cleanup-capable device can revoke one specific joined device'
  );
  await assert.rejects(
    () =>
      adapter.pushDocuments({
        datasetId: dataset.datasetId,
        deviceId: revocationTarget.deviceId,
        documents: [],
      }),
    /revoked/,
    'a revoked device cannot push Remote sync writes'
  );
  await assert.rejects(
    () =>
      adapter.pullChanges({
        datasetId: dataset.datasetId,
        deviceId: revocationTarget.deviceId,
        afterCursor: 0,
      }),
    /revoked/,
    'a revoked device cannot pull Remote sync changes'
  );
  const overviewAfterTargetedRevocation = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: ordinaryCleanupDevice.deviceId,
  });
  assert.equal(
    overviewAfterTargetedRevocation.joinedDevices.some(
      device => device.deviceId === revocationTarget.deviceId
    ),
    false,
    'targeted revocation leaves the target out of the active joined-device list'
  );
  assert.equal(
    overviewAfterTargetedRevocation.joinedDevices.some(
      device => device.deviceId === ordinaryCleanupDevice.deviceId
    ),
    true,
    'targeted revocation leaves unrelated devices joined'
  );
  const expiringCleanupCredential = await adapter.createCleanupCredential({
    datasetId: dataset.datasetId,
    operatorDeviceId: 'operator',
    expiresAt: Date.now() + 20,
  });
  const expiringCleanupDevice = await adapter.joinDataset({
    artifact,
    deviceId: 'expiring-cleanup-device',
    deviceDisplayName: 'Expiring cleanup device',
  });
  const expiryRevocationTarget = await adapter.joinDataset({
    artifact,
    deviceId: 'expiry-revocation-target',
    deviceDisplayName: 'Expiry revocation target',
  });
  await adapter.provisionCleanupAuthority({
    datasetId: dataset.datasetId,
    deviceId: expiringCleanupDevice.deviceId,
    credentialId: expiringCleanupCredential.credentialId,
    credentialSecret: expiringCleanupCredential.secret,
    credentialExpiresAt: expiringCleanupCredential.expiresAt,
  });
  await new Promise(resolve => setTimeout(resolve, 30));
  await assert.rejects(
    () =>
      adapter.revokeJoinedDevice({
        datasetId: dataset.datasetId,
        actorDeviceId: expiringCleanupDevice.deviceId,
        targetDeviceId: expiryRevocationTarget.deviceId,
      }),
    /does not have cleanup authority/,
    'expired cleanup authority cannot revoke a joined device'
  );

  attachClient('revoked-lifecycle-client', artifact);
  await syncScoutingEntries(adapter);
  const revokedLifecycleConnection = loadRemoteSyncConnection();
  assert.ok(revokedLifecycleConnection);
  const revokedPeriodEntry = scoutingEntry({
    id: '2026miket::qm77::3314::red',
    matchKey: 'qm77',
    matchNumber: 77,
  });
  await saveScoutingEntry(revokedPeriodEntry);
  const revokedPeriodProfile = {
    ...incomingScoutProfile,
    scout: { ...incomingScoutProfile.scout, name: 'Revoked Local Scout' },
    predictions: [],
    achievements: [],
  } satisfies ScoutProfileSyncPayload;
  __setRemoteSyncContractScoutProfile(revokedPeriodProfile);
  enqueueScoutProfileUpsert(revokedPeriodProfile.scout.name);
  assert.equal(loadRemoteSyncQueue().length, 1);
  assert.equal(loadScoutProfileQueue().length, 1);
  await adapter.revokeJoinedDevice({
    datasetId: dataset.datasetId,
    actorDeviceId: joinedDeviceId,
    targetDeviceId: revokedLifecycleConnection.deviceId,
  });
  await assert.rejects(
    () => syncScoutingEntries(adapter),
    /revoked/,
    'a revoked device is hard-disconnected on its next Remote sync attempt'
  );
  assert.equal(loadRemoteSyncConnection(), null, 'revocation removes the saved Remote sync join');
  assert.equal(loadRemoteSyncQueue().length, 0, 'revocation discards queued scouting writes');
  assert.equal(loadScoutProfileQueue().length, 0, 'revocation discards queued Scout profile writes');
  assert.deepEqual(
    __getRemoteSyncContractEntry(revokedPeriodEntry.id),
    revokedPeriodEntry,
    'revocation preserves local scouting data'
  );
  assert.deepEqual(
    __getRemoteSyncContractScoutProfile(revokedPeriodProfile.scout.name),
    revokedPeriodProfile,
    'revocation preserves local Scout profile data'
  );
  disconnectRemoteSyncDeviceIfRevoked(
    new RemoteSyncDeviceRevokedError(
      revokedLifecycleConnection.datasetId,
      revokedLifecycleConnection.deviceId
    ),
    revokedLifecycleConnection
  );

  attachClient('revoked-lifecycle-client', artifact);
  const rejoinedRecoveryConnection = loadRemoteSyncConnection();
  assert.ok(rejoinedRecoveryConnection);
  const rejoinedRecoveryDevice = await adapter.joinDataset(
    createJoinDatasetInputFromConnection(rejoinedRecoveryConnection)
  );
  const afterDisconnectEntry = scoutingEntry({
    id: '2026miket::qm78::3314::red',
    matchKey: 'qm78',
    matchNumber: 78,
    timestamp: Date.now() + 1_000,
  });
  await saveScoutingEntry(afterDisconnectEntry);
  const preparedRecovery = await preparePostRejoinRecoveryBatch();
  assert.deepEqual(
    preparedRecovery.documents.map(document => document.documentId).sort(),
    [revokedPeriodEntry.id, afterDisconnectEntry.id, 'revoked local scout'].sort(),
    'post-rejoin preparation combines discarded queued work with local changes made while disconnected'
  );
  const recoveryCanonicalProfile = {
    ...existingScoutProfile,
    scout: { ...existingScoutProfile.scout, name: 'Recovery Conflict Scout' },
    predictions: existingScoutProfile.predictions.map(prediction => ({
      ...prediction,
      scoutName: 'Recovery Conflict Scout',
    })),
    achievements: [],
  } satisfies ScoutProfileSyncPayload;
  await adapter.pushDocuments({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    documents: [createScoutProfileSyncDocumentCandidate(recoveryCanonicalProfile)],
  });
  const conflictingRecoveryProfile = {
    ...recoveryCanonicalProfile,
    predictions: recoveryCanonicalProfile.predictions.map(prediction => ({
      ...prediction,
      predictedWinner: 'blue' as const,
    })),
  } satisfies ScoutProfileSyncPayload;
  const submittedRecoveryBatch = await adapter.submitRejoinRecoveryBatch({
    datasetId: dataset.datasetId,
    deviceId: rejoinedRecoveryDevice.deviceId,
    revokedDeviceId: revokedLifecycleConnection.deviceId,
    documents: [
      {
        documentId: revokedPeriodEntry.id,
        documentType: 'match-scouting-entry',
        scopeKey: revokedPeriodEntry.eventKey.toLowerCase(),
        tombstone: false,
        payload: revokedPeriodEntry,
      },
      createScoutProfileSyncDocumentCandidate(conflictingRecoveryProfile),
    ],
  });
  assert.deepEqual(
    {
      revokedDeviceId: submittedRecoveryBatch.revokedDeviceId,
      submittedByDeviceId: submittedRecoveryBatch.submittedByDeviceId,
      status: submittedRecoveryBatch.status,
      entryStatuses: submittedRecoveryBatch.entries.map(entry => entry.status),
    },
    {
      revokedDeviceId: revokedLifecycleConnection.deviceId,
      submittedByDeviceId: rejoinedRecoveryDevice.deviceId,
      status: 'pending',
      entryStatuses: ['pending', 'pending'],
    },
    'a normally rejoined device can submit revoked-period work as a separate review batch'
  );
  await assert.rejects(
    () =>
      adapter.listRejoinRecoveryBatches({
        datasetId: dataset.datasetId,
        deviceId: rejoinedRecoveryDevice.deviceId,
      }),
    /cleanup authority/,
    'ordinary joined devices cannot inspect privileged rejoin recovery batches'
  );
  const pendingRecoveryBatches = await adapter.listRejoinRecoveryBatches({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
  });
  assert.deepEqual(
    pendingRecoveryBatches.map(batch => batch.batchId),
    [submittedRecoveryBatch.batchId],
    'a cleanup-capable device can inspect pending rejoin recovery batches'
  );
  const recoveryPreview = await adapter.previewRejoinRecoveryBatch({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    batchId: submittedRecoveryBatch.batchId,
  });
  assert.deepEqual(
    recoveryPreview.entries.map(entry => entry.previewStatus),
    ['smart-merge', 'manual-conflict'],
    'privileged review previews normal smart merge and escalates only specific conflicts'
  );
  const preparationMarkup = renderToStaticMarkup(
    createElement(PostRejoinRecoveryPanel, {
      prepared: preparedRecovery,
      busy: false,
      onSubmit: () => undefined,
    })
  );
  assert.match(preparationMarkup, /3 recoverable local entries/);
  assert.match(preparationMarkup, /Submit for privileged review/);
  const reviewMarkup = renderToStaticMarkup(
    createElement(RejoinRecoveryReviewPanel, {
      batches: [submittedRecoveryBatch],
      selectedBatchId: submittedRecoveryBatch.batchId,
      preview: recoveryPreview,
      busy: false,
      onSelectBatch: () => undefined,
      onDecision: () => undefined,
      onReconsider: () => undefined,
    })
  );
  assert.match(reviewMarkup, /Recovery batch review/);
  assert.match(reviewMarkup, /Manual conflict/);
  assert.match(reviewMarkup, /Use submitted/);
  assert.match(reviewMarkup, /Hold entry/);
  const partiallyApprovedRecovery = await adapter.reviewRejoinRecoveryBatch({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    batchId: submittedRecoveryBatch.batchId,
    decisions: [
      {
        entryId: submittedRecoveryBatch.entries[0]!.entryId,
        action: 'approve',
        resolution: 'smart-merge',
      },
    ],
  });
  assert.deepEqual(
    {
      status: partiallyApprovedRecovery.status,
      entryStatuses: partiallyApprovedRecovery.entries.map(entry => entry.status),
    },
    {
      status: 'partially-reviewed',
      entryStatuses: ['imported', 'pending'],
    },
    'privileged review can approve only part of a recovery batch'
  );
  const heldRecovery = await adapter.reviewRejoinRecoveryBatch({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    batchId: submittedRecoveryBatch.batchId,
    decisions: [
      {
        entryId: submittedRecoveryBatch.entries[1]!.entryId,
        action: 'reject',
      },
    ],
  });
  assert.deepEqual(
    {
      status: heldRecovery.status,
      entryStatuses: heldRecovery.entries.map(entry => entry.status),
    },
    {
      status: 'completed',
      entryStatuses: ['imported', 'held'],
    },
    'rejected recovery entries move to a separate holding state'
  );
  const reconsideredRecovery = await adapter.reconsiderRejectedRejoinEntries({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
    batchId: submittedRecoveryBatch.batchId,
    entryIds: [submittedRecoveryBatch.entries[1]!.entryId],
  });
  assert.deepEqual(
    {
      status: reconsideredRecovery.status,
      entryStatuses: reconsideredRecovery.entries.map(entry => entry.status),
    },
    {
      status: 'partially-reviewed',
      entryStatuses: ['imported', 'pending'],
    },
    'held recovery entries can be reconsidered later'
  );

  const serverLocalRevocationTarget = await adapter.joinDataset({
    artifact,
    deviceId: 'server-local-revocation-target',
    deviceDisplayName: 'Server-local revocation target',
  });
  const serverLocalRevocation = await adapter.revokeJoinedDeviceServerLocal({
    datasetId: dataset.datasetId,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    targetDeviceId: serverLocalRevocationTarget.deviceId,
  });
  assert.deepEqual(
    {
      targetDeviceId: serverLocalRevocation.device.deviceId,
      revoked: Boolean(serverLocalRevocation.device.revokedAt),
    },
    {
      targetDeviceId: serverLocalRevocationTarget.deviceId,
      revoked: true,
    },
    'the server-local path has ultimate authority to revoke one joined device'
  );
  await assert.rejects(
    () =>
      adapter.pullChanges({
        datasetId: dataset.datasetId,
        deviceId: serverLocalRevocationTarget.deviceId,
        afterCursor: 0,
      }),
    /revoked/
  );

  const serverLocalCleanup = await adapter.cleanupCanonicalDocumentsServerLocal({
    datasetId: dataset.datasetId,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    targets: [
      {
        documentType: 'match-scouting-entry',
        documentId: '2026oncmp::qm3::3314::red',
      },
    ],
    reason: 'Server-local emergency cleanup',
  });
  assert.deepEqual(
    {
      cleanedDocumentCount: serverLocalCleanup.cleanedDocuments.length,
      actorDeviceId: serverLocalCleanup.event.actorDeviceId,
      actorDisplayName: serverLocalCleanup.event.actorDisplayName,
    },
    {
      cleanedDocumentCount: 1,
      actorDeviceId: 'utilities-server-local',
      actorDisplayName: 'Utilities server-local operator',
    },
    'the server-local privileged path can perform an attributed destructive shared action'
  );

  await adapter.deprovisionCleanupAuthority({
    datasetId: dataset.datasetId,
    deviceId: joinedDeviceId,
  });
  const overviewAfterDeprovision = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: ordinaryCleanupDevice.deviceId,
  });
  assert.equal(
    overviewAfterDeprovision.cleanupCapableDevices.some(
      device => device.deviceId === joinedDeviceId
    ),
    false,
    'disconnect/reset deprovisioning removes stale visible cleanup authority'
  );
  await assert.rejects(
    () =>
      adapter.cleanupCanonicalDocuments({
        datasetId: dataset.datasetId,
        deviceId: joinedDeviceId,
        targets: [cleanupTarget],
      }),
    /does not have cleanup authority/,
    'a deprovisioned device cannot perform later destructive shared actions'
  );

  const beforeRestoreHealth = await adapter.getDatasetHealth(dataset.datasetId);
  const restoreResult = await adapter.restorePortableDatasetSnapshotServerLocal({
    datasetId: dataset.datasetId,
    snapshot: portableSnapshot,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    warningAccepted: true,
    typedDatasetName: dataset.displayName,
    reason: 'Undo accidental cleanup before qualification 12',
  });
  assert.equal(restoreResult.status, 'restored');
  if (restoreResult.status !== 'restored') {
    throw new Error('Expected the confirmed server-local restore to complete.');
  }
  assert.deepEqual(
    {
      safetySnapshotLabel: restoreResult.safetySnapshot?.snapshotLabel,
      restoredDocumentIds: restoreResult.restoredDocuments
        .filter(document => !document.tombstone)
        .map(document => document.documentId),
      cursorAdvanced: restoreResult.cursor > beforeRestoreHealth.currentCursor,
      eventType: restoreResult.event.eventType,
      snapshotId: restoreResult.event.snapshotId,
      snapshotLabel: restoreResult.event.snapshotLabel,
      actorDisplayName: restoreResult.event.actorDisplayName,
      reason: restoreResult.event.reason,
    },
    {
      safetySnapshotLabel: 'Pre-restore safety snapshot for ' + portableSnapshot.snapshotLabel,
      restoredDocumentIds: ['2026miket::qm1::3314::red'],
      cursorAdvanced: true,
      eventType: 'restore',
      snapshotId: portableSnapshot.snapshotId,
      snapshotLabel: portableSnapshot.snapshotLabel,
      actorDisplayName: 'Utilities server-local operator',
      reason: 'Undo accidental cleanup before qualification 12',
    },
    'confirmed restore replaces canonical state, keeps the cursor monotonic, and creates a safety snapshot'
  );
  const restoreChanges = await adapter.pullChanges({
    datasetId: dataset.datasetId,
    deviceId: ordinaryCleanupDevice.deviceId,
    afterCursor: beforeRestoreHealth.currentCursor,
  });
  assert.equal(
    restoreChanges.changes.some(
      change =>
        change.documentId === '2026miket::qm1::3314::red' && !change.document.tombstone
    ),
    true,
    'joined devices can replay the restored canonical state from their existing cursor'
  );
  const overviewAfterRestore = await adapter.getJoinedDatasetOverview({
    datasetId: dataset.datasetId,
    deviceId: ordinaryCleanupDevice.deviceId,
  });
  assert.deepEqual(
    overviewAfterRestore.recentRestoreEvents[0],
    {
      eventId: restoreResult.event.eventId,
      actorDeviceId: 'utilities-server-local',
      actorDisplayName: 'Utilities server-local operator',
      occurredAt: restoreResult.event.occurredAt,
      snapshotId: portableSnapshot.snapshotId,
      snapshotLabel: portableSnapshot.snapshotLabel,
      reason: 'Undo accidental cleanup before qualification 12',
    },
    'ordinary joined devices see attributed restore identity and reason without routine backup events'
  );

  const createSnapshot = adapter.createPortableDatasetSnapshotServerLocal.bind(adapter);
  adapter.createPortableDatasetSnapshotServerLocal = async input => {
    if (input.snapshotLabel.startsWith('Pre-restore safety snapshot')) {
      throw new Error('simulated safety snapshot storage failure');
    }
    return createSnapshot(input);
  };
  const beforeFailedSafetySnapshot = await adapter.getDatasetHealth(dataset.datasetId);
  const blockedEmergencyRestore = await adapter.restorePortableDatasetSnapshotServerLocal({
    datasetId: dataset.datasetId,
    snapshot: portableSnapshot,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    warningAccepted: true,
    typedDatasetName: dataset.displayName,
  });
  assert.equal(blockedEmergencyRestore.status, 'emergency-override-required');
  if (blockedEmergencyRestore.status !== 'emergency-override-required') {
    throw new Error('Expected safety snapshot failure to issue an emergency override token.');
  }
  assert.equal(
    blockedEmergencyRestore.safetySnapshotError,
    'simulated safety snapshot storage failure'
  );
  assert.ok(
    blockedEmergencyRestore.emergencyOverrideToken,
    'safety snapshot failure issues a challenge for a separate override request'
  );
  assert.equal(
    (await adapter.getDatasetHealth(dataset.datasetId)).currentCursor,
    beforeFailedSafetySnapshot.currentCursor,
    'safety snapshot failure does not mutate the Team dataset before override'
  );
  const emergencyRestore = await adapter.restorePortableDatasetSnapshotServerLocal({
    datasetId: dataset.datasetId,
    snapshot: portableSnapshot,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
    warningAccepted: true,
    typedDatasetName: dataset.displayName,
    emergencyOverrideToken: blockedEmergencyRestore.emergencyOverrideToken,
    reason: 'Competition emergency recovery',
  });
  assert.equal(emergencyRestore.status, 'restored');
  if (emergencyRestore.status !== 'restored') {
    throw new Error('Expected explicit emergency override to complete the restore.');
  }
  assert.equal(
    emergencyRestore.safetySnapshot,
    undefined,
    'emergency override reports that no pre-restore safety snapshot was created'
  );

  const globalRejoinReset = await adapter.resetDatasetForRejoinServerLocal({
    datasetId: dataset.datasetId,
    actorDeviceId: 'utilities-server-local',
    actorDisplayName: 'Utilities server-local operator',
  });
  assert.equal(globalRejoinReset.operation, 'global-rejoin-reset');
  assert.ok(
    globalRejoinReset.revokedDeviceIds.includes(ordinaryCleanupDevice.deviceId),
    'global rejoin reset revokes every active joined device'
  );
  assert.ok(
    globalRejoinReset.revokedJoinCredentialIds.includes(credential.credentialId),
    'global rejoin reset revokes every active join credential'
  );
  assert.notEqual(
    globalRejoinReset.replacementJoinCredential.credentialId,
    credential.credentialId,
    'global rejoin reset issues a replacement join credential'
  );
  await assert.rejects(
    () =>
      adapter.joinDataset({
        artifact,
        deviceId: 'old-artifact-after-global-reset',
        deviceDisplayName: 'Old artifact after global reset',
      }),
    /credential has been revoked/,
    'global rejoin reset invalidates old reusable join artifacts'
  );
  await assert.rejects(
    () =>
      adapter.pullChanges({
        datasetId: dataset.datasetId,
        deviceId: ordinaryCleanupDevice.deviceId,
        afterCursor: 0,
      }),
    /revoked/,
    'global rejoin reset hard-disconnects previously joined devices'
  );
  const rejoinedAfterGlobalReset = await adapter.joinDataset({
    artifact: {
      ...artifact,
      credentialId: globalRejoinReset.replacementJoinCredential.credentialId,
      credentialSecret: globalRejoinReset.replacementJoinCredential.secret,
    },
    deviceId: 'rejoined-after-global-reset',
    deviceDisplayName: 'Rejoined after global reset',
  });
  assert.equal(
    rejoinedAfterGlobalReset.deviceId,
    'rejoined-after-global-reset',
    'reauthorization after global reset uses the normal join flow with a new device identity'
  );

  const migrationAdapter = createInMemoryRemoteSyncAdapter();
  const migrationRestore = await migrationAdapter.restorePortableDatasetSnapshotServerLocal({
    datasetId: portableSnapshot.dataset.datasetId,
    snapshot: portableSnapshot,
    actorDeviceId: 'migration-server-local',
    actorDisplayName: 'Migration server-local operator',
    warningAccepted: true,
    typedDatasetName: portableSnapshot.dataset.displayName,
    reason: 'Move the Team dataset to a replacement deployment',
  });
  assert.equal(migrationRestore.status, 'restored');
  const migrationCredential = await migrationAdapter.createJoinCredential({
    datasetId: portableSnapshot.dataset.datasetId,
    operatorDeviceId: 'migration-server-local',
  });
  await migrationAdapter.joinDataset({
    artifact: {
      ...artifact,
      credentialId: migrationCredential.credentialId,
      credentialSecret: migrationCredential.secret,
    },
    deviceId: 'migration-client',
    deviceDisplayName: 'Migration client',
  });
  const migratedChanges = await migrationAdapter.pullChanges({
    datasetId: portableSnapshot.dataset.datasetId,
    deviceId: 'migration-client',
    afterCursor: 0,
  });
  assert.equal(
    migratedChanges.changes.some(
      change => change.documentId === '2026miket::qm1::3314::red' && !change.document.tombstone
    ),
    true,
    'a portable snapshot can seed a fresh deployment and replay to newly joined devices'
  );
}

await runContract();
console.log('Remote sync contract passed.');
`,
  'utf8'
);

const server = await createServer({
  appType: 'custom',
  configFile: false,
  logLevel: 'error',
  root: repoRoot,
  resolve: {
    alias: [
      {
        find: '@/core/db/database',
        replacement: fakeDbPath,
      },
      {
        find: '@/core/sync/scoutProfileStore',
        replacement: fakeScoutProfileStorePath,
      },
      {
        find: '@',
        replacement: path.join(repoRoot, 'src'),
      },
    ],
  },
  server: {
    middlewareMode: true,
  },
});

try {
  await server.ssrLoadModule(`/${toVitePath(path.relative(repoRoot, entryPath))}`);
} finally {
  await server.close();
  await rm(workDir, { force: true, recursive: true });
}

function toVitePath(filePath) {
  return filePath.split(path.sep).join('/');
}
