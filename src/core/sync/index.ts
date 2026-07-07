export type {
  CanonicalChangeOperation,
  CanonicalDocumentType,
  CanonicalSyncChange,
  CanonicalSyncDocument,
  CreateCleanupCredentialInput,
  CreateDatasetInput,
  CreateJoinCredentialInput,
  DatasetCleanupCredential,
  DatasetHealth,
  DatasetJoinArtifact,
  DatasetJoinCredential,
  DatasetOperatorRecoveryArtifact,
  JoinDatasetInput,
  JoinedDeviceIdentity,
  PullChangesInput,
  PullChangesResult,
  PushDocumentsInput,
  PushDocumentsResult,
  QueueHealth,
  RemoteSyncFirebaseProjectConfig,
  RemoteSyncAdapter,
  RemoteSyncAdminAdapter,
  RemoteSyncClientAdapter,
  RotateJoinCredentialInput,
  TeamDataset,
} from './types';

export {
  createFirebaseRemoteSyncAdapter,
  getFirebaseRemoteSyncConfigFromEnv,
  isFirebaseRemoteSyncConfigured,
} from './firebase';

export type { FirebaseRemoteSyncConfig, FirebaseRemoteSyncEnv } from './firebase';
