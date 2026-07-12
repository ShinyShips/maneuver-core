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
  CreatePortableDatasetSnapshotServerLocalInput,
  CreateCleanupCredentialInput,
  CreateDatasetInput,
  CreateJoinCredentialInput,
  DeprovisionCleanupAuthorityInput,
  DatasetCleanupCredential,
  DatasetActorIdentity,
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
  JoinedDeviceSummary,
  JoinedDatasetOverview,
  GetJoinedDatasetOverviewInput,
  CleanupCapableDeviceSummary,
  GlobalRejoinResetResult,
  PullChangesInput,
  PullChangesResult,
  PortableDatasetSnapshot,
  ProvisionCleanupAuthorityInput,
  PushDocumentsInput,
  PushDocumentsResult,
  QueueHealth,
  RestoreDatasetEventRecord,
  RestorePortableDatasetSnapshotResult,
  RestorePortableDatasetSnapshotServerLocalInput,
  ServerLocalCleanupCanonicalDocumentsInput,
  ServerLocalRestoreResult,
  RemoteSyncFirebaseProjectConfig,
  RemoteSyncAdapter,
  RemoteSyncAdminAdapter,
  RemoteSyncClientAdapter,
  RotateJoinCredentialInput,
  RevokeJoinedDeviceInput,
  RevokeJoinedDeviceResult,
  ResetDatasetForRejoinServerLocalInput,
  ServerLocalRevokeJoinedDeviceInput,
  TeamDataset,
  SharedRestoreEvent,
} from './types';

export {
  createCanonicalDocumentIdentity,
  createCanonicalDocumentKey,
  inspectScoutNameCollision,
  normalizeScoutProfileName,
} from './canonicalDocumentIdentity';
export { ServerLocalRestoreFailedError } from './portableDatasetRestore';
export {
  clearRemoteSyncConnection,
  createRemoteSyncConnection,
  createJoinDatasetInputFromConnection,
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
export { RemoteSyncDeviceNotJoinedError, RemoteSyncDeviceRevokedError } from './remoteSyncErrors';
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
  createFirebaseRemoteSyncServerLocalAdapter,
  getFirebaseRemoteSyncConfigFromEnv,
  isFirebaseRemoteSyncConfigured,
} from './firebase';

export type {
  FirebaseRemoteSyncConfig,
  FirebaseRemoteSyncEnv,
  FirebaseServerLocalCapability,
  ServerLocalSnapshotStore,
} from './firebase';
