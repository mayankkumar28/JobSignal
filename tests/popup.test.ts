// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../src/shared/storage", () => ({}));

import {
  formatDate,
  renderStats,
  loadStats,
  handleRefresh,
} from "../src/popup/popup";
import type { ExtensionStats, SponsorCache } from "../src/shared/types";

const popupHtml = readFileSync(
  resolve(__dirname, "../src/popup/popup.html"),
  "utf-8",
);

const mockSendMessage = vi.fn();
vi.stubGlobal("chrome", {
  storage: { local: { get: vi.fn(), set: vi.fn() } },
  alarms: { create: vi.fn(), onAlarm: { addListener: vi.fn() } },
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onStartup: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    sendMessage: mockSendMessage,
  },
});

const mockStats: ExtensionStats = {
  companiesScanned: 142,
  sponsorsFound: 23,
  lastSyncTimestamp: new Date("2026-05-01").getTime(),
};

const mockCache: SponsorCache = {
  sponsors: Array.from({ length: 12797 }, (_, i) => ({
    originalName: `Company ${i}`,
    normalizedName: `company ${i}`,
    tokens: [`company`, `${i}`],
  })),
  fetchedAt: new Date("2026-05-15").getTime(),
  version: "1.0",
};

beforeEach(() => {
  document.documentElement.innerHTML = popupHtml;
  vi.clearAllMocks();
  mockSendMessage.mockResolvedValue(mockStats);
});

// ── formatDate ───────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it('returns "Never" for timestamp 0', () => {
    expect(formatDate(0)).toBe("Never");
  });

  it("returns a human-readable date string for a real timestamp", () => {
    const result = formatDate(new Date("2026-05-01").getTime());
    expect(result).toContain("2026");
    expect(result).toContain("May");
  });
});

// ── renderStats ──────────────────────────────────────────────────────────────

describe("renderStats", () => {
  it("populates companies-scanned", () => {
    renderStats(mockStats);
    expect(document.getElementById("companies-scanned")!.textContent).toBe("142");
  });

  it("populates sponsors-found", () => {
    renderStats(mockStats);
    expect(document.getElementById("sponsors-found")!.textContent).toBe("23");
  });

  it("populates last-synced with a formatted date", () => {
    renderStats(mockStats);
    const text = document.getElementById("last-synced")!.textContent!;
    expect(text).toContain("2026");
  });

  it('shows "Never" for zero lastSyncTimestamp', () => {
    renderStats({ ...mockStats, lastSyncTimestamp: 0 });
    expect(document.getElementById("last-synced")!.textContent).toBe("Never");
  });
});

// ── loadStats ────────────────────────────────────────────────────────────────

describe("loadStats", () => {
  it("requests GET_STATS from the background and renders the result", async () => {
    mockSendMessage.mockResolvedValue(mockStats);
    await loadStats();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: "GET_STATS" });
    expect(document.getElementById("companies-scanned")!.textContent).toBe("142");
    expect(document.getElementById("sponsors-found")!.textContent).toBe("23");
  });
});

// ── handleRefresh ─────────────────────────────────────────────────────────────

describe("handleRefresh — success", () => {
  it("sends REFRESH_SPONSORS and updates last-synced", async () => {
    mockSendMessage.mockResolvedValue(mockCache);
    await handleRefresh();
    expect(mockSendMessage).toHaveBeenCalledWith({ type: "REFRESH_SPONSORS" });
    const text = document.getElementById("last-synced")!.textContent!;
    expect(text).toContain("2026");
  });

  it("shows a status message with the sponsor count", async () => {
    mockSendMessage.mockResolvedValue(mockCache);
    await handleRefresh();
    const status = document.getElementById("refresh-status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("12,797");
  });

  it("re-enables the refresh button after completion", async () => {
    mockSendMessage.mockResolvedValue(mockCache);
    await handleRefresh();
    const btn = document.getElementById("refresh-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain("Refresh");
  });
});

describe("handleRefresh — failure", () => {
  it("shows an error status message when sendMessage rejects", async () => {
    mockSendMessage.mockRejectedValue(new Error("network error"));
    await handleRefresh();
    const status = document.getElementById("refresh-status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("failed");
  });

  it("re-enables the refresh button after failure", async () => {
    mockSendMessage.mockRejectedValue(new Error("network error"));
    await handleRefresh();
    const btn = document.getElementById("refresh-btn") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});
