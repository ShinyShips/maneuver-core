import type { DatasetJoinArtifact } from './types';

const CONNECTION_STORAGE_KEY = 'maneuver.remoteSync.connection';

export interface RemoteSyncDeviceDefaults {
  deviceDisplayName: string;
  scopeKey?: string;
}

export interface RemoteSyncConnection {
  datasetId: string;
  datasetName: string;
  backend: DatasetJoinArtifact['backend'];
  projectId: string;
  firebase: DatasetJoinArtifact['firebase'];
  firestoreEmulator?: DatasetJoinArtifact['firestoreEmulator'];
  credentialId: string;
  credentialSecret: string;
  deviceId: string;
  deviceDisplayName: string;
  scopeKey?: string;
  joinedAt: number;
  queueState: 'not-started' | 'ready';
}

export type ParseJoinArtifactResult =
  | {
      ok: true;
      artifact: DatasetJoinArtifact;
    }
  | {
      ok: false;
      error: string;
    };

export function parseDatasetJoinArtifact(rawArtifact: string): ParseJoinArtifactResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawArtifact);
  } catch {
    return {
      ok: false,
      error: 'Join artifact must be valid JSON.',
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      error: 'Join artifact must be a JSON object.',
    };
  }

  if ('cleanupCredentialId' in parsed || 'cleanupCredentialSecret' in parsed) {
    return {
      ok: false,
      error: 'Operator recovery artifacts cannot be used to join a scouting device.',
    };
  }

  if (parsed.protocolVersion !== 1) {
    return {
      ok: false,
      error: 'Join artifact protocol version is not supported.',
    };
  }

  if (parsed.backend !== 'firebase') {
    return {
      ok: false,
      error: 'Join artifact backend is not supported.',
    };
  }

  if (!isNonEmptyString(parsed.datasetId) || !isNonEmptyString(parsed.datasetName)) {
    return {
      ok: false,
      error: 'Join artifact is missing dataset identity.',
    };
  }

  if (!isNonEmptyString(parsed.credentialId) || !isNonEmptyString(parsed.credentialSecret)) {
    return {
      ok: false,
      error: 'Join artifact is missing join credential data.',
    };
  }

  if (!isRecord(parsed.firebase) || !isNonEmptyString(parsed.firebase.projectId)) {
    return {
      ok: false,
      error: 'Join artifact is missing Firebase project data.',
    };
  }

  return {
    ok: true,
    artifact: parsed as unknown as DatasetJoinArtifact,
  };
}

export function createRemoteSyncConnection(
  artifact: DatasetJoinArtifact,
  defaults: RemoteSyncDeviceDefaults
): RemoteSyncConnection {
  return {
    datasetId: artifact.datasetId,
    datasetName: artifact.datasetName,
    backend: artifact.backend,
    projectId: artifact.firebase.projectId,
    firebase: artifact.firebase,
    firestoreEmulator: artifact.firestoreEmulator,
    credentialId: artifact.credentialId,
    credentialSecret: artifact.credentialSecret,
    deviceId: crypto.randomUUID(),
    deviceDisplayName: defaults.deviceDisplayName,
    scopeKey: defaults.scopeKey,
    joinedAt: Date.now(),
    queueState: 'not-started',
  };
}

export function loadRemoteSyncConnection(): RemoteSyncConnection | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(CONNECTION_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored);
    return isRemoteSyncConnection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveRemoteSyncConnection(connection: RemoteSyncConnection): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(connection));
  window.dispatchEvent(new CustomEvent('remoteSyncConnectionChanged'));
}

export function clearRemoteSyncConnection(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(CONNECTION_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent('remoteSyncConnectionChanged'));
}

function isRemoteSyncConnection(value: unknown): value is RemoteSyncConnection {
  return (
    isRecord(value) &&
    isNonEmptyString(value.datasetId) &&
    isNonEmptyString(value.datasetName) &&
    value.backend === 'firebase' &&
    isNonEmptyString(value.projectId) &&
    isRecord(value.firebase) &&
    isNonEmptyString(value.credentialId) &&
    isNonEmptyString(value.credentialSecret) &&
    isNonEmptyString(value.deviceId) &&
    isNonEmptyString(value.deviceDisplayName) &&
    typeof value.joinedAt === 'number'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
