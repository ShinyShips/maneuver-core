export interface ServiceWorkerBootstrapEnvironment {
  mode: 'production' | 'development' | 'test';
  path?: string;
  window?: Pick<Window, 'addEventListener' | 'dispatchEvent'>;
  navigator?: Navigator;
  console?: Pick<Console, 'error'>;
}

export function registerProductionServiceWorker({
  mode,
  path = '/sw.js',
  window: currentWindow = window,
  navigator: currentNavigator = navigator,
  console: currentConsole = console,
}: ServiceWorkerBootstrapEnvironment): void {
  if (mode !== 'production' || !('serviceWorker' in currentNavigator)) {
    return;
  }

  currentWindow.addEventListener('load', () => {
    currentNavigator.serviceWorker.register(path).catch((error) => {
      currentConsole.error('SW registration failed:', error);
    });
  });
}
