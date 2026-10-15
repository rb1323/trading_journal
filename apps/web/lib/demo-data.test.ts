import { describe, expect, it } from "vitest";
import { DEMO_TRADES, demoAnalytics, demoDailyPerformance, demoSummary } from "./demo-data";

describe("demo dataset", () => {
  it("is deterministic and rich enough for the public demo", () => {
    expect(DEMO_TRADES).toHaveLength(36);
    expect(new Set(DEMO_TRADES.map((trade) => trade.symbol)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(DEMO_TRADES.map((trade) => trade.direction))).toEqual(new Set(["long", "short"]));
    expect(DEMO_TRADES.every((trade) => trade.fills.length === 4)).toBe(true);
    expect(DEMO_TRADES.some((trade) => trade.netPnl > 0)).toBe(true);
    expect(DEMO_TRADES.some((trade) => trade.netPnl < 0)).toBe(true);
    const firstSummary = demoSummary();
    const secondSummary = demoSummary();
    expect(firstSummary).toEqual(secondSummary);
  });

  it("produces performance and analytics data without external services", () => {
    const performance = demoDailyPerformance();
    const analytics = demoAnalytics();
    expect(performance.daily).toHaveLength(18);
    expect(performance.episodes.length).toBeGreaterThan(0);
    expect(performance.maxDrawdown).toMatch(/-/);
    expect(analytics.byWeekday.some((bucket) => bucket.tradeCount > 0)).toBe(true);
    expect(analytics.byHour.some((bucket) => bucket.tradeCount > 0)).toBe(true);
    expect(analytics.byEntryPrice).toHaveLength(5);
    expect(analytics.byQuantity).toHaveLength(5);
  });
});
