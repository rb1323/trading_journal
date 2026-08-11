import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAlpacaBars, marketSessionBounds } from "./market-data";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ALPACA_API_KEY_ID;
  delete process.env.ALPACA_API_SECRET_KEY;
});

describe("Alpaca market data", () => {
  it("converts the extended session through New York daylight saving time", () => {
    const summer = marketSessionBounds("2026-08-10");
    expect(summer.start.toUTC().toISO()).toBe("2026-08-10T08:00:00.000Z");
    expect(summer.end.toUTC().toISO()).toBe("2026-08-11T00:00:00.000Z");
    const winter = marketSessionBounds("2026-01-15");
    expect(winter.start.toUTC().toISO()).toBe("2026-01-15T09:00:00.000Z");
    expect(winter.end.toUTC().toISO()).toBe("2026-01-16T01:00:00.000Z");
  });

  it("requests raw one-minute SIP bars for the historical ticker date", async () => {
    process.env.ALPACA_API_KEY_ID = "test-key";
    process.env.ALPACA_API_SECRET_KEY = "test-secret";
    const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(JSON.stringify({ bars: [{ t: "2026-08-10T13:30:00Z", o: 1, h: 1.2, l: 0.9, c: 1.1, v: 1000, n: 10, vw: 1.05 }], next_page_token: null }), { status: 200 });
    });
    vi.stubGlobal("fetch", request);
    const bars = await fetchAlpacaBars("AUUD", "2026-08-10");
    expect(bars).toHaveLength(1);
    const call = request.mock.calls[0];
    expect(call).toBeDefined();
    const url = new URL(String(call![0]));
    expect(url.searchParams.get("feed")).toBe("sip");
    expect(url.searchParams.get("timeframe")).toBe("1Min");
    expect(url.searchParams.get("adjustment")).toBe("raw");
    expect(url.searchParams.get("asof")).toBe("2026-08-10");
    expect(call![1]?.headers).toMatchObject({ "APCA-API-KEY-ID": "test-key", "APCA-API-SECRET-KEY": "test-secret" });
  });
});
