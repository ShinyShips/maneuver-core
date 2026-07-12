import { useMemo, useState, type ReactNode } from 'react';
import { Copy, Database, Download, KeyRound, PlugZap, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Alert, AlertDescription, AlertTitle } from '@/core/components/ui/alert';
import { Button } from '@/core/components/ui/button';
import { Input } from '@/core/components/ui/input';
import { Label } from '@/core/components/ui/label';
import { Textarea } from '@/core/components/ui/textarea';
import {
  createFirebaseRemoteSyncAdapter,
  getFirebaseRemoteSyncConfigFromEnv,
  type DatasetCleanupCredential,
  type DatasetCleanupProvisioningArtifact,
  type DatasetJoinArtifact,
  type DatasetJoinCredential,
  type DatasetOperatorRecoveryArtifact,
  type RemoteSyncAdapter,
  type TeamDataset,
} from '@/core/sync';

const OPERATOR_DEVICE_KEY = 'maneuver.utilities.operatorDeviceId';

interface CreatedDatasetState {
  dataset: TeamDataset;
  joinCredential: DatasetJoinCredential;
  cleanupCredential: DatasetCleanupCredential;
  artifact: DatasetJoinArtifact;
  recoveryArtifact: DatasetOperatorRecoveryArtifact;
}

export function UtilitiesApp() {
  const config = useMemo(() => getFirebaseRemoteSyncConfigFromEnv(), []);
  const [adapter, setAdapter] = useState<RemoteSyncAdapter | null>(null);
  const [operatorDeviceId] = useState(() => getOrCreateOperatorDeviceId());
  const [displayName, setDisplayName] = useState('Team dataset');
  const [teamNumber, setTeamNumber] = useState('');
  const [season, setSeason] = useState(new Date().getFullYear().toString());
  const [scopeKey, setScopeKey] = useState('');
  const [cleanupDeviceId, setCleanupDeviceId] = useState('');
  const [created, setCreated] = useState<CreatedDatasetState | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const artifactJson = created ? JSON.stringify(created.artifact, null, 2) : '';
  const cleanupProvisioningArtifactJson =
    created && cleanupDeviceId.trim()
      ? JSON.stringify(
          {
            ...created.recoveryArtifact,
            provisionedDeviceId: cleanupDeviceId.trim(),
          } satisfies DatasetCleanupProvisioningArtifact,
          null,
          2
        )
      : '';
  const isConfigured = Boolean(config);
  const isConnected = Boolean(adapter);

  const handleConnect = () => {
    if (!config) {
      setError('Firebase project configuration is missing.');
      return;
    }

    setAdapter(createFirebaseRemoteSyncAdapter(config));
    setError(null);
    setStatus('Connected to configured Firebase backend.');
  };

  const handleCreateDataset = async () => {
    if (!adapter || !config) {
      setError('Connect Firebase before creating a Team dataset.');
      return;
    }

    setIsBusy(true);
    setError(null);
    setStatus(null);

    try {
      const dataset = await adapter.createDataset({
        displayName: displayName.trim() || 'Team dataset',
        operatorDeviceId,
        teamNumber: parseOptionalNumber(teamNumber),
        season: parseOptionalNumber(season),
      });
      const [joinCredential, cleanupCredential] = await Promise.all([
        adapter.createJoinCredential({
          datasetId: dataset.datasetId,
          operatorDeviceId,
        }),
        adapter.createCleanupCredential({
          datasetId: dataset.datasetId,
          operatorDeviceId,
        }),
      ]);
      const artifact: DatasetJoinArtifact = {
        protocolVersion: 1,
        backend: 'firebase',
        datasetId: dataset.datasetId,
        datasetName: dataset.displayName,
        credentialId: joinCredential.credentialId,
        credentialSecret: joinCredential.secret,
        firebase: config.firebase,
        firestoreEmulator: config.firestoreEmulator,
        recommendedDefaults: {
          scopeKey: scopeKey.trim() || undefined,
          queueMode: 'local-first',
        },
      };
      const recoveryArtifact: DatasetOperatorRecoveryArtifact = {
        protocolVersion: 1,
        backend: 'firebase',
        datasetId: dataset.datasetId,
        datasetName: dataset.displayName,
        cleanupCredentialId: cleanupCredential.credentialId,
        cleanupCredentialSecret: cleanupCredential.secret,
        cleanupCredentialExpiresAt: cleanupCredential.expiresAt,
        firebase: config.firebase,
        firestoreEmulator: config.firestoreEmulator,
      };

      setCreated({
        dataset,
        joinCredential,
        cleanupCredential,
        artifact,
        recoveryArtifact,
      });
      setStatus('Team dataset and reusable join artifact created.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Dataset creation failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyArtifact = async () => {
    if (!artifactJson) {
      return;
    }

    await navigator.clipboard.writeText(artifactJson);
    setStatus('Join artifact copied.');
  };

  const handleDownloadArtifact = () => {
    if (!created) {
      return;
    }

    const blob = new Blob([artifactJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${toFileSlug(created.dataset.displayName)}-join-artifact.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Join artifact downloaded.');
  };

  const handleDownloadRecoveryArtifact = () => {
    if (!created) {
      return;
    }

    const blob = new Blob([JSON.stringify(created.recoveryArtifact, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${toFileSlug(created.dataset.displayName)}-operator-recovery.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Operator recovery artifact downloaded.');
  };

  const handleDownloadCleanupProvisioningArtifact = () => {
    if (!created || !cleanupProvisioningArtifactJson) {
      return;
    }

    const blob = new Blob([cleanupProvisioningArtifactJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${toFileSlug(created.dataset.displayName)}-cleanup-device.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus('Device-specific cleanup provisioning artifact downloaded.');
  };

  return (
    <main className="min-h-screen w-full min-w-0 overflow-x-hidden bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-border pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase text-muted-foreground">
              Maneuver Utilities
            </p>
            <h1 className="mt-1 text-3xl font-semibold text-foreground md:text-4xl">
              Remote sync setup
            </h1>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span
              className={
                isConnected
                  ? 'h-2.5 w-2.5 rounded-full bg-emerald-500'
                  : 'h-2.5 w-2.5 rounded-full bg-muted-foreground'
              }
            />
            <span>{isConnected ? 'Connected' : 'Not connected'}</span>
          </div>
        </header>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Remote sync error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {status && (
          <Alert>
            <AlertTitle>Status</AlertTitle>
            <AlertDescription>{status}</AlertDescription>
          </Alert>
        )}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <PlugZap className="size-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Backend</h2>
            </div>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Project</dt>
                <dd className="truncate font-medium">{config?.firebase.projectId ?? 'Missing'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Firestore</dt>
                <dd className="truncate font-medium">
                  {config?.firestoreEmulator
                    ? `${config.firestoreEmulator.host}:${config.firestoreEmulator.port}`
                    : isConfigured
                      ? 'Hosted'
                      : 'Missing'}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Operator device</dt>
                <dd className="max-w-52 truncate font-mono text-xs">{operatorDeviceId}</dd>
              </div>
            </dl>
            <Button type="button" onClick={handleConnect} disabled={!isConfigured || isBusy}>
              <PlugZap />
              Connect
            </Button>
          </div>

          <form
            className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
            onSubmit={event => {
              event.preventDefault();
              void handleCreateDataset();
            }}
          >
            <div className="flex items-center gap-2">
              <Database className="size-5 text-muted-foreground" />
              <h2 className="text-xl font-semibold">Team dataset</h2>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Dataset name" htmlFor="dataset-name">
                <Input
                  id="dataset-name"
                  value={displayName}
                  onChange={event => setDisplayName(event.target.value)}
                />
              </Field>
              <Field label="Team number" htmlFor="team-number">
                <Input
                  id="team-number"
                  inputMode="numeric"
                  value={teamNumber}
                  onChange={event => setTeamNumber(event.target.value)}
                />
              </Field>
              <Field label="Season" htmlFor="season">
                <Input
                  id="season"
                  inputMode="numeric"
                  value={season}
                  onChange={event => setSeason(event.target.value)}
                />
              </Field>
              <Field label="Event scope" htmlFor="event-scope">
                <Input
                  id="event-scope"
                  placeholder="2026miket"
                  value={scopeKey}
                  onChange={event => setScopeKey(event.target.value)}
                />
              </Field>
            </div>

            <Button type="submit" disabled={!isConnected || isBusy}>
              {isBusy ? <RefreshCw className="animate-spin" /> : <KeyRound />}
              Create dataset
            </Button>
          </form>
        </section>

        <section className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="flex min-h-72 flex-col items-center justify-center gap-4 rounded-md border border-border bg-card p-4">
            {created ? (
              <>
                <QRCodeSVG value={artifactJson} size={224} level="M" includeMargin />
                <div className="flex items-center gap-2 text-sm font-medium">
                  <QrCode className="size-4" />
                  Join artifact
                </div>
              </>
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                <QrCode className="mx-auto mb-3 size-8" />
                No artifact
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Artifact payload</h2>
                {created && (
                  <p className="text-sm text-muted-foreground">
                    {created.dataset.displayName} / cleanup {created.cleanupCredential.credentialId}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyArtifact()}
                  disabled={!created}
                >
                  <Copy />
                  Copy
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadArtifact}
                  disabled={!created}
                >
                  <Download />
                  Download
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadRecoveryArtifact}
                  disabled={!created}
                >
                  <KeyRound />
                  Recovery
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadCleanupProvisioningArtifact}
                  disabled={!cleanupProvisioningArtifactJson}
                >
                  <ShieldCheck />
                  Cleanup device
                </Button>
              </div>
            </div>
            <Textarea
              className="min-h-72 resize-y font-mono text-xs"
              readOnly
              value={artifactJson}
              placeholder="{}"
            />
            <Field label="Cleanup-capable device ID" htmlFor="cleanup-device-id">
              <Input
                id="cleanup-device-id"
                value={cleanupDeviceId}
                onChange={event => setCleanupDeviceId(event.target.value)}
                placeholder="Paste the joined device ID shown in Remote sync"
              />
            </Field>
            <Textarea
              className="min-h-48 resize-y font-mono text-xs"
              readOnly
              value={cleanupProvisioningArtifactJson}
              placeholder="Enter a device ID to create a device-specific cleanup artifact."
            />
          </div>
        </section>
      </div>
    </main>
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

function toFileSlug(value: string): string {
  return value.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'team-dataset';
}

function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getOrCreateOperatorDeviceId(): string {
  const existing = window.localStorage.getItem(OPERATOR_DEVICE_KEY);

  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.localStorage.setItem(OPERATOR_DEVICE_KEY, next);
  return next;
}
