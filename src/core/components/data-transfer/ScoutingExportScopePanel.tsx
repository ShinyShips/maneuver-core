import {
  SCOUTING_EXPORT_SCOPE_LABELS,
  type ScoutingDataExportRequest,
} from '@/core/sync/scoutingDataExport';

export type ScoutingExportSource = ScoutingDataExportRequest['source'];

export interface ScoutingExportScopePanelProps {
  connected: boolean;
  source: ScoutingExportSource;
  eventKeysText: string;
  pendingUnsyncedChanges: number;
  localWarningConfirmationRequired: boolean;
  remoteFailure?: string | null;
  onSourceChange: (source: ScoutingExportSource) => void;
  onEventKeysTextChange: (value: string) => void;
  onConfirmLocalExport: () => void;
  onUseLocalFallback: () => void;
}

const choices: Array<{
  source: ScoutingExportSource;
  label: string;
  description: string;
  remote: boolean;
}> = [
  {
    source: 'device-local',
    label: SCOUTING_EXPORT_SCOPE_LABELS['device-local'],
    description:
      'Available offline. This export may be incomplete because it contains only data retained on this device.',
    remote: false,
  },
  {
    source: 'scoped-online',
    label: SCOUTING_EXPORT_SCOPE_LABELS['scoped-online'],
    description:
      "Reads the selected events remotely without changing this device's Event sync scope.",
    remote: true,
  },
  {
    source: 'full-online',
    label: SCOUTING_EXPORT_SCOPE_LABELS['full-online'],
    description: 'Reads scouting data for every event in the connected Team dataset.',
    remote: true,
  },
];

export function ScoutingExportScopePanel({
  connected,
  source,
  eventKeysText,
  pendingUnsyncedChanges,
  localWarningConfirmationRequired,
  remoteFailure,
  onSourceChange,
  onEventKeysTextChange,
  onConfirmLocalExport,
  onUseLocalFallback,
}: ScoutingExportScopePanelProps) {
  const onlineFailureHeading =
    source === 'scoped-online' ? 'Scoped online export failed' : 'Online dataset export failed';

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">Scouting JSON export scope</legend>

      {choices.map(choice => {
        const disabled = choice.remote && !connected;

        return (
          <label
            key={choice.source}
            className={`flex items-start gap-3 rounded-md border p-3 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
          >
            <input
              type="radio"
              name="scouting-export-source"
              value={choice.source}
              checked={source === choice.source}
              disabled={disabled}
              onChange={() => onSourceChange(choice.source)}
              className="mt-1"
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">{choice.label}</span>
              <span className="block text-xs text-muted-foreground">{choice.description}</span>
            </span>
          </label>
        );
      })}

      {!connected && (
        <p className="text-xs text-muted-foreground">
          Join a Team dataset to use scoped or full online export.
        </p>
      )}

      {source === 'scoped-online' && connected && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Event keys</span>
          <input
            value={eventKeysText}
            onChange={event => onEventKeysTextChange(event.target.value)}
            placeholder="2026miket, 2026oncmp"
            className="w-full rounded-md border bg-background px-3 py-2"
          />
          <span className="block text-xs text-muted-foreground">
            Starts with this device&apos;s Event sync scope. Comma-separate additional events if
            needed; leave blank when the current scope is all events.
          </span>
        </label>
      )}

      {pendingUnsyncedChanges > 0 && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
          The local replica contains {pendingUnsyncedChanges} queued unsynced scouting{' '}
          {pendingUnsyncedChanges === 1 ? 'change' : 'changes'}.
        </p>
      )}

      {localWarningConfirmationRequired && (
        <div role="alert" className="space-y-2 rounded-md border border-amber-500 p-3">
          <p className="text-sm font-medium">Before exporting this device&apos;s local replica</p>
          <p className="text-xs text-muted-foreground">
            This file may be incomplete and is not a full Team dataset export.
          </p>
          <button
            type="button"
            onClick={onConfirmLocalExport}
            className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
          >
            Continue with local export
          </button>
        </div>
      )}

      {remoteFailure && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive p-3">
          <p className="text-sm font-medium">{onlineFailureHeading}</p>
          <p className="text-xs text-muted-foreground">{remoteFailure}</p>
          <p className="text-xs text-muted-foreground">
            No local export was created automatically, so the output scope has not silently changed.
          </p>
          <button
            type="button"
            onClick={onUseLocalFallback}
            className="rounded-md border px-3 py-2 text-sm"
          >
            Export current device&apos;s local replica instead
          </button>
        </div>
      )}
    </fieldset>
  );
}
