import { RotateCcw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/core/components/ui/alert';
import { Button } from '@/core/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/core/components/ui/card';
import type { PreparedPostRejoinRecoveryBatch } from '@/core/sync';

export interface PostRejoinRecoveryPanelProps {
  prepared: PreparedPostRejoinRecoveryBatch;
  busy: boolean;
  onSubmit: () => void;
}

export function PostRejoinRecoveryPanel({
  prepared,
  busy,
  onSubmit,
}: PostRejoinRecoveryPanelProps) {
  return (
    <Card className="rounded-md border-amber-500/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <RotateCcw className="size-5 text-amber-500" />
          Recover work after rejoin
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <AlertTitle>{prepared.documents.length} recoverable local entries</AlertTitle>
          <AlertDescription>
            This work was kept locally after the former device was revoked. It will be submitted as
            a separate batch for privileged review and will not enter normal Remote sync
            automatically.
          </AlertDescription>
        </Alert>
        <Button type="button" disabled={busy || prepared.documents.length === 0} onClick={onSubmit}>
          Submit for privileged review
        </Button>
      </CardContent>
    </Card>
  );
}
