export type CanonicalDocumentType = 'match-scouting-entry' | 'pit-scouting-entry' | 'scout-profile';

export type CanonicalChangeOperation = 'upsert' | 'tombstone';

export interface CanonicalSyncDocument<TPayload = unknown> {
  documentId: string;
  documentType: CanonicalDocumentType;
  datasetId: string;
  scopeKey?: string;
  revision: number;
  updatedAt: number;
  updatedByDeviceId: string;
  tombstone: boolean;
  payload: TPayload;
}

export interface CanonicalSyncChange<TPayload = unknown> {
  datasetId: string;
  cursor: number;
  documentId: string;
  documentType: CanonicalDocumentType;
  revision: number;
  changedAt: number;
  operation: CanonicalChangeOperation;
  document: CanonicalSyncDocument<TPayload>;
}

export interface TeamDataset {
  datasetId: string;
  displayName: string;
  teamNumber?: number;
  season?: number;
  createdAt: number;
  createdByDeviceId: string;
}

export interface DatasetJoinCredential {
  datasetId: string;
  credentialId: string;
  credentialKind: 'join';
  secret: string;
  createdAt: number;
  expiresAt?: number;
  revokedAt?: number;
}

export interface DatasetCleanupCredential {
  datasetId: string;
  credentialId: string;
  credentialKind: 'cleanup';
  secret: string;
  createdAt: number;
  expiresAt?: number;
  revokedAt?: number;
}

export interface RemoteSyncFirebaseProjectConfig {
  apiKey?: string;
  authDomain?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface DatasetJoinArtifact {
  protocolVersion: 1;
  backend: 'firebase';
  datasetId: string;
  datasetName: string;
  credentialId: string;
  credentialSecret: string;
  firebase: RemoteSyncFirebaseProjectConfig;
  firestoreEmulator?: {
    host: string;
    port: number;
  };
  recommendedDefaults?: {
    scopeKey?: string;
    queueMode: 'local-first';
  };
}

export interface DatasetOperatorRecoveryArtifact {
  protocolVersion: 1;
  backend: 'firebase';
  datasetId: string;
  datasetName: string;
  cleanupCredentialId: string;
  cleanupCredentialSecret: string;
  cleanupCredentialExpiresAt?: number;
  firebase: RemoteSyncFirebaseProjectConfig;
  firestoreEmulator?: {
    host: string;
    port: number;
  };
}

export interface DatasetCleanupProvisioningArtifact extends DatasetOperatorRecoveryArtifact {
  provisionedDeviceId: string;
}

export interface JoinedDeviceIdentity {
  datasetId: string;
  deviceId: string;
  displayName: string;
  joinedAt: number;
  revokedAt?: number;
}

export interface QueueHealth {
  state: 'idle' | 'healthy' | 'offline' | 'blocked' | 'error';
  pendingWrites: number;
  lastSuccessfulSyncAt?: number;
  blockedReason?: string;
}

export interface DatasetHealth {
  datasetId: string;
  documentCount: number;
  deviceCount: number;
  currentCursor: number;
  queueHealth: QueueHealth;
  checkedAt: number;
}

export interface GetJoinedDatasetOverviewInput {
  datasetId: string;
  deviceId: string;
}

export interface DatasetSummarySignals {
  documentCount: number;
  joinedDeviceCount: number;
  currentCursor: number;
  createdAt: number;
  lastChangedAt?: number;
}

export interface CleanupCapableDeviceSummary {
  deviceId: string;
  displayName: string;
}

export interface SharedRestoreEvent {
  eventId: string;
  actorDeviceId: string;
  actorDisplayName: string;
  occurredAt: number;
  snapshotId: string;
  snapshotLabel: string;
  reason?: string;
}

export interface CanonicalDocumentTarget {
  documentType: CanonicalDocumentType;
  documentId: string;
}

export interface CleanupDatasetEventRecord extends DatasetEventRecordBase {
  eventType: 'cleanup';
  targets: CanonicalDocumentTarget[];
  reason?: string;
}

interface DatasetEventRecordBase {
  datasetId: string;
  eventId: string;
  actorDeviceId: string;
  actorDisplayName: string;
  occurredAt: number;
}

export interface BackupDatasetEventRecord extends DatasetEventRecordBase {
  eventType: 'backup';
  snapshotId?: string;
  snapshotLabel?: string;
}

export interface RestoreDatasetEventRecord extends DatasetEventRecordBase, SharedRestoreEvent {
  eventType: 'restore';
}

export type DatasetEventRecord =
  | BackupDatasetEventRecord
  | CleanupDatasetEventRecord
  | RestoreDatasetEventRecord;

export interface JoinedDatasetOverview {
  datasetId: string;
  summary: DatasetSummarySignals;
  cleanupCapableDevices: CleanupCapableDeviceSummary[];
  recentCleanupEvents: CleanupDatasetEventRecord[];
  recentRestoreEvents: SharedRestoreEvent[];
  checkedAt: number;
}

export interface CreateDatasetInput {
  displayName: string;
  operatorDeviceId: string;
  teamNumber?: number;
  season?: number;
}

export interface CreateJoinCredentialInput {
  datasetId: string;
  operatorDeviceId: string;
  expiresAt?: number;
}

export interface CreateCleanupCredentialInput {
  datasetId: string;
  operatorDeviceId: string;
  expiresAt?: number;
}

export interface ProvisionCleanupAuthorityInput {
  datasetId: string;
  deviceId: string;
  credentialId: string;
  credentialSecret: string;
  credentialExpiresAt?: number;
}

export interface DeprovisionCleanupAuthorityInput {
  datasetId: string;
  deviceId: string;
}

export interface CleanupAuthorityGrant {
  datasetId: string;
  deviceId: string;
  credentialId: string;
  provisionedAt: number;
  expiresAt?: number;
}

export interface CleanupCanonicalDocumentsInput {
  datasetId: string;
  deviceId: string;
  targets: CanonicalDocumentTarget[];
  reason?: string;
}

export interface ServerLocalCleanupCanonicalDocumentsInput {
  datasetId: string;
  actorDeviceId: string;
  actorDisplayName: string;
  targets: CanonicalDocumentTarget[];
  reason?: string;
}

export interface CleanupCanonicalDocumentsResult {
  cleanedDocuments: CanonicalSyncDocument[];
  cursor: number;
  event: CleanupDatasetEventRecord;
}

export interface RotateJoinCredentialInput extends CreateJoinCredentialInput {
  previousCredentialId: string;
}

export interface JoinDatasetInput {
  artifact: DatasetJoinArtifact;
  deviceId: string;
  deviceDisplayName: string;
}

export interface PushDocumentsInput<TPayload = unknown> {
  datasetId: string;
  deviceId: string;
  documents: Array<
    Omit<
      CanonicalSyncDocument<TPayload>,
      'datasetId' | 'revision' | 'updatedAt' | 'updatedByDeviceId'
    >
  >;
}

export interface PushDocumentsResult<TPayload = unknown> {
  committed: CanonicalSyncDocument<TPayload>[];
  cursor: number;
}

export interface PullChangesInput {
  datasetId: string;
  afterCursor: number;
  pageSize?: number;
}

export interface PullChangesResult<TPayload = unknown> {
  changes: CanonicalSyncChange<TPayload>[];
  nextCursor: number;
  hasMore: boolean;
}

export interface RemoteSyncClientAdapter {
  joinDataset(input: JoinDatasetInput): Promise<JoinedDeviceIdentity>;
  provisionCleanupAuthority(
    input: ProvisionCleanupAuthorityInput
  ): Promise<CleanupAuthorityGrant>;
  deprovisionCleanupAuthority(input: DeprovisionCleanupAuthorityInput): Promise<void>;
  cleanupCanonicalDocuments(
    input: CleanupCanonicalDocumentsInput
  ): Promise<CleanupCanonicalDocumentsResult>;
  pushDocuments<TPayload = unknown>(
    input: PushDocumentsInput<TPayload>
  ): Promise<PushDocumentsResult<TPayload>>;
  pullChanges<TPayload = unknown>(input: PullChangesInput): Promise<PullChangesResult<TPayload>>;
  getDatasetHealth(datasetId: string): Promise<DatasetHealth>;
  getJoinedDatasetOverview(input: GetJoinedDatasetOverviewInput): Promise<JoinedDatasetOverview>;
}

export interface RemoteSyncAdminAdapter {
  createDataset(input: CreateDatasetInput): Promise<TeamDataset>;
  createJoinCredential(input: CreateJoinCredentialInput): Promise<DatasetJoinCredential>;
  createCleanupCredential(input: CreateCleanupCredentialInput): Promise<DatasetCleanupCredential>;
  rotateJoinCredential(input: RotateJoinCredentialInput): Promise<DatasetJoinCredential>;
  recordDatasetEvent(input: DatasetEventRecord): Promise<DatasetEventRecord>;
  cleanupCanonicalDocumentsServerLocal(
    input: ServerLocalCleanupCanonicalDocumentsInput
  ): Promise<CleanupCanonicalDocumentsResult>;
  getDatasetHealth(datasetId: string): Promise<DatasetHealth>;
}

export interface RemoteSyncAdapter extends RemoteSyncClientAdapter, RemoteSyncAdminAdapter {}
