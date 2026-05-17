export interface OfflineController {
  goOnline: () => void;
  goOffline: () => void;
  isOnline: () => boolean;
  setOnline: (online: boolean) => void;
}

function updateOnlineState(online: boolean, currentWindow: Window): void {
  Object.defineProperty(currentWindow.navigator, 'onLine', {
    configurable: true,
    value: online,
  });

  currentWindow.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

export function createOfflineController(currentWindow: Window = window): OfflineController {
  return {
    goOnline: () => updateOnlineState(true, currentWindow),
    goOffline: () => updateOnlineState(false, currentWindow),
    isOnline: () => currentWindow.navigator.onLine,
    setOnline: (online: boolean) => updateOnlineState(online, currentWindow),
  };
}

export function resetOnlineState(currentWindow: Window = window): void {
  updateOnlineState(true, currentWindow);
}
