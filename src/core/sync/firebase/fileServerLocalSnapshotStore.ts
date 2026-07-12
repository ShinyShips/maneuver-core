import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertPortableDatasetSnapshotMatchesDataset } from '../portableDatasetRestore';
import type { PortableDatasetSnapshot } from '../types';
import type { ServerLocalSnapshotStore } from './serverLocalSnapshotStore';

export function createFileServerLocalSnapshotStore(
  rootDirectory: string
): ServerLocalSnapshotStore {
  return {
    async put(snapshot) {
      const directory = path.join(rootDirectory, toSafeSegment(snapshot.dataset.datasetId));
      await mkdir(directory, { recursive: true });
      const destination = path.join(directory, `${toSafeSegment(snapshot.snapshotId)}.json`);
      const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(snapshot), 'utf8');
      await rename(temporary, destination);
    },
    async get(datasetId, snapshotId) {
      const snapshotPath = path.join(
        rootDirectory,
        toSafeSegment(datasetId),
        `${toSafeSegment(snapshotId)}.json`
      );
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as PortableDatasetSnapshot;
      assertPortableDatasetSnapshotMatchesDataset(snapshot, datasetId);
      if (snapshot.snapshotId !== snapshotId) {
        throw new Error(`Portable dataset snapshot identity does not match ${snapshotId}.`);
      }
      return snapshot;
    },
  };
}

function toSafeSegment(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}
