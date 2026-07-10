export interface EventSyncScope {
  mode: 'all' | 'selected';
  eventKeys: string[];
}

export function createEventSyncScope(eventKeys?: readonly string[]): EventSyncScope {
  const normalizedEventKeys = [
    ...new Set((eventKeys ?? []).map(normalizeEventKey).filter(Boolean)),
  ].sort();

  return normalizedEventKeys.length === 0
    ? { mode: 'all', eventKeys: [] }
    : { mode: 'selected', eventKeys: normalizedEventKeys };
}

export function eventSyncScopeIncludes(scope: EventSyncScope, eventKey: string): boolean {
  return scope.mode === 'all' || scope.eventKeys.includes(normalizeEventKey(eventKey));
}

function normalizeEventKey(eventKey: string): string {
  return eventKey.trim().toLowerCase();
}
