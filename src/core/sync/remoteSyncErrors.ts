export class RemoteSyncDeviceNotJoinedError extends Error {
  readonly datasetId: string;
  readonly deviceId: string;

  constructor(datasetId: string, deviceId: string) {
    super(`Remote sync device is not joined to dataset ${datasetId}.`);
    this.name = 'RemoteSyncDeviceNotJoinedError';
    this.datasetId = datasetId;
    this.deviceId = deviceId;
  }
}

export class RemoteSyncDeviceRevokedError extends Error {
  readonly datasetId: string;
  readonly deviceId: string;

  constructor(datasetId: string, deviceId: string) {
    super(`Remote sync device has been revoked for dataset ${datasetId}. Rejoin through the normal join flow.`);
    this.name = 'RemoteSyncDeviceRevokedError';
    this.datasetId = datasetId;
    this.deviceId = deviceId;
  }
}
