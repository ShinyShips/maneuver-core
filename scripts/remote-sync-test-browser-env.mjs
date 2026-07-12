export class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

export function installBrowserTestEnvironment(
  localStorage,
  { onLine = true, platform = 'RemoteSyncContract' } = {}
) {
  const windowLike = {
    localStorage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: true }),
  };

  Object.defineProperty(globalThis, 'window', { configurable: true, value: windowLike });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine, platform },
  });

  if (!('CustomEvent' in globalThis)) {
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: class CustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      },
    });
  }
}
