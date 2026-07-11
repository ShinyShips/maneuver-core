import { Activity, History, ShieldCheck } from 'lucide-react';
import { Badge } from '@/core/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/core/components/ui/card';
import { Separator } from '@/core/components/ui/separator';
import type { JoinedDatasetOverview } from '@/core/sync';

export function JoinedDatasetOverviewPanel({
  overview,
}: {
  overview: JoinedDatasetOverview;
}) {
  return (
    <Card className="rounded-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Activity className="size-5" />
          Dataset health
        </CardTitle>
        <CardDescription>
          Read-only shared status. Cleanup and recovery controls remain on privileged surfaces.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Service" value="Available" />
          <Summary
            label="Documents"
            value={`${overview.summary.documentCount} canonical document${overview.summary.documentCount === 1 ? '' : 's'}`}
          />
          <Summary
            label="Devices"
            value={`${overview.summary.joinedDeviceCount} joined device${overview.summary.joinedDeviceCount === 1 ? '' : 's'}`}
          />
          <Summary label="Current cursor" value={overview.summary.currentCursor.toString()} />
          <Summary label="Dataset created" value={formatTimestamp(overview.summary.createdAt)} />
          <Summary
            label="Last shared change"
            value={formatOptionalTimestamp(overview.summary.lastChangedAt)}
          />
          <Summary label="Health checked" value={formatTimestamp(overview.checkedAt)} />
        </div>

        <Separator />

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4" />
            Cleanup authority
          </h3>
          {overview.cleanupCapableDevices.length > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {overview.cleanupCapableDevices.map(device => (
                <li
                  key={device.deviceId}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <span className="min-w-0 truncate text-sm font-medium">{device.displayName}</span>
                  <Badge variant="outline">Cleanup capable</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No cleanup-capable devices are currently visible.
            </p>
          )}
        </section>

        <Separator />

        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-semibold">
            <History className="size-4" />
            Recent restores
          </h3>
          {overview.recentRestoreEvents.length > 0 ? (
            <ul className="space-y-3">
              {overview.recentRestoreEvents.map(event => (
                <li key={event.eventId} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium">{event.snapshotLabel}</p>
                  <p className="text-muted-foreground">
                    Snapshot <span className="font-mono text-xs">{event.snapshotId}</span> restored
                    by {event.actorDisplayName} at {formatTimestamp(event.occurredAt)}.
                  </p>
                  {event.reason && <p className="mt-2">{event.reason}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No shared restore events.</p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function formatOptionalTimestamp(timestamp: number | undefined): string {
  return timestamp === undefined ? 'No shared changes yet' : formatTimestamp(timestamp);
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
