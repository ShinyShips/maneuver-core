import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { JoinedDatasetOverviewPanel } from '@/core/components/remote-sync/JoinedDatasetOverviewPanel';
import { CleanupAuthorityPanel } from '@/core/components/remote-sync/CleanupAuthorityPanel';
import { PostRejoinRecoveryPanel } from '@/core/components/remote-sync/PostRejoinRecoveryPanel';
import { RejoinRecoveryReviewPanel } from '@/core/components/remote-sync/RejoinRecoveryReviewPanel';
import { useRemoteSyncConnection } from '@/core/hooks/useRemoteSyncConnection';
import { useRemoteSyncQueueHealth } from '@/core/hooks/useRemoteSyncQueueHealth';
import {
  createRemoteSyncConnection,
  parseDatasetJoinArtifact,
  type RemoteSyncConnection,
  type RemoteSyncDeviceDefaults,
} from '@/core/sync/remoteSyncConnection';
import {
  readJoinedDatasetOverview,
  syncScoutingEntries,
} from '@/core/sync/remoteSyncEngine';
import { createRemoteSyncAdapterForConnection } from '@/core/sync/remoteSyncAdapterFactory';
import {
  loadPendingScoutNameCollisions,
  loadRejoinRecoveryContext,
  parseCleanupDocumentTargets,
  parseDatasetCleanupProvisioningArtifact,
  resolveScoutNameCollision,
  preparePostRejoinRecoveryBatch,
  submitPostRejoinRecoveryBatch,
  updateEventSyncScope,
  type DatasetJoinArtifact,
  type EventSyncScopeChangeResult,
  type JoinedDatasetOverview,
  type PreparedPostRejoinRecoveryBatch,
  type RejoinRecoveryBatch,
  type RejoinRecoveryDecision,
  type RejoinRecoveryPreview,
} from '@/core/sync';

export default function RemoteSyncPage() {
  const { connection, clearConnection } = useRemoteSyncConnection();
  const queueHealth = useRemoteSyncQueueHealth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [artifactText, setArtifactText] = useState('');
  const [artifact, setArtifact] = useState<DatasetJoinArtifact | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deviceDisplayName, setDeviceDisplayName] = useState(defaultDeviceName);
  const [eventSyncScopeText, setEventSyncScopeText] = useState('');
  const [pendingJoinConnection, setPendingJoinConnection] = useState<RemoteSyncConnection | null>(
    null
  );
  const [joinScopeChange, setJoinScopeChange] = useState<EventSyncScopeChangeResult | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);
  const [datasetOverview, setDatasetOverview] = useState<JoinedDatasetOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);
  const [cleanupProvisioningArtifactText, setCleanupProvisioningArtifactText] = useState('');
  const [cleanupTargetsText, setCleanupTargetsText] = useState('');
  const [cleanupReason, setCleanupReason] = useState('');
  const [revocationTargetDeviceId, setRevocationTargetDeviceId] = useState('');
  const [cleanupStatus, setCleanupStatus] = useState<string | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [isCleanupBusy, setIsCleanupBusy] = useState(false);
  const [preparedRecovery, setPreparedRecovery] =
    useState<PreparedPostRejoinRecoveryBatch | null>(null);
  const [recoveryBatches, setRecoveryBatches] = useState<RejoinRecoveryBatch[]>([]);
  const [selectedRecoveryBatchId, setSelectedRecoveryBatchId] = useState('');
  const [recoveryPreview, setRecoveryPreview] = useState<RejoinRecoveryPreview | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState<string | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isRecoveryBusy, setIsRecoveryBusy] = useState(false);

  const refreshDatasetOverview = useCallback(async () => {
    if (!connection) {
      setDatasetOverview(null);
      setOverviewError(null);
      return;
    }

    setIsOverviewLoading(true);
    setOverviewError(null);

    try {
      setDatasetOverview(await readJoinedDatasetOverview());
    } catch (error) {
      setOverviewError(
        error instanceof Error ? error.message : 'Dataset health could not be loaded.'
      );
    } finally {
      setIsOverviewLoading(false);
    }
  }, [connection]);

  useEffect(() => {
    void refreshDatasetOverview();
  }, [refreshDatasetOverview]);

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
    setEventSyncScopeText(recommendedScope);
    setPendingJoinConnection(null);
    setJoinScopeChange(null);
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

  const handleAttachDevice = async () => {
    if (!artifact) {
      return;
    }

    const defaults: RemoteSyncDeviceDefaults = {
      deviceDisplayName: deviceDisplayName.trim() || defaultDeviceName(),
      eventKeys: parseEventKeys(eventSyncScopeText),
    };

    await applyJoinScope(createRemoteSyncConnection(artifact, defaults));
  };

  const applyJoinScope = async (
    nextConnection: RemoteSyncConnection,
    confirmDiscardUnsyncedWrites = false
  ) => {
    setIsAttaching(true);
    setJoinError(null);

    try {
      const eventKeys =
        nextConnection.eventSyncScope.mode === 'all'
          ? undefined
          : nextConnection.eventSyncScope.eventKeys;
      const result = await updateEventSyncScope(eventKeys, {
        connection: nextConnection,
        confirmDiscardUnsyncedWrites,
      });
      setJoinScopeChange(result);
      setPendingJoinConnection(result.status === 'confirmation-required' ? nextConnection : null);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'This device could not be attached.');
    } finally {
      setIsAttaching(false);
    }
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
      await refreshDatasetOverview();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Remote sync failed.');
    } finally {
      setIsSyncing(false);
    }
  };

  const cleanupCapable = Boolean(
    connection &&
      datasetOverview?.cleanupCapableDevices.some(device => device.deviceId === connection.deviceId)
  );

  const refreshRecoveryReview = useCallback(async () => {
    if (!connection || !cleanupCapable) {
      setRecoveryBatches([]);
      setRecoveryPreview(null);
      setSelectedRecoveryBatchId('');
      return;
    }
    const adapter = createRemoteSyncAdapterForConnection(connection);
    const batches = await adapter.listRejoinRecoveryBatches({
      datasetId: connection.datasetId,
      deviceId: connection.deviceId,
    });
    setRecoveryBatches(batches);
    const selectedBatchId = batches.some(batch => batch.batchId === selectedRecoveryBatchId)
      ? selectedRecoveryBatchId
      : (batches[0]?.batchId ?? '');
    setSelectedRecoveryBatchId(selectedBatchId);
    setRecoveryPreview(
      selectedBatchId
        ? await adapter.previewRejoinRecoveryBatch({
            datasetId: connection.datasetId,
            deviceId: connection.deviceId,
            batchId: selectedBatchId,
          })
        : null
    );
  }, [cleanupCapable, connection, selectedRecoveryBatchId]);

  useEffect(() => {
    const context = loadRejoinRecoveryContext();
    if (!connection || context?.datasetId !== connection.datasetId) {
      setPreparedRecovery(null);
      return;
    }
    void preparePostRejoinRecoveryBatch()
      .then(setPreparedRecovery)
      .catch(error =>
        setRecoveryError(
          error instanceof Error ? error.message : 'Local rejoin recovery could not be prepared.'
        )
      );
  }, [connection]);

  useEffect(() => {
    void refreshRecoveryReview().catch(error =>
      setRecoveryError(
        error instanceof Error ? error.message : 'Recovery batches could not be loaded.'
      )
    );
  }, [refreshRecoveryReview]);

  const handleSubmitRecovery = async () => {
    if (!connection) return;
    setIsRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const batch = await submitPostRejoinRecoveryBatch(
        createRemoteSyncAdapterForConnection(connection)
      );
      setPreparedRecovery(null);
      setRecoveryStatus(
        `Submitted ${batch.entries.length} local entr${batch.entries.length === 1 ? 'y' : 'ies'} for privileged review.`
      );
      await refreshRecoveryReview();
    } catch (error) {
      setRecoveryError(
        error instanceof Error ? error.message : 'Local recovery batch could not be submitted.'
      );
    } finally {
      setIsRecoveryBusy(false);
    }
  };

  const handleRecoveryDecision = async (decision: RejoinRecoveryDecision) => {
    if (!connection || !selectedRecoveryBatchId) return;
    setIsRecoveryBusy(true);
    setRecoveryError(null);
    try {
      await createRemoteSyncAdapterForConnection(connection).reviewRejoinRecoveryBatch({
        datasetId: connection.datasetId,
        deviceId: connection.deviceId,
        batchId: selectedRecoveryBatchId,
        decisions: [decision],
      });
      setRecoveryStatus('Recovery entry decision saved.');
      await refreshRecoveryReview();
    } catch (error) {
      setRecoveryError(
        error instanceof Error ? error.message : 'Recovery entry decision could not be saved.'
      );
    } finally {
      setIsRecoveryBusy(false);
    }
  };

  const handleRecoveryReconsideration = async (entryId: string) => {
    if (!connection || !selectedRecoveryBatchId) return;
    setIsRecoveryBusy(true);
    setRecoveryError(null);
    try {
      await createRemoteSyncAdapterForConnection(connection).reconsiderRejectedRejoinEntries({
        datasetId: connection.datasetId,
        deviceId: connection.deviceId,
        batchId: selectedRecoveryBatchId,
        entryIds: [entryId],
      });
      setRecoveryStatus('Held recovery entry returned to pending review.');
      await refreshRecoveryReview();
    } catch (error) {
      setRecoveryError(
        error instanceof Error ? error.message : 'Held recovery entry could not be reconsidered.'
      );
    } finally {
      setIsRecoveryBusy(false);
    }
  };

  const handleProvisionCleanupAuthority = async () => {
    if (!connection) {
      return;
    }

    setIsCleanupBusy(true);
    setCleanupError(null);
    setCleanupStatus(null);
    try {
      const parsed = parseDatasetCleanupProvisioningArtifact(cleanupProvisioningArtifactText);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      if (
        parsed.artifact.datasetId !== connection.datasetId ||
        parsed.artifact.firebase.projectId !== connection.projectId ||
        parsed.artifact.provisionedDeviceId !== connection.deviceId
      ) {
        throw new Error('Cleanup provisioning artifact does not match this joined device.');
      }

      const adapter = createRemoteSyncAdapterForConnection(connection);
      await adapter.provisionCleanupAuthority({
        datasetId: connection.datasetId,
        deviceId: connection.deviceId,
        credentialId: parsed.artifact.cleanupCredentialId,
        credentialSecret: parsed.artifact.cleanupCredentialSecret,
        credentialExpiresAt: parsed.artifact.cleanupCredentialExpiresAt,
      });
      setCleanupProvisioningArtifactText('');
      setCleanupStatus('This device is now cleanup capable.');
      await refreshDatasetOverview();
    } catch (error) {
      setCleanupError(
        error instanceof Error ? error.message : 'Cleanup authority could not be provisioned.'
      );
    } finally {
      setIsCleanupBusy(false);
    }
  };

  const handleReplicatedCleanup = async () => {
    if (!connection) {
      return;
    }

    setIsCleanupBusy(true);
    setCleanupError(null);
    setCleanupStatus(null);
    try {
      const targets = parseCleanupDocumentTargets(cleanupTargetsText);
      if (targets.length === 0) {
        throw new Error('Enter at least one shared document target.');
      }

      const adapter = createRemoteSyncAdapterForConnection(connection);
      const result = await adapter.cleanupCanonicalDocuments({
        datasetId: connection.datasetId,
        deviceId: connection.deviceId,
        targets,
        ...(cleanupReason.trim() ? { reason: cleanupReason.trim() } : {}),
      });
      await syncScoutingEntries(adapter);
      setCleanupTargetsText('');
      setCleanupReason('');
      setCleanupStatus(
        `Deleted ${result.cleanedDocuments.length} shared document${result.cleanedDocuments.length === 1 ? '' : 's'} with attributed replicated tombstones.`
      );
      await refreshDatasetOverview();
    } catch (error) {
      setCleanupError(
        error instanceof Error ? error.message : 'Destructive replicated cleanup failed.'
      );
    } finally {
      setIsCleanupBusy(false);
    }
  };

  const handleRevokeJoinedDevice = async () => {
    if (!connection || !revocationTargetDeviceId) {
      return;
    }

    setIsCleanupBusy(true);
    setCleanupError(null);
    setCleanupStatus(null);
    try {
      const target = datasetOverview?.joinedDevices.find(
        device => device.deviceId === revocationTargetDeviceId
      );
      await createRemoteSyncAdapterForConnection(connection).revokeJoinedDevice({
        datasetId: connection.datasetId,
        actorDeviceId: connection.deviceId,
        targetDeviceId: revocationTargetDeviceId,
      });
      setRevocationTargetDeviceId('');
      setCleanupStatus(
        `${target?.displayName ?? 'The selected device'} was revoked. Reauthorization requires the normal join flow.`
      );
      await refreshDatasetOverview();
    } catch (error) {
      setCleanupError(error instanceof Error ? error.message : 'Device revocation failed.');
    } finally {
      setIsCleanupBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connection) {
      return;
    }

    setCleanupError(null);
    try {
      await createRemoteSyncAdapterForConnection(connection).deprovisionCleanupAuthority({
        datasetId: connection.datasetId,
        deviceId: connection.deviceId,
      });
    } catch (error) {
      setCleanupError(
        error instanceof Error
          ? `Cleanup authority could not be removed: ${error.message}`
          : 'Cleanup authority could not be removed before disconnecting.'
      );
      return;
    }
    clearConnection();
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
          <>
            <JoinedDatasetPanel
              connection={connection}
              pendingWrites={queueHealth.pendingWrites}
              queueState={queueHealth.state}
              isSyncing={isSyncing}
              onSyncNow={() => void handleSyncNow()}
              onCollisionResolved={() => void handleSyncNow()}
              onDisconnect={() => void handleDisconnect()}
            />
            {preparedRecovery && (
              <PostRejoinRecoveryPanel
                prepared={preparedRecovery}
                busy={isRecoveryBusy}
                onSubmit={() => void handleSubmitRecovery()}
              />
            )}
            {isOverviewLoading && !datasetOverview && (
              <Alert>
                <AlertTitle>Loading dataset health</AlertTitle>
                <AlertDescription>Reading the shared Team dataset overview.</AlertDescription>
              </Alert>
            )}
            {overviewError && (
              <Alert variant="destructive">
                <AlertTitle>Dataset health unavailable</AlertTitle>
                <AlertDescription>{overviewError}</AlertDescription>
              </Alert>
            )}
            {datasetOverview && <JoinedDatasetOverviewPanel overview={datasetOverview} />}
            <CleanupAuthorityPanel
              cleanupCapable={cleanupCapable}
              currentDeviceId={connection.deviceId}
              joinedDevices={datasetOverview?.joinedDevices ?? []}
              revocationTargetDeviceId={revocationTargetDeviceId}
              cleanupProvisioningArtifactText={cleanupProvisioningArtifactText}
              cleanupTargetsText={cleanupTargetsText}
              cleanupReason={cleanupReason}
              busy={isCleanupBusy}
              onCleanupProvisioningArtifactTextChange={setCleanupProvisioningArtifactText}
              onCleanupTargetsTextChange={setCleanupTargetsText}
              onCleanupReasonChange={setCleanupReason}
              onRevocationTargetDeviceIdChange={setRevocationTargetDeviceId}
              onProvision={() => void handleProvisionCleanupAuthority()}
              onCleanup={() => void handleReplicatedCleanup()}
              onRevokeDevice={() => void handleRevokeJoinedDevice()}
            />
            {cleanupCapable && (
              <RejoinRecoveryReviewPanel
                batches={recoveryBatches}
                selectedBatchId={selectedRecoveryBatchId}
                preview={recoveryPreview}
                busy={isRecoveryBusy}
                onSelectBatch={setSelectedRecoveryBatchId}
                onDecision={decision => void handleRecoveryDecision(decision)}
                onReconsider={entryId => void handleRecoveryReconsideration(entryId)}
              />
            )}
            {recoveryStatus && (
              <Alert>
                <AlertTitle>Recovery status</AlertTitle>
                <AlertDescription>{recoveryStatus}</AlertDescription>
              </Alert>
            )}
            {recoveryError && (
              <Alert variant="destructive">
                <AlertTitle>Recovery blocked</AlertTitle>
                <AlertDescription>{recoveryError}</AlertDescription>
              </Alert>
            )}
            {cleanupStatus && (
              <Alert>
                <AlertTitle>Cleanup status</AlertTitle>
                <AlertDescription>{cleanupStatus}</AlertDescription>
              </Alert>
            )}
            {cleanupError && (
              <Alert variant="destructive">
                <AlertTitle>Cleanup blocked</AlertTitle>
                <AlertDescription>{cleanupError}</AlertDescription>
              </Alert>
            )}
          </>
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
                        value={eventSyncScopeText}
                        onChange={event => {
                          setEventSyncScopeText(event.target.value);
                          setPendingJoinConnection(null);
                          setJoinScopeChange(null);
                        }}
                      />
                    </Field>
                  </div>

                  {joinScopeChange?.status === 'confirmation-required' && pendingJoinConnection && (
                    <Alert variant="destructive">
                      <AlertTitle>Local records need confirmation</AlertTitle>
                      <AlertDescription className="space-y-3">
                        <p>
                          This Event sync scope would discard {joinScopeChange.unsyncedWriteCount}{' '}
                          unsynced local write
                          {joinScopeChange.unsyncedWriteCount === 1 ? '' : 's'} and prune{' '}
                          {joinScopeChange.prunableRecordCount} local scouting record
                          {joinScopeChange.prunableRecordCount === 1 ? '' : 's'} while attaching.
                          The Team dataset will not be changed.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={isAttaching}
                            onClick={() => void applyJoinScope(pendingJoinConnection, true)}
                          >
                            Confirm and attach
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setPendingJoinConnection(null);
                              setJoinScopeChange(null);
                            }}
                          >
                            Keep local records
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {joinError && (
                    <Alert variant="destructive">
                      <AlertTitle>Join blocked</AlertTitle>
                      <AlertDescription>{joinError}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="button"
                    disabled={isAttaching}
                    onClick={() => void handleAttachDevice()}
                  >
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
  onCollisionResolved,
  onDisconnect,
}: {
  connection: RemoteSyncConnection;
  pendingWrites: number;
  queueState: string;
  isSyncing: boolean;
  onSyncNow: () => void;
  onCollisionResolved: () => void;
  onDisconnect: () => void;
}) {
  const [scopeText, setScopeText] = useState(() => formatEventSyncScopeInput(connection));
  const [scopeChange, setScopeChange] = useState<EventSyncScopeChangeResult | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [isSavingScope, setIsSavingScope] = useState(false);
  const [pendingCollisions, setPendingCollisions] = useState(() =>
    loadPendingScoutNameCollisions(connection.datasetId)
  );
  const [replacementName, setReplacementName] = useState('');
  const [collisionError, setCollisionError] = useState<string | null>(null);

  useEffect(() => {
    const refreshCollisions = () => {
      setPendingCollisions(loadPendingScoutNameCollisions(connection.datasetId));
    };

    refreshCollisions();
    window.addEventListener('remoteSyncQueueChanged', refreshCollisions);
    return () => window.removeEventListener('remoteSyncQueueChanged', refreshCollisions);
  }, [connection.datasetId]);

  useEffect(() => {
    setScopeText(formatEventSyncScopeInput(connection));
  }, [connection]);

  const handleScopeUpdate = async (confirmDiscardUnsyncedWrites = false) => {
    setIsSavingScope(true);
    setScopeError(null);

    try {
      const result = await updateEventSyncScope(parseEventKeys(scopeText), {
        confirmDiscardUnsyncedWrites,
      });
      setScopeChange(result);
    } catch (error) {
      setScopeError(
        error instanceof Error ? error.message : 'Event sync scope could not be saved.'
      );
    } finally {
      setIsSavingScope(false);
    }
  };

  const handleCollisionResolution = async (
    decision: 'join-existing' | 'use-another-name'
  ) => {
    const collision = pendingCollisions[0];

    if (!collision) {
      return;
    }

    setCollisionError(null);

    try {
      await resolveScoutNameCollision(
        decision === 'join-existing'
          ? {
              datasetId: collision.datasetId,
              documentId: collision.documentId,
              decision,
            }
          : {
              datasetId: collision.datasetId,
              documentId: collision.documentId,
              decision,
              replacementName,
            }
      );
      setReplacementName('');
      setPendingCollisions(loadPendingScoutNameCollisions(connection.datasetId));
      onCollisionResolved();
    } catch (error) {
      setCollisionError(
        error instanceof Error ? error.message : 'Scout-name collision could not be resolved.'
      );
    }
  };

  return (
    <Card className="rounded-md border-emerald-500/40">
      <CardContent className="flex flex-col gap-5 pt-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              <h2 className="text-lg font-semibold">Joined to {connection.datasetName}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Device {connection.deviceDisplayName} / {formatEventSyncScope(connection)} /{' '}
              {pendingWrites} queued change{pendingWrites === 1 ? '' : 's'} /{' '}
              {formatQueueState(queueState)}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Device ID: {connection.deviceId}
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
        </div>

        <Separator />

        {pendingCollisions[0] && (
          <Alert variant="destructive">
            <AlertTitle>Scout-name collision</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                Local Scout profile <strong>{pendingCollisions[0].localName}</strong> matches the
                existing Team dataset profile <strong>{pendingCollisions[0].remoteName}</strong>.
                Choose explicitly before profile sync continues.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => void handleCollisionResolution('join-existing')}
                >
                  Join existing profile
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  aria-label="Replacement Scout name"
                  placeholder="Use another Scout name"
                  value={replacementName}
                  onChange={event => setReplacementName(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!replacementName.trim()}
                  onClick={() => void handleCollisionResolution('use-another-name')}
                >
                  Use another name
                </Button>
              </div>
              {collisionError && <p>{collisionError}</p>}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <Field label="Event sync scope" htmlFor="joined-remote-sync-scope">
            <Input
              id="joined-remote-sync-scope"
              placeholder="All events, or comma-separated event keys"
              value={scopeText}
              onChange={event => {
                setScopeText(event.target.value);
                setScopeChange(null);
              }}
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={isSavingScope}
            onClick={() => void handleScopeUpdate()}
          >
            Save local scope
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Blank means all events. Narrowing this device&apos;s scope prunes out-of-scope scouting
          records locally; it never deletes records from the shared Team dataset.
        </p>

        {scopeChange?.status === 'confirmation-required' && (
          <Alert variant="destructive">
            <AlertTitle>Destructive scope change</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                This local-only change would discard {scopeChange.unsyncedWriteCount} unsynced local
                write{scopeChange.unsyncedWriteCount === 1 ? '' : 's'} and prune{' '}
                {scopeChange.prunableRecordCount} local scouting record
                {scopeChange.prunableRecordCount === 1 ? '' : 's'}. Team dataset records are not
                deleted.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isSavingScope}
                  onClick={() => void handleScopeUpdate(true)}
                >
                  Confirm local pruning
                </Button>
                <Button type="button" variant="outline" onClick={() => setScopeChange(null)}>
                  Keep current scope
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {scopeChange?.status === 'applied' && (
          <Alert>
            <AlertTitle>Local scope updated</AlertTitle>
            <AlertDescription>
              Pruned {scopeChange.prunedRecordCount} local record
              {scopeChange.prunedRecordCount === 1 ? '' : 's'}. Team dataset contents were not
              changed.
            </AlertDescription>
          </Alert>
        )}

        {scopeError && (
          <Alert variant="destructive">
            <AlertTitle>Scope update blocked</AlertTitle>
            <AlertDescription>{scopeError}</AlertDescription>
          </Alert>
        )}
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

function parseEventKeys(value: string): string[] | undefined {
  const eventKeys = value
    .split(/[\s,]+/)
    .map(eventKey => eventKey.trim())
    .filter(Boolean);
  return eventKeys.length > 0 ? eventKeys : undefined;
}

function formatEventSyncScope(connection: RemoteSyncConnection): string {
  return formatEventSyncScopeValue(connection, 'All events');
}

function formatEventSyncScopeInput(connection: RemoteSyncConnection): string {
  return formatEventSyncScopeValue(connection, '');
}

function formatEventSyncScopeValue(
  connection: RemoteSyncConnection,
  allEventsValue: string
): string {
  return connection.eventSyncScope.mode === 'all'
    ? allEventsValue
    : connection.eventSyncScope.eventKeys.join(', ');
}
