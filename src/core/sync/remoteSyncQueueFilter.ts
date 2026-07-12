export function excludeRemoteSyncItemsForDevice<
  TItem extends { datasetId: string; deviceId: string },
>(items: TItem[], datasetId: string, deviceId: string): TItem[] {
  return items.filter(item => item.datasetId !== datasetId || item.deviceId !== deviceId);
}
