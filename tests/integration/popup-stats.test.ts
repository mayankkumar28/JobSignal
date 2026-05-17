// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import type { ExtensionStats } from "../../src/shared/types";

const popupHtml = readFileSync(
  resolve(__dirname, "../../src/popup/popup.html"),
  "utf-8",
);

let store: Record<string, unknown> = {};
let sendMessageResult: unknown = undefined;

const mockRuntime = {
  sendMessage: vi.fn(async () => sendMessageResult),
  onInstalled: { addListener: vi.fn() },
  onStartup: { addListener: vi.fn() },
  onMessage: { addListener: vi.fn() },
};

const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  }),
};

vi.stubGlobal("chrome", {
  storage: { local: mockStorage },
  runtime: mockRuntime,
  alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
});

// Import after stubbing chrome
const { renderStats, formatDate, loadStats } =
  await import("../../src/popup/popup.ts");

beforeEach(() => {
  store = {};
  sendMessageResult = undefined;
  vi.clearAllMocks();
  mockRuntime.sendMessage.mockImplementation(async () => sendMessageResult);
  mockStorage.get.mockImplementation(async (key: string) => ({ [key]: store[key] }));
  mockStorage.set.mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  });
  // Load popup DOM
  document.documentElement.innerHTML = popupHtml;
  // Re-parse <body> because setting documentElement.innerHTML doesn't fire DOMContentLoaded
  const bodyMatch = popupHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) document.body.innerHTML = bodyMatch[1];
});

describe("formatDate", () => {
  it("returns 'Never' for timestamp 0", () => {
    expect(formatDate(0)).toBe("Never");
  });

  it("returns a formatted date string for a non-zero timestamp", () => {
    const result = formatDate(new Date("2026-01-15").getTime());
    expect(result).toMatch(/2026/);
    expect(result).toMatch(/Jan|15/);
  });
});

describe("renderStats", () => {
  it("populates companies-scanned element", () => {
    renderStats({ companiesScanned: 42, sponsorsFound: 7, lastSyncTimestamp: 0 });
    expect(document.getElementById("companies-scanned")!.textContent).toBe("42");
  });

  it("populates sponsors-found element", () => {
    renderStats({ companiesScanned: 0, sponsorsFound: 13, lastSyncTimestamp: 0 });
    expect(document.getElementById("sponsors-found")!.textContent).toBe("13");
  });

  it("formats last-synced as 'Never' when timestamp is 0", () => {
    renderStats({ companiesScanned: 0, sponsorsFound: 0, lastSyncTimestamp: 0 });
    expect(document.getElementById("last-synced")!.textContent).toBe("Never");
  });

  it("formats last-synced with a real date when timestamp is non-zero", () => {
    const ts = new Date("2026-03-20").getTime();
    renderStats({ companiesScanned: 0, sponsorsFound: 0, lastSyncTimestamp: ts });
    expect(document.getElementById("last-synced")!.textContent).toMatch(/2026/);
  });
});

describe("loadStats → renderStats integration", () => {
  it("renders stats received from the service worker", async () => {
    const stats: ExtensionStats = { companiesScanned: 50, sponsorsFound: 12, lastSyncTimestamp: 0 };
    sendMessageResult = stats;
    await loadStats();
    expect(document.getElementById("companies-scanned")!.textContent).toBe("50");
    expect(document.getElementById("sponsors-found")!.textContent).toBe("12");
  });

  it("leaves placeholder '—' values when sendMessage throws", async () => {
    mockRuntime.sendMessage.mockRejectedValueOnce(new Error("SW not ready"));
    // Set placeholder values as the popup HTML would have them initially
    document.getElementById("companies-scanned")!.textContent = "—";
    document.getElementById("sponsors-found")!.textContent = "—";
    await loadStats();
    expect(document.getElementById("companies-scanned")!.textContent).toBe("—");
    expect(document.getElementById("sponsors-found")!.textContent).toBe("—");
  });
});

