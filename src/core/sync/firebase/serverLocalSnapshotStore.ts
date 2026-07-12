import type { PortableDatasetSnapshot } from '../types';

export interface ServerLocalSnapshotStore {
  put(snapshot: PortableDatasetSnapshot): Promise<void>;
  get(datasetId: string, snapshotId: string): Promise<PortableDatasetSnapshot>;
}
