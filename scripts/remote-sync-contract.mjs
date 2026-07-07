import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';

const repoRoot = process.cwd();
const workDir = path.join(repoRoot, `tmp-remote-sync-contract-${process.pid}`);
const fakeDbPath = path.join(workDir, 'fake-database.ts');
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
  entryPath,
  `
import assert from 'node:assert/strict';
import {
  createInMemoryRemoteSyncAdapter,
  createRemoteSyncConnection,
  getRemoteSyncQueueHealth,
  loadRemoteSyncQueue,
  saveRemoteSyncConnection,
  syncScoutingEntries,
} from '@/core/sync';
import {
  __getRemoteSyncContractEntry,
  __resetRemoteSyncContractDb,
  __useRemoteSyncContractDbClient,
  saveScoutingEntry,
} from '@/core/db/database';
import type { DatasetJoinArtifact } from '@/core/sync';
import type { ScoutingEntryBase } from '@/core/types/scouting-entry';

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

function attachClient(clientId: string, artifact: DatasetJoinArtifact): void {
  useClient(clientId);
  saveRemoteSyncConnection(
    createRemoteSyncConnection(artifact, {
      deviceDisplayName: clientId,
      scopeKey: '2026miket',
    })
  );
}

async function runContract(): Promise<void> {
  __resetRemoteSyncContractDb();

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

  attachClient('client-a', artifact);
  await saveScoutingEntry(scoutingEntry());
  assert.equal(loadRemoteSyncQueue().length, 1, 'local scouting entry is queued');
  assert.equal(getRemoteSyncQueueHealth().state, 'offline', 'pending queue is actionable');

  const firstSync = await syncScoutingEntries(adapter);
  assert.equal(firstSync.pushedCount, 1, 'queued entry is pushed');
  assert.equal(firstSync.cursor, 1, 'push advances the sync cursor');
  assert.equal(loadRemoteSyncQueue().length, 0, 'successful push drains the queue');

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
