/**
 * Global test setup — mocks for browser extension APIs.
 *
 * Provides in-memory implementations of:
 * - browser.storage.local / browser.storage.sync
 * - browser.tabs.query / browser.tabs.sendMessage
 * - browser.runtime.onMessage
 * - URL.createObjectURL / URL.revokeObjectURL
 */
import { vi, beforeEach } from 'vitest';

// ─── In-memory storage mock ───
function createStorageArea() {
    let store: Record<string, unknown> = {};

    return {
        get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
            if (keys === null || keys === undefined) return { ...store };
            if (typeof keys === 'string') return { [keys]: store[keys] };
            if (Array.isArray(keys)) {
                const result: Record<string, unknown> = {};
                for (const key of keys) result[key] = store[key];
                return result;
            }
            // object with defaults
            const result: Record<string, unknown> = {};
            for (const [key, defaultVal] of Object.entries(keys)) {
                result[key] = store[key] ?? defaultVal;
            }
            return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
            Object.assign(store, items);
        }),
        remove: vi.fn(async (keys: string | string[]) => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            for (const key of keyList) delete store[key];
        }),
        clear: vi.fn(async () => {
            store = {};
        }),
        getBytesInUse: vi.fn(async () => {
            return JSON.stringify(store).length;
        }),
        // Test helper: direct access to store contents
        _getStore: () => store,
        _setStore: (data: Record<string, unknown>) => {
            store = data;
        },
    };
}

// ─── Browser API mock ───
const mockBrowser = {
    storage: {
        local: createStorageArea(),
        sync: createStorageArea(),
    },
    tabs: {
        query: vi.fn(async () => [{ id: 1, url: 'https://www.linkedin.com/in/test' }]),
        sendMessage: vi.fn(async () => ({ success: true, data: '' })),
    },
    runtime: {
        onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
            hasListener: vi.fn(() => false),
        },
    },
};

// Expose as global `browser` (WXT convention)
(globalThis as any).browser = mockBrowser;

// ─── URL mock ───
if (typeof URL.createObjectURL !== 'function') {
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
}
if (typeof URL.revokeObjectURL !== 'function') {
    URL.revokeObjectURL = vi.fn();
}

// ─── Reset storage between tests ───
beforeEach(() => {
    mockBrowser.storage.local._setStore({});
    mockBrowser.storage.sync._setStore({});
    mockBrowser.storage.local.get.mockClear();
    mockBrowser.storage.local.set.mockClear();
    mockBrowser.storage.sync.get.mockClear();
    mockBrowser.storage.sync.set.mockClear();
    mockBrowser.tabs.query.mockClear();
    mockBrowser.tabs.sendMessage.mockClear();
});

export { mockBrowser };
