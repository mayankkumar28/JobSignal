import { vi } from 'vitest';

const store: Record<string, unknown> = {};

export const chromeMock = {
  storage: {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(keys.map((k) => [k, store[k] ?? undefined]))
        )
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      }),
      _clear: () => Object.keys(store).forEach((k) => delete store[k]),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      _listeners: [] as Array<(...args: unknown[]) => void>,
      _fire: (msg: unknown, sender: unknown, sendResponse: (...args: unknown[]) => void) => {
        chromeMock.runtime.onMessage._listeners.forEach((fn) =>
          fn(msg, sender, sendResponse)
        );
      },
    },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
};

chromeMock.runtime.onMessage.addListener = vi.fn((fn: (...args: unknown[]) => void) => {
  chromeMock.runtime.onMessage._listeners.push(fn);
});
