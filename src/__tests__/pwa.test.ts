import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';

const registerSW = mock();

mock.module('virtual:pwa-register', () => ({
  registerSW,
}));

const originalSetInterval = globalThis.setInterval;
const setIntervalMock = mock(() => 1 as unknown as ReturnType<typeof setInterval>);
globalThis.setInterval = setIntervalMock as unknown as typeof setInterval;

const originalDateNow = Date.now;
const originalWindowAddEventListener = window.addEventListener;
const originalDocumentAddEventListener = document.addEventListener;
const originalLocation = globalThis.location;
const originalCaches = globalThis.caches;

const windowEventListeners = new Map<string, EventListener>();
const documentEventListeners = new Map<string, EventListener>();
const windowAddEventListenerMock = mock((type: string, listener: EventListenerOrEventListenerObject) => {
  if (typeof listener === 'function') {
    windowEventListeners.set(type, listener);
  }
});
const documentAddEventListenerMock = mock((type: string, listener: EventListenerOrEventListenerObject) => {
  if (typeof listener === 'function') {
    documentEventListeners.set(type, listener);
  }
});
const reloadMock = mock();
const deleteCacheMock = mock(() => Promise.resolve(true));

window.addEventListener = windowAddEventListenerMock as unknown as typeof window.addEventListener;
document.addEventListener = documentAddEventListenerMock as unknown as typeof document.addEventListener;
Object.defineProperty(globalThis, 'location', {
  value: { reload: reloadMock },
  configurable: true,
});
Object.defineProperty(globalThis, 'caches', {
  value: { delete: deleteCacheMock },
  configurable: true,
});

const { registerAppServiceWorker } = await import('@/pwa');

afterAll(() => {
  globalThis.setInterval = originalSetInterval;
  Date.now = originalDateNow;
  window.addEventListener = originalWindowAddEventListener;
  document.addEventListener = originalDocumentAddEventListener;
  Object.defineProperty(globalThis, 'location', {
    value: originalLocation,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'caches', {
    value: originalCaches,
    configurable: true,
  });
});

beforeEach(() => {
  registerSW.mockReset();
  setIntervalMock.mockReset();
  windowAddEventListenerMock.mockClear();
  documentAddEventListenerMock.mockClear();
  reloadMock.mockReset();
  deleteCacheMock.mockReset();
  deleteCacheMock.mockImplementation(() => Promise.resolve(true));
  windowEventListeners.clear();
  documentEventListeners.clear();
  Date.now = mock(() => 0) as typeof Date.now;
  Object.defineProperty(document, 'visibilityState', {
    value: 'visible',
    configurable: true,
  });
});

describe('registerAppServiceWorker', () => {
  it('forces a refresh when a new service worker is available', async () => {
    const updateSW = mock();
    registerSW.mockImplementation(() => updateSW);

    registerAppServiceWorker();
    const [{ onNeedRefresh }] = registerSW.mock.calls[0];
    onNeedRefresh();
    await Promise.resolve();

    expect(registerSW).toHaveBeenCalledWith(
      expect.objectContaining({
        immediate: true,
        onNeedRefresh: expect.any(Function),
      }),
    );
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('periodically checks for service worker updates after registration', async () => {
    const updateRegistration = mock(() => Promise.resolve());
    const updateSW = mock();
    registerSW.mockImplementation((options) => {
      options.onRegisteredSW?.('/sw.js', { update: updateRegistration });
      return updateSW;
    });

    registerAppServiceWorker();

    expect(setIntervalMock).toHaveBeenCalledTimes(2);
    for (const [callback, intervalMs] of setIntervalMock.mock.calls) {
      expect(intervalMs).toBe(60 * 60 * 1000);
      await callback();
    }
    expect(updateRegistration).toHaveBeenCalledTimes(1);
  });

  it('reloads the page when it becomes stale on focus', async () => {
    registerSW.mockImplementation(() => mock());

    registerAppServiceWorker();

    expect(windowAddEventListenerMock).toHaveBeenCalledWith('focus', expect.any(Function));
    const handleFocus = windowEventListeners.get('focus');
    expect(handleFocus).toBeDefined();

    Date.now = mock(() => 60 * 60 * 1000) as typeof Date.now;
    handleFocus?.(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();

    expect(deleteCacheMock).toHaveBeenCalledTimes(2);
    expect(deleteCacheMock).toHaveBeenCalledWith('open-meteo-cache');
    expect(deleteCacheMock).toHaveBeenCalledWith('nws-cache');
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('skips stale-page reload checks while the page is hidden', async () => {
    registerSW.mockImplementation(() => mock());

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });

    registerAppServiceWorker();

    expect(documentAddEventListenerMock).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    const handleVisibilityChange = documentEventListeners.get('visibilitychange');
    expect(handleVisibilityChange).toBeDefined();

    Date.now = mock(() => 2 * 60 * 60 * 1000) as typeof Date.now;
    handleVisibilityChange?.(new Event('visibilitychange'));
    await Promise.resolve();

    expect(deleteCacheMock).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});
