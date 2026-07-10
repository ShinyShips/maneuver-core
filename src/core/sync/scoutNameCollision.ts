import { normalizeScoutProfileName } from './canonicalDocumentIdentity';
import {
  enqueueScoutProfileUpsert,
  loadScoutProfileQueueForDataset,
  removeScoutProfileQueueItems,
} from './scoutProfileQueue';
import { renameScoutProfileSyncPayload } from '@/core/sync/scoutProfileStore';

const IDENTITY_BINDINGS_STORAGE_KEY = 'maneuver.remoteSync.scoutProfileBindings';
const PENDING_COLLISIONS_STORAGE_KEY = 'maneuver.remoteSync.scoutNameCollisions';

export interface PendingScoutNameCollision {
  datasetId: string;
  documentId: string;
  localName: string;
  remoteName: string;
  detectedAt: number;
}

export type ResolveScoutNameCollisionInput =
  | {
      datasetId: string;
      documentId: string;
      decision: 'join-existing';
    }
  | {
      datasetId: string;
      documentId: string;
      decision: 'use-another-name';
      replacementName: string;
    };

export class ScoutNameCollisionError extends Error {
  readonly collision: PendingScoutNameCollision;

  constructor(collision: PendingScoutNameCollision) {
    super(
      `Scout name ${collision.localName} already exists in this Team dataset. Choose whether to join that Scout profile or use another name.`
    );
    this.name = 'ScoutNameCollisionError';
    this.collision = collision;
  }
}

export function isScoutProfileIdentityBound(datasetId: string, documentId: string): boolean {
  return loadIdentityBindings().includes(getBindingKey(datasetId, documentId));
}

export function markScoutProfileIdentityBound(datasetId: string, documentId: string): void {
  const bindingKey = getBindingKey(datasetId, documentId);
  const bindings = new Set(loadIdentityBindings());
  bindings.add(bindingKey);
  saveIdentityBindings(Array.from(bindings));
}

export function recordScoutNameCollision(input: {
  datasetId: string;
  documentId: string;
  localName: string;
  remoteName: string;
}): PendingScoutNameCollision {
  const collision: PendingScoutNameCollision = {
    ...input,
    localName: input.localName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    remoteName: input.remoteName.normalize('NFKC').trim().replace(/\s+/g, ' '),
    detectedAt: Date.now(),
  };
  const pending = loadPendingScoutNameCollisions().filter(
    item => item.datasetId !== input.datasetId || item.documentId !== input.documentId
  );
  pending.push(collision);
  savePendingScoutNameCollisions(pending);
  return collision;
}

export function loadPendingScoutNameCollisions(
  datasetId?: string
): PendingScoutNameCollision[] {
  const pending = readJsonArray<PendingScoutNameCollision>(PENDING_COLLISIONS_STORAGE_KEY).filter(
    isPendingScoutNameCollision
  );
  return datasetId ? pending.filter(collision => collision.datasetId === datasetId) : pending;
}

export async function resolveScoutNameCollision(
  input: ResolveScoutNameCollisionInput
): Promise<void> {
  const collision = loadPendingScoutNameCollisions(input.datasetId).find(
    item => item.documentId === input.documentId
  );

  if (!collision) {
    throw new Error('Scout-name collision is no longer pending.');
  }

  if (input.decision === 'join-existing') {
    markScoutProfileIdentityBound(input.datasetId, input.documentId);
    enqueueScoutProfileUpsert(collision.localName);
  } else {
    const replacementIdentity = normalizeScoutProfileName(input.replacementName);

    if (replacementIdentity === input.documentId) {
      throw new Error('Choose a Scout name with a different normalized identity.');
    }

    const oldQueueItemIds = loadScoutProfileQueueForDataset(input.datasetId)
      .filter(item => item.documentId === input.documentId)
      .map(item => item.id);
    removeScoutProfileQueueItems(oldQueueItemIds);
    await renameScoutProfileSyncPayload(collision.localName, input.replacementName);
    enqueueScoutProfileUpsert(input.replacementName);
  }

  savePendingScoutNameCollisions(
    loadPendingScoutNameCollisions().filter(
      item => item.datasetId !== input.datasetId || item.documentId !== input.documentId
    )
  );
}

function loadIdentityBindings(): string[] {
  return readJsonArray<string>(IDENTITY_BINDINGS_STORAGE_KEY).filter(
    binding => typeof binding === 'string'
  );
}

function saveIdentityBindings(bindings: string[]): void {
  writeJson(IDENTITY_BINDINGS_STORAGE_KEY, bindings);
}

function savePendingScoutNameCollisions(collisions: PendingScoutNameCollision[]): void {
  writeJson(PENDING_COLLISIONS_STORAGE_KEY, collisions);
}

function getBindingKey(datasetId: string, documentId: string): string {
  return `${datasetId}:scout-profile:${documentId}`;
}

function readJsonArray<T>(key: string): T[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const stored = window.localStorage.getItem(key);

  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('remoteSyncQueueChanged'));
}

function isPendingScoutNameCollision(value: unknown): value is PendingScoutNameCollision {
  return (
    isRecord(value) &&
    typeof value.datasetId === 'string' &&
    typeof value.documentId === 'string' &&
    typeof value.localName === 'string' &&
    typeof value.remoteName === 'string' &&
    typeof value.detectedAt === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
