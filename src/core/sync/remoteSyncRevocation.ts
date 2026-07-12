import type { RemoteSyncConnection } from './remoteSyncConnection';
import { clearRemoteSyncConnection, loadRemoteSyncConnection } from './remoteSyncConnection';
import { RemoteSyncDeviceRevokedError } from './remoteSyncErrors';
import { discardRemoteSyncQueueForDevice } from './remoteSyncQueue';
import { discardScoutProfileQueueForDevice } from './scoutProfileQueue';
import { captureRejoinRecoveryContext } from './rejoinRecoveryPreparation';

export function disconnectRemoteSyncDeviceIfRevoked(
  error: unknown,
  connection: RemoteSyncConnection
): boolean {
  if (!(error instanceof RemoteSyncDeviceRevokedError)) {
    return false;
  }

  captureRejoinRecoveryContext(connection);
  discardRemoteSyncQueueForDevice(connection.datasetId, connection.deviceId);
  discardScoutProfileQueueForDevice(connection.datasetId, connection.deviceId);
  const currentConnection = loadRemoteSyncConnection();
  if (
    currentConnection?.datasetId === connection.datasetId &&
    currentConnection.deviceId === connection.deviceId
  ) {
    clearRemoteSyncConnection();
  }
  return true;
}
