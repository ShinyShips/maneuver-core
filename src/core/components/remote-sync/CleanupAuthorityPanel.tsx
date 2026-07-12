import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/core/components/ui/alert';
import { Badge } from '@/core/components/ui/badge';
import { Button } from '@/core/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/core/components/ui/card';
import { Input } from '@/core/components/ui/input';
import { Label } from '@/core/components/ui/label';
import { Textarea } from '@/core/components/ui/textarea';
import type { JoinedDeviceSummary } from '@/core/sync';

export interface CleanupAuthorityPanelProps {
  cleanupCapable: boolean;
  currentDeviceId: string;
  joinedDevices: JoinedDeviceSummary[];
  revocationTargetDeviceId: string;
  cleanupProvisioningArtifactText: string;
  cleanupTargetsText: string;
  cleanupReason: string;
  busy: boolean;
  onCleanupProvisioningArtifactTextChange: (value: string) => void;
  onCleanupTargetsTextChange: (value: string) => void;
  onCleanupReasonChange: (value: string) => void;
  onRevocationTargetDeviceIdChange: (value: string) => void;
  onProvision: () => void;
  onCleanup: () => void;
  onRevokeDevice: () => void;
}

export function CleanupAuthorityPanel({
  cleanupCapable,
  currentDeviceId,
  joinedDevices,
  revocationTargetDeviceId,
  cleanupProvisioningArtifactText,
  cleanupTargetsText,
  cleanupReason,
  busy,
  onCleanupProvisioningArtifactTextChange,
  onCleanupTargetsTextChange,
  onCleanupReasonChange,
  onRevocationTargetDeviceIdChange,
  onProvision,
  onCleanup,
  onRevokeDevice,
}: CleanupAuthorityPanelProps) {
  const revocationTargets = joinedDevices.filter(device => device.deviceId !== currentDeviceId);
  return (
    <Card className="rounded-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {cleanupCapable ? (
            <ShieldCheck className="size-5 text-emerald-500" />
          ) : (
            <ShieldAlert className="size-5" />
          )}
          {cleanupCapable ? 'Cleanup authority active' : 'Provision cleanup authority'}
        </CardTitle>
        <CardDescription>
          Cleanup authority is separate from ordinary Dataset join access.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!cleanupCapable ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="cleanup-provisioning-artifact">Cleanup provisioning artifact</Label>
              <Textarea
                id="cleanup-provisioning-artifact"
                className="min-h-36 font-mono text-xs"
                value={cleanupProvisioningArtifactText}
                onChange={event => onCleanupProvisioningArtifactTextChange(event.target.value)}
                placeholder="Paste the device-specific cleanup provisioning artifact JSON"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !cleanupProvisioningArtifactText.trim()}
              onClick={onProvision}
            >
              Provision this device
            </Button>
          </>
        ) : (
          <>
            <Badge variant="outline" className="w-fit">
              Cleanup capable
            </Badge>
            <Alert variant="destructive">
              <AlertTitle>Destructive replicated cleanup</AlertTitle>
              <AlertDescription>
                This creates replicated tombstones in the shared Team dataset. It does not change
                this device&apos;s Event sync scope or perform a local reset.
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label htmlFor="cleanup-targets">Shared document targets</Label>
              <Textarea
                id="cleanup-targets"
                className="min-h-28 font-mono text-xs"
                value={cleanupTargetsText}
                onChange={event => onCleanupTargetsTextChange(event.target.value)}
                placeholder="match-scouting-entry|2026miket::qm1::3314::red"
              />
              <p className="text-xs text-muted-foreground">
                Enter one document per line as document-type|document-id.
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cleanup-reason">Reason</Label>
              <Input
                id="cleanup-reason"
                value={cleanupReason}
                onChange={event => onCleanupReasonChange(event.target.value)}
                placeholder="Why are these shared documents being removed?"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !cleanupTargetsText.trim()}
              onClick={onCleanup}
            >
              Delete selected shared documents
            </Button>
            <Alert variant="destructive">
              <AlertTitle>Revoke joined device</AlertTitle>
              <AlertDescription>
                The selected device will lose Remote sync access and its queued remote writes will
                be discarded when it next connects. Its local scouting data and ordinary app use
                remain available.
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              <Label htmlFor="revocation-target-device">Joined device</Label>
              <select
                id="revocation-target-device"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={revocationTargetDeviceId}
                onChange={event => onRevocationTargetDeviceIdChange(event.target.value)}
              >
                <option value="">Select a device</option>
                {revocationTargets.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.displayName} ({device.deviceId})
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !revocationTargetDeviceId}
              onClick={onRevokeDevice}
            >
              Revoke selected device
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
