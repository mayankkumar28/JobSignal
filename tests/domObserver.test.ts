// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startObserver } from "../src/content/domObserver";
import { DEBOUNCE_MS } from "../src/shared/constants";

// Flush the microtask queue so MutationObserver callbacks fire before we advance timers.
// MutationObserver in jsdom dispatches via queueMicrotask; awaiting Promise.resolve()
// drains that queue before we advance the fake setTimeout-based debounce timer.
const flushMicrotasks = () => Promise.resolve();

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "<main></main>";
});

afterEach(() => {
  vi.useRealTimers();
});

function appendJobCard(parent: Element): Element {
  // base-search-card matches the JOB_HINT_SEL filter in domObserver.
  const card = document.createElement("div");
  card.className = "base-search-card";
  parent.appendChild(card);
  return card;
}

describe("startObserver", () => {
  it("returns a MutationObserver", () => {
    const obs = startObserver(vi.fn());
    expect(obs).toBeInstanceOf(MutationObserver);
    obs.disconnect();
  });

  it("fires callback after debounce delay on a job-like DOM mutation", async () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    const main = document.querySelector("main")!;
    appendJobCard(main);

    // Let jsdom fire the MutationObserver microtask, then advance past debounce
    await flushMicrotasks();
    expect(callback).not.toHaveBeenCalled(); // debounce hasn't expired yet

    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(callback).toHaveBeenCalledOnce();

    obs.disconnect();
  });

  it("ignores mutations that do not introduce job-like elements", async () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    const main = document.querySelector("main")!;
    // Generic <div> — not in the job hint selector list.
    main.appendChild(document.createElement("div"));

    await flushMicrotasks();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(callback).not.toHaveBeenCalled();

    obs.disconnect();
  });

  it("coalesces rapid job-card additions into one callback call", async () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    const main = document.querySelector("main")!;
    for (let i = 0; i < 10; i++) {
      appendJobCard(main);
    }

    await flushMicrotasks();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(callback).toHaveBeenCalledOnce();
    obs.disconnect();
  });

  it("fires callback again after a second burst following the quiet period", async () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    const main = document.querySelector("main")!;

    // First burst
    appendJobCard(main);
    await flushMicrotasks();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(callback).toHaveBeenCalledTimes(1);

    // Second burst
    appendJobCard(main);
    await flushMicrotasks();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);
    expect(callback).toHaveBeenCalledTimes(2);

    obs.disconnect();
  });

  it("triggers callback on popstate event", () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    window.dispatchEvent(new Event("popstate"));
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(callback).toHaveBeenCalledOnce();
    obs.disconnect();
  });

  it("triggers callback on hashchange event", () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    window.dispatchEvent(new Event("hashchange"));
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(callback).toHaveBeenCalledOnce();
    obs.disconnect();
  });

  it("debounces popstate and hashchange together into one call", () => {
    const callback = vi.fn();
    const obs = startObserver(callback);

    window.dispatchEvent(new Event("popstate"));
    window.dispatchEvent(new Event("hashchange"));
    window.dispatchEvent(new Event("popstate"));
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(callback).toHaveBeenCalledOnce();
    obs.disconnect();
  });

  it("stops firing after the observer is disconnected", async () => {
    const callback = vi.fn();
    const obs = startObserver(callback);
    obs.disconnect();

    const main = document.querySelector("main")!;
    main.appendChild(document.createElement("div"));
    await flushMicrotasks();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(callback).not.toHaveBeenCalled();
  });

  it("observes document.body when no <main> element is present", async () => {
    document.body.innerHTML = ""; // remove <main>
    const callback = vi.fn();
    const obs = startObserver(callback);

    // Mutate body directly with a job-like card
    appendJobCard(document.body);
    await flushMicrotasks();
    vi.advanceTimersByTime(DEBOUNCE_MS + 10);

    expect(callback).toHaveBeenCalledOnce();
    obs.disconnect();
  });
});
