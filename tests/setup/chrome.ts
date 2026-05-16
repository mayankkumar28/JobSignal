import { vi } from "vitest";

// Minimal chrome global so modules that register listeners at import time don't crash.
// Individual test files override specific parts with their own vi.stubGlobal calls.
vi.stubGlobal("chrome", {
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
  },
});
