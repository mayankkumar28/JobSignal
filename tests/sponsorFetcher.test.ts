import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSponsorsFromHTML, buildSponsorCache, fetchSponsorsFromIND } from "../src/shared/sponsorFetcher";

// ── parseSponsorsFromHTML ────────────────────────────────────────────────────

describe("parseSponsorsFromHTML", () => {
  it("extracts names from th[scope=row] cells", () => {
    const html = `
      <table>
        <tbody>
          <tr><th scope="row">Booking.com B.V.</th><td>12345678</td></tr>
          <tr><th scope="row">ASML Holding N.V.</th><td>87654321</td></tr>
        </tbody>
      </table>`;
    expect(parseSponsorsFromHTML(html)).toEqual(["Booking.com B.V.", "ASML Holding N.V."]);
  });

  it("decodes common HTML entities", () => {
    const html = `<th scope="row">Test &amp; Sons &quot;BV&quot;</th>`;
    expect(parseSponsorsFromHTML(html)).toEqual(['Test & Sons "BV"']);
  });

  it("trims whitespace and skips blank cells", () => {
    const html = `
      <th scope="row">   </th>
      <th scope="row">  Real Corp B.V.  </th>`;
    expect(parseSponsorsFromHTML(html)).toEqual(["Real Corp B.V."]);
  });

  it("returns empty array when no matching cells exist", () => {
    expect(parseSponsorsFromHTML("<html><body><p>No sponsors here</p></body></html>")).toEqual([]);
  });

  it("ignores th[scope=col] header cells", () => {
    const html = `
      <th scope="col">Organisation</th>
      <th scope="col">KvK number</th>
      <th scope="row">Acme B.V.</th>`;
    expect(parseSponsorsFromHTML(html)).toEqual(["Acme B.V."]);
  });
});

// ── buildSponsorCache ────────────────────────────────────────────────────────

describe("buildSponsorCache", () => {
  it("normalizes and tokenizes each name", () => {
    const cache = buildSponsorCache(["Booking.com B.V.", "ASML Holding N.V."]);
    expect(cache.sponsors).toHaveLength(2);

    const booking = cache.sponsors[0];
    expect(booking.originalName).toBe("Booking.com B.V.");
    expect(booking.normalizedName).toBe("booking com");
    expect(booking.tokens).toEqual(["booking", "com"]);

    const asml = cache.sponsors[1];
    expect(asml.originalName).toBe("ASML Holding N.V.");
    expect(asml.normalizedName).toBe("asml");
    expect(asml.tokens).toEqual(["asml"]);
  });

  it("sets fetchedAt to a recent timestamp", () => {
    const before = Date.now();
    const cache = buildSponsorCache(["Adyen N.V."]);
    const after = Date.now();
    expect(cache.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(cache.fetchedAt).toBeLessThanOrEqual(after);
  });

  it("sets version to 1.0", () => {
    expect(buildSponsorCache(["X B.V."]).version).toBe("1.0");
  });

  it("skips empty and whitespace-only names", () => {
    const cache = buildSponsorCache(["Valid Corp", "", "   "]);
    expect(cache.sponsors).toHaveLength(1);
  });

  it("skips names that normalize to empty string", () => {
    // purely punctuation/special chars collapse to ""
    const cache = buildSponsorCache(["---", "!!!", "Valid Co"]);
    expect(cache.sponsors).toHaveLength(1);
    expect(cache.sponsors[0].originalName).toBe("Valid Co");
  });

  it("handles large input without throwing", () => {
    const names = Array.from({ length: 13000 }, (_, i) => `Company ${i} B.V.`);
    const cache = buildSponsorCache(names);
    expect(cache.sponsors.length).toBe(13000);
  });
});

// ── fetchSponsorsFromIND ─────────────────────────────────────────────────────

describe("fetchSponsorsFromIND", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns parsed names on a successful fetch", async () => {
    const html = `
      <th scope="row">Booking.com B.V.</th>
      <th scope="row">ASML Holding N.V.</th>`;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(html) }),
    );
    const names = await fetchSponsorsFromIND();
    expect(names).toEqual(["Booking.com B.V.", "ASML Holding N.V."]);
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );
    await expect(fetchSponsorsFromIND()).rejects.toThrow("HTTP 503");
  });

  it("throws when HTML parses to zero names", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve("<html><body>No table</body></html>"),
      }),
    );
    await expect(fetchSponsorsFromIND()).rejects.toThrow("0 names");
  });

  it("throws when fetch rejects (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    await expect(fetchSponsorsFromIND()).rejects.toThrow("network error");
  });
});
