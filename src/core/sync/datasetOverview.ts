import type {
  CleanupCapableDeviceSummary,
  JoinedDeviceIdentity,
  RestoreDatasetEventRecord,
  SharedRestoreEvent,
} from './types';

export interface CleanupCapabilityProjection {
  deviceId: string;
  expiresAt?: number;
  revokedAt?: number;
}

export function selectCleanupCapableDevices(
  devices: JoinedDeviceIdentity[],
  cleanupCapabilities: CleanupCapabilityProjection[]
): CleanupCapableDeviceSummary[] {
  const provisionedDeviceIds = new Set(
    cleanupCapabilities
      .filter(
        capability =>
          !capability.revokedAt &&
          (!capability.expiresAt || capability.expiresAt > Date.now())
      )
      .map(capability => capability.deviceId)
  );

  return devices
    .filter(identity => !identity.revokedAt && provisionedDeviceIds.has(identity.deviceId))
    .map(identity => ({
      deviceId: identity.deviceId,
      displayName: identity.displayName,
    }));
}

export function selectRecentRestoreEvents(events: SharedRestoreEvent[]): SharedRestoreEvent[] {
  return events
    .slice()
    .sort((left, right) => right.occurredAt - left.occurredAt)
    .slice(0, 10)
    .map(event => structuredClone(event));
}

export function createSharedRestoreEvent(event: RestoreDatasetEventRecord): SharedRestoreEvent {
  return {
    eventId: event.eventId,
    actorDeviceId: event.actorDeviceId,
    actorDisplayName: event.actorDisplayName,
    occurredAt: event.occurredAt,
    snapshotId: event.snapshotId,
    snapshotLabel: event.snapshotLabel,
    ...(event.reason === undefined ? {} : { reason: event.reason }),
  };
}
