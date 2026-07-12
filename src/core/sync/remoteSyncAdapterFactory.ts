import { createFirebaseRemoteSyncAdapter } from './firebase';
import type { RemoteSyncConnection } from './remoteSyncConnection';
import type { RemoteSyncClientAdapter } from './types';

export function createRemoteSyncAdapterForConnection(
  connection: RemoteSyncConnection
): RemoteSyncClientAdapter {
  return createFirebaseRemoteSyncAdapter({
    firebase: connection.firebase,
    firestoreEmulator: connection.firestoreEmulator,
  });
}
