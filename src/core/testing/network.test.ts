import { describe, expect, it } from 'vitest';
import { createOfflineController } from './network';

describe('createOfflineController', () => {
  it('switches navigator.onLine between offline and online states deterministically', () => {
    const offlineController = createOfflineController();

    offlineController.goOffline();
    expect(window.navigator.onLine).toBe(false);

    offlineController.goOnline();
    expect(window.navigator.onLine).toBe(true);
  });
});
