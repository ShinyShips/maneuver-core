import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Clipboard,
  FileJson,
  KeyRound,
  RefreshCw,
  Settings,
  ShieldCheck,
  Unplug,
  Upload,
  Wifi,
} from 'lucide-react';
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
import { Separator } from '@/core/components/ui/separator';
import { Textarea } from '@/core/components/ui/textarea';
import { useRemoteSyncConnection } from '@/core/hooks/useRemoteSyncConnection';
import { useRemoteSyncQueueHealth } from '@/core/hooks/useRemoteSyncQueueHealth';
import {
  createRemoteSyncConnection,
  parseDatasetJoinArtifact,
  type RemoteSyncDeviceDefaults,
} from '@/core/sync/remoteSyncConnection';
import { syncScoutingEntries } from '@/core/sync/remoteSyncEngine';
import type { DatasetJoinArtifact } from '@/core/sync';

export default function RemoteSyncPage() {
  const { connection, saveConnection, clearConnection } = useRemoteSyncConnection();
  const queueHealth = useRemoteSyncQueueHealth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [artifactText, setArtifactText] = useState('');
  const [artifact, setArtifact] = useState<DatasetJoinArtifact | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deviceDisplayName, setDeviceDisplayName] = useState(defaultDeviceName);
  const [scopeKey, setScopeKey] = useState('');

  const artifactSummary = useMemo(() => {
    if (!artifact) {
      return null;
    }

    return {
      datasetName: artifact.datasetName,
      datasetId: artifact.datasetId,
      projectId: artifact.firebase.projectId,
      credentialId: artifact.credentialId,
      recommendedScope: artifact.recommendedDefaults?.scopeKey,
    };
  }, [artifact]);

  const handleDecodeArtifact = (nextText = artifactText) => {
    const result = parseDatasetJoinArtifact(nextText);

    if (!result.ok) {
      setArtifact(null);
      setParseError(result.error);
      return;
    }

    const recommendedScope = result.artifact.recommendedDefaults?.scopeKey ?? '';
    setArtifact(result.artifact);
    setScopeKey(recommendedScope);
    setParseError(null);
  };

  const handleFileSelected = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    const text = await file.text();
    setArtifactText(text);
    handleDecodeArtifact(text);
  };

  const handleAttachDevice = () => {
    if (!artifact) {
      return;
    }

    const defaults: RemoteSyncDeviceDefaults = {
      deviceDisplayName: deviceDisplayName.trim() || defaultDeviceName(),
      scopeKey: scopeKey.trim() || undefined,
    };

    saveConnection(createRemoteSyncConnection(artifact, defaults));
  };

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setSyncStatus(null);
    setSyncError(null);

    try {
      const result = await syncScoutingEntries();
      setSyncStatus(
        `Pushed ${result.pushedCount} queued change${result.pushedCount === 1 ? '' : 's'} and applied ${result.pulledCount} remote change${result.pulledCount === 1 ? '' : 's'}.`
      );
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Remote sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <main className="min-h-screen w-full bg-background p-4 text-foreground md:p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Wifi className="size-6 text-muted-foreground" />
              <Badge variant="outline">Optional</Badge>
            </div>
            <h1 className="text-3xl font-semibold md:text-4xl">Remote sync</h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              Join a Team dataset from a reusable artifact while keeping scouting local-first.
            </p>
          </div>
          <Button asChild variant="outline">
            <a href="/utilities.html">
              <Settings />
              Operator setup
            </a>
          </Button>
        </header>

        {connection ? (
          <JoinedDatasetPanel
            connection={connection}
            pendingWrites={queueHealth.pendingWrites}
            queueState={queueHealth.state}
            isSyncing={isSyncing}
            onSyncNow={() => void handleSyncNow()}
            onDisconnect={clearConnection}
          />
        ) : (
          <Alert>
            <ShieldCheck />
            <AlertTitle>Offline-first stays on</AlertTitle>
            <AlertDescription>
              Attaching this device records the Team dataset and local defaults. Existing QR, JSON,
              and peer transfer workflows remain separate.
            </AlertDescription>
          </Alert>
        )}

        {syncError && (
          <Alert variant="destructive">
            <AlertTitle>Sync blocked</AlertTitle>
            <AlertDescription>{syncError}</AlertDescription>
          </Alert>
        )}

        {syncStatus && (
          <Alert>
            <AlertTitle>Sync complete</AlertTitle>
            <AlertDescription>{syncStatus}</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileJson className="size-5" />
                Join artifact
              </CardTitle>
              <CardDescription>
                Paste a join artifact from the Utilities app or import the JSON file.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Textarea
                className="min-h-64 resize-y font-mono text-xs"
                value={artifactText}
                onChange={event => setArtifactText(event.target.value)}
                placeholder='{"protocolVersion":1,"backend":"firebase",...}'
              />
              {parseError && (
                <Alert variant="destructive">
                  <AlertTitle>Artifact rejected</AlertTitle>
                  <AlertDescription>{parseError}</AlertDescription>
                </Alert>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" onClick={() => handleDecodeArtifact()}>
                  <Clipboard />
                  Review artifact
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload />
                  Import file
                </Button>
              </div>
              <input
                ref={fileInputRef}
                className="hidden"
                type="file"
                accept="application/json,.json"
                onChange={event => {
                  void handleFileSelected(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </CardContent>
          </Card>

          <Card className="rounded-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <KeyRound className="size-5" />
                Join review
              </CardTitle>
              <CardDescription>
                Confirm the dataset and edit this device&apos;s local defaults before attaching.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {artifactSummary ? (
                <>
                  <dl className="grid gap-3 rounded-md border border-border p-3 text-sm">
                    <ReviewRow label="Dataset" value={artifactSummary.datasetName} />
                    <ReviewRow label="Dataset ID" value={artifactSummary.datasetId} mono />
                    <ReviewRow label="Firebase project" value={artifactSummary.projectId} />
                    <ReviewRow label="Join credential" value={artifactSummary.credentialId} mono />
                    <ReviewRow
                      label="Recommended scope"
                      value={artifactSummary.recommendedScope ?? 'None'}
                    />
                  </dl>

                  <Alert>
                    <ShieldCheck />
                    <AlertTitle>Scout join only</AlertTitle>
                    <AlertDescription>
                      This artifact does not grant cleanup or recovery authority.
                    </AlertDescription>
                  </Alert>

                  <Separator />

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Device name" htmlFor="remote-sync-device-name">
                      <Input
                        id="remote-sync-device-name"
                        value={deviceDisplayName}
                        onChange={event => setDeviceDisplayName(event.target.value)}
                      />
                    </Field>
                    <Field label="Event scope" htmlFor="remote-sync-scope">
                      <Input
                        id="remote-sync-scope"
                        placeholder="2026miket"
                        value={scopeKey}
                        onChange={event => setScopeKey(event.target.value)}
                      />
                    </Field>
                  </div>

                  <Button type="button" onClick={handleAttachDevice}>
                    <CheckCircle2 />
                    Attach this device
                  </Button>
                </>
              ) : (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  <FileJson className="mb-3 size-8" />
                  Review a join artifact to continue.
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function JoinedDatasetPanel({
  connection,
  pendingWrites,
  queueState,
  isSyncing,
  onSyncNow,
  onDisconnect,
}: {
  connection: ReturnType<typeof createRemoteSyncConnection>;
  pendingWrites: number;
  queueState: string;
  isSyncing: boolean;
  onSyncNow: () => void;
  onDisconnect: () => void;
}) {
  return (
    <Card className="rounded-md border-emerald-500/40">
      <CardContent className="flex flex-col gap-4 pt-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" />
            <h2 className="text-lg font-semibold">Joined to {connection.datasetName}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Device {connection.deviceDisplayName}
            {connection.scopeKey ? ` / scope ${connection.scopeKey}` : ''} / {pendingWrites} queued
            change{pendingWrites === 1 ? '' : 's'} / {formatQueueState(queueState)}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" onClick={onSyncNow} disabled={isSyncing}>
            {isSyncing ? <RefreshCw className="animate-spin" /> : <RefreshCw />}
            Sync now
          </Button>
          <Button type="button" variant="outline" onClick={onDisconnect}>
            <Unplug />
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function ReviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? 'truncate font-mono text-xs' : 'truncate font-medium'}>{value}</dd>
    </div>
  );
}

function defaultDeviceName(): string {
  const platform = navigator.platform || 'Device';
  return `${platform} scout`;
}

function formatQueueState(state: string): string {
  switch (state) {
    case 'idle':
      return 'Queue idle';
    case 'healthy':
      return 'Queue healthy';
    case 'offline':
      return 'Ready when connected';
    case 'blocked':
      return 'Queue blocked';
    case 'error':
      return 'Needs attention';
    default:
      return 'Queue pending';
  }
}
