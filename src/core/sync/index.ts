export type {
  CanonicalChangeOperation,
  CanonicalDocumentTarget,
  CanonicalDocumentType,
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CleanupAuthorityGrant,
  CleanupCanonicalDocumentsInput,
  CleanupCanonicalDocumentsResult,
  CleanupDatasetEventRecord,
  CreateCleanupCredentialInput,
  CreateDatasetInput,
  CreateJoinCredentialInput,
  DeprovisionCleanupAuthorityInput,
  DatasetCleanupCredential,
  DatasetCleanupProvisioningArtifact,
  DatasetHealth,
  DatasetEventRecord,
  BackupDatasetEventRecord,
  DatasetSummarySignals,
  DatasetJoinArtifact,
  DatasetJoinCredential,
  DatasetOperatorRecoveryArtifact,
  JoinDatasetInput,
  JoinedDeviceIdentity,
  JoinedDatasetOverview,
  GetJoinedDatasetOverviewInput,
  CleanupCapableDeviceSummary,
  PullChangesInput,
  PullChangesResult,
  ProvisionCleanupAuthorityInput,
  PushDocumentsInput,
  PushDocumentsResult,
  QueueHealth,
  RestoreDatasetEventRecord,
  ServerLocalCleanupCanonicalDocumentsInput,
  RemoteSyncFirebaseProjectConfig,
  RemoteSyncAdapter,
  RemoteSyncAdminAdapter,
  RemoteSyncClientAdapter,
  RotateJoinCredentialInput,
  TeamDataset,
  SharedRestoreEvent,
} from './types';

export {
  createCanonicalDocumentIdentity,
  inspectScoutNameCollision,
  normalizeScoutProfileName,
} from './canonicalDocumentIdentity';
export {
  clearRemoteSyncConnection,
  createRemoteSyncConnection,
  loadRemoteSyncConnection,
  parseDatasetJoinArtifact,
  saveRemoteSyncConnection,
} from './remoteSyncConnection';
export {
  parseCleanupDocumentTargets,
  parseDatasetCleanupProvisioningArtifact,
} from './remoteSyncCleanup';
export {
  getRemoteSyncQueueHealth,
  loadRemoteSyncQueue,
  loadRemoteSyncQueueForDataset,
} from './remoteSyncQueue';
export {
  enqueueScoutProfileUpsert,
  loadScoutProfileQueue,
  loadScoutProfileQueueForDataset,
} from './scoutProfileQueue';
export {
  loadPendingScoutNameCollisions,
  resolveScoutNameCollision,
  ScoutNameCollisionError,
} from './scoutNameCollision';
export { readJoinedDatasetOverview, syncScoutingEntries } from './remoteSyncEngine';
export {
  createScoutProfileSyncDocumentCandidate,
  reconcileScoutProfile,
} from './scoutProfileDocuments';
export { readScopedOnlineScoutingEntries } from './scopedOnlineExportRead';
export {
  acknowledgeLocalScoutingExportWarning,
  createScoutingDataExport,
  isLocalScoutingExportWarningAcknowledged,
  SCOUTING_EXPORT_SCOPE_LABELS,
} from './scoutingDataExport';
export {
  createEventSyncScope,
  createScopedOnlineExportSelection,
  eventSyncScopeIncludes,
  getEventSyncScope,
  getScopedOnlineExportDefault,
  updateEventSyncScope,
} from './eventSyncScope';
export { createInMemoryRemoteSyncAdapter } from './testing';

export type {
  CanonicalDocumentIdentity,
  CanonicalDocumentIdentityInput,
  ScoutNameCollisionInspection,
} from './canonicalDocumentIdentity';
export type {
  ParseJoinArtifactResult,
  RemoteSyncConnection,
  RemoteSyncDeviceDefaults,
} from './remoteSyncConnection';
export type { ParseCleanupProvisioningArtifactResult } from './remoteSyncCleanup';
export type { RemoteSyncQueueItem, RemoteSyncQueueOperation } from './remoteSyncQueue';
export type { ScoutProfileQueueItem } from './scoutProfileQueue';
export type {
  PendingScoutNameCollision,
  ResolveScoutNameCollisionInput,
} from './scoutNameCollision';
export type { RemoteSyncRunResult } from './remoteSyncEngine';
export type {
  ScoutProfileReconciliation,
  ScoutProfileSyncDocument,
  ScoutProfileSyncPayload,
} from './scoutProfileDocuments';
export type { ScopedOnlineScoutingEntriesRead } from './scopedOnlineExportRead';
export type {
  HumanReadableScoutingDataExport,
  ScoutingDataExportOptions,
  ScoutingDataExportRequest,
} from './scoutingDataExport';
export type {
  EventSyncScope,
  EventSyncScopeChangeOptions,
  EventSyncScopeChangeResult,
  ScopedOnlineExportSelection,
} from './eventSyncScope';

export {
  createFirebaseRemoteSyncAdapter,
  getFirebaseRemoteSyncConfigFromEnv,
  isFirebaseRemoteSyncConfigured,
} from './firebase';

export type { FirebaseRemoteSyncConfig, FirebaseRemoteSyncEnv } from './firebase';
