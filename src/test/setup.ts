import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetTestHarnessState } from '@/core/testing/fixtures';
import { resetOnlineState } from '@/core/testing/network';

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(window, 'alert', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(navigator, 'vibrate', {
  configurable: true,
  writable: true,
  value: vi.fn(() => true),
});

Object.defineProperty(navigator, 'serviceWorker', {
  configurable: true,
  writable: true,
  value: {
    register: vi.fn().mockResolvedValue({
      addEventListener: vi.fn(),
      waiting: null,
      installing: null,
    }),
    ready: Promise.resolve({
      addEventListener: vi.fn(),
      waiting: null,
      installing: null,
    }),
    controller: null,
  },
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds = [];
}

Object.defineProperty(window, 'ResizeObserver', {
  configurable: true,
  writable: true,
  value: ResizeObserverMock,
});

Object.defineProperty(window, 'IntersectionObserver', {
  configurable: true,
  writable: true,
  value: IntersectionObserverMock,
});

afterEach(async () => {
  cleanup();
  await resetTestHarnessState();
  resetOnlineState();
  vi.restoreAllMocks();
});
