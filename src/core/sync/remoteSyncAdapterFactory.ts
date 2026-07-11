import { createFirebaseRemoteSyncAdapter } from './firebase';
import type { RemoteSyncConnection } from './remoteSyncConnection';
import type { RemoteSyncAdapter } from './types';

export function createRemoteSyncAdapterForConnection(
  connection: RemoteSyncConnection
): RemoteSyncAdapter {
  return createFirebaseRemoteSyncAdapter({
    firebase: connection.firebase,
    firestoreEmulator: connection.firestoreEmulator,
  });
}
