import { describe, expect, it, vi } from 'vitest';
import { registerProductionServiceWorker } from './serviceWorker';

describe('registerProductionServiceWorker', () => {
  it('registers the service worker after the window load event in production', async () => {
    let onLoad: (() => void | Promise<void>) | undefined;
    const register = vi.fn().mockResolvedValue({} satisfies Partial<ServiceWorkerRegistration>);

    registerProductionServiceWorker({
      mode: 'production',
      path: '/sw.js',
      window: {
        addEventListener: vi.fn((event: string, callback: () => void | Promise<void>) => {
          if (event === 'load') {
            onLoad = callback;
          }
        }),
        dispatchEvent: vi.fn(),
      } as unknown as Window,
      navigator: {
        serviceWorker: {
          register,
        },
      } as unknown as Navigator,
      console: {
        error: vi.fn(),
      } as unknown as Console,
    });

    expect(onLoad).toBeTypeOf('function');

    await onLoad?.();

    expect(register).toHaveBeenCalledWith('/sw.js');
  });
});
