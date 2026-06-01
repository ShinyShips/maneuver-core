import { useEffect, useState } from 'react';
import { Button } from '@/core/components/ui/button';
import { Card, CardContent } from '@/core/components/ui/card';
import { toast } from 'sonner';

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleUpdateAvailable = (event: any) => {
        setWaitingWorker(event.detail.waiting);
        setShowPrompt(true);
      };

      const handleUpdateInstalled = () => {
        setShowPrompt(false);
        toast.success('App updated successfully!');
      };

      // Check for updates on page load
      navigator.serviceWorker.ready.then((registration) => {
        // Immediately check for a waiting worker
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowPrompt(true);
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
                setShowPrompt(true);
              }
            });
          }
        });
      });

      // Custom events for update notifications
      window.addEventListener('sw-update-available', handleUpdateAvailable);
      window.addEventListener('sw-update-installed', handleUpdateInstalled);

      return () => {
        window.removeEventListener('sw-update-available', handleUpdateAvailable);
        window.removeEventListener('sw-update-installed', handleUpdateInstalled);
      };
    }
    return undefined;
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowPrompt(false);
      window.location.reload(); // Force refresh immediately
    }
  };

  const handleClose = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg">
      <CardContent className="p-4">
        <div className="space-y-3">
          <p className="text-sm font-medium">
            A new version is available!
          </p>
          <p className="text-xs text-muted-foreground">
            Update now to get the latest features and improvements.
          </p>
          <p className="text-xs text-red-400">
            WARNING: This will refresh the app and apply the update.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdate}>
              Update Now
            </Button>
            <Button size="sm" variant="outline" onClick={handleClose}>
              Later
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
