import { ShieldCheck } from 'lucide-react';
import { Badge } from '@/core/components/ui/badge';
import { Button } from '@/core/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import type {
  RejoinRecoveryBatch,
  RejoinRecoveryDecision,
  RejoinRecoveryPreview,
} from '@/core/sync';

export interface RejoinRecoveryReviewPanelProps {
  batches: RejoinRecoveryBatch[];
  selectedBatchId: string;
  preview: RejoinRecoveryPreview | null;
  busy: boolean;
  onSelectBatch: (batchId: string) => void;
  onDecision: (decision: RejoinRecoveryDecision) => void;
  onReconsider: (entryId: string) => void;
}

export function RejoinRecoveryReviewPanel({
  batches,
  selectedBatchId,
  preview,
  busy,
  onSelectBatch,
  onDecision,
  onReconsider,
}: RejoinRecoveryReviewPanelProps) {
  return (
    <Card className="rounded-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShieldCheck className="size-5 text-emerald-500" />
          Recovery batch review
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rejoin recovery batches are awaiting review.</p>
        ) : (
          <select
            aria-label="Rejoin recovery batch"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            value={selectedBatchId}
            onChange={event => onSelectBatch(event.target.value)}
          >
            {batches.map(batch => (
              <option key={batch.batchId} value={batch.batchId}>
                {new Date(batch.submittedAt).toLocaleString()} / {batch.entries.length} entries /{' '}
                {formatBatchStatus(batch.status)}
              </option>
            ))}
          </select>
        )}

        {preview && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Submitted by {preview.batch.submittedByDeviceId} after revocation of{' '}
              {preview.batch.revokedDeviceId}. Review each suspicious or conflicting entry before
              import.
            </p>
            {preview.entries.map(item => (
              <div key={item.entry.entryId} className="flex flex-col gap-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.entry.document.documentId}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.entry.document.documentType}
                    </p>
                  </div>
                  <Badge variant="outline">{formatPreviewStatus(item.previewStatus)}</Badge>
                </div>
                {item.conflictReason && (
                  <p className="text-sm text-destructive">{item.conflictReason}</p>
                )}
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">Drill down into entry</summary>
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    <pre className="max-h-56 overflow-auto rounded bg-muted p-2">
                      {JSON.stringify(item.canonicalDocument?.payload ?? null, null, 2)}
                    </pre>
                    <pre className="max-h-56 overflow-auto rounded bg-muted p-2">
                      {JSON.stringify(item.entry.document.payload, null, 2)}
                    </pre>
                  </div>
                </details>
                <div className="flex flex-wrap gap-2">
                  {item.entry.status === 'pending' && item.previewStatus === 'manual-conflict' && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onDecision({
                          entryId: item.entry.entryId,
                          action: 'approve',
                          resolution: 'use-submitted',
                        })
                      }
                    >
                      Use submitted
                    </Button>
                  )}
                  {item.entry.status === 'pending' && item.previewStatus !== 'manual-conflict' && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onDecision({
                          entryId: item.entry.entryId,
                          action: 'approve',
                          resolution: 'smart-merge',
                        })
                      }
                    >
                      Approve smart merge
                    </Button>
                  )}
                  {item.entry.status === 'pending' && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        onDecision({ entryId: item.entry.entryId, action: 'reject' })
                      }
                    >
                      Hold entry
                    </Button>
                  )}
                  {item.entry.status === 'held' && (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => onReconsider(item.entry.entryId)}
                    >
                      Reconsider held entry
                    </Button>
                  )}
                  {item.entry.status === 'imported' && <Badge>Imported</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatBatchStatus(status: RejoinRecoveryBatch['status']): string {
  return status.replace('-', ' ');
}

function formatPreviewStatus(status: RejoinRecoveryPreview['entries'][number]['previewStatus']): string {
  if (status === 'manual-conflict') return 'Manual conflict';
  if (status === 'no-change') return 'No canonical change';
  return 'Smart merge';
}
