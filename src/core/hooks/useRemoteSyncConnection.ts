import { useCallback, useEffect, useState } from 'react';
import {
  clearRemoteSyncConnection,
  loadRemoteSyncConnection,
  saveRemoteSyncConnection,
  type RemoteSyncConnection,
} from '@/core/sync/remoteSyncConnection';

export function useRemoteSyncConnection() {
  const [connection, setConnection] = useState<RemoteSyncConnection | null>(() =>
    loadRemoteSyncConnection()
  );

  useEffect(() => {
    const handleConnectionChanged = () => {
      setConnection(loadRemoteSyncConnection());
    };

    window.addEventListener('remoteSyncConnectionChanged', handleConnectionChanged);
    window.addEventListener('storage', handleConnectionChanged);

    return () => {
      window.removeEventListener('remoteSyncConnectionChanged', handleConnectionChanged);
      window.removeEventListener('storage', handleConnectionChanged);
    };
  }, []);

  const saveConnection = useCallback((nextConnection: RemoteSyncConnection) => {
    saveRemoteSyncConnection(nextConnection);
    setConnection(nextConnection);
  }, []);

  const clearConnection = useCallback(() => {
    clearRemoteSyncConnection();
    setConnection(null);
  }, []);

  return {
    connection,
    saveConnection,
    clearConnection,
  };
}
