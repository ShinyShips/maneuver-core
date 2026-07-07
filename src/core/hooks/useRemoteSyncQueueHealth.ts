import { useEffect, useState } from 'react';
import { getRemoteSyncQueueHealth } from '@/core/sync/remoteSyncQueue';

export function useRemoteSyncQueueHealth() {
  const [queueHealth, setQueueHealth] = useState(() => getRemoteSyncQueueHealth());

  useEffect(() => {
    const handleQueueChanged = () => {
      setQueueHealth(getRemoteSyncQueueHealth());
    };

    window.addEventListener('remoteSyncQueueChanged', handleQueueChanged);
    window.addEventListener('remoteSyncConnectionChanged', handleQueueChanged);
    window.addEventListener('storage', handleQueueChanged);

    return () => {
      window.removeEventListener('remoteSyncQueueChanged', handleQueueChanged);
      window.removeEventListener('remoteSyncConnectionChanged', handleQueueChanged);
      window.removeEventListener('storage', handleQueueChanged);
    };
  }, []);

  return queueHealth;
}
