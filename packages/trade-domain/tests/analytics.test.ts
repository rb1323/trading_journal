import { describe, expect, it } from "vitest";
import { buildTradeAnalytics } from "../src";

const trade = (openedAt: string, entryPrice: number, quantity: number, netPnl: number) => ({ openedAt, entryPrice, quantity, netPnl });

describe("trade analytics", () => {
  it("aggregates weekdays and entry hours in New York time", () => {
    const result = buildTradeAnalytics([
      trade("2026-01-05T14:30:00Z", 2, 100, 10),
      trade("2026-01-06T15:00:00Z", 3, 200, -5),
      trade("2026-07-15T13:30:00Z", 4, 300, 7),
      trade("2026-01-10T15:00:00Z", 5, 400, 99)
    ]);
    expect(result.byWeekday.map((bucket) => bucket.tradeCount)).toEqual([1, 1, 1, 0, 0, 1]);
    expect(result.byWeekday.map((bucket) => bucket.netPnl)).toEqual(["10", "-5", "7", "0", "0", "99"]);
    expect(result.byHour.find((bucket) => bucket.key === "hour-9")).toMatchObject({ tradeCount: 2, netPnl: "17" });
    expect(result.byHour.find((bucket) => bucket.key === "hour-10")).toMatchObject({ tradeCount: 2, netPnl: "94" });
  });

  it("keeps all price and quantity trades in tie-safe quantile buckets", () => {
    const result = buildTradeAnalytics([
      trade("2026-01-05T14:30:00Z", 1, 100, 1),
      trade("2026-01-05T14:31:00Z", 1, 100, 2),
      trade("2026-01-05T14:32:00Z", 2, 200, 3),
      trade("2026-01-05T14:33:00Z", 3, 300, 4),
      trade("2026-01-05T14:34:00Z", 4, 500, 5),
      trade("2026-01-05T14:35:00Z", 5, 1000, -6)
    ]);
    expect(result.byEntryPrice.length).toBeLessThanOrEqual(5);
    expect(result.byQuantity.length).toBeLessThanOrEqual(5);
    expect(result.byEntryPrice.reduce((sum, bucket) => sum + bucket.tradeCount, 0)).toBe(6);
    expect(result.byQuantity.reduce((sum, bucket) => sum + bucket.tradeCount, 0)).toBe(6);
    expect(result.byEntryPrice[0]?.label).toBe("$1");
    expect(result.byEntryPrice[0]?.tradeCount).toBe(2);
  });

  it("adds an Other hour bucket for timestamps outside the market range", () => {
    const result = buildTradeAnalytics([trade("2026-01-05T03:30:00Z", 2, 100, 4)]);
    expect(result.byHour.at(-1)).toMatchObject({ key: "hour-other", label: "Muut", tradeCount: 1 });
    expect(result.byWeekday.at(-1)).toMatchObject({ key: "weekday-other", label: "Muut", tradeCount: 1 });
  });

  it("returns empty numeric groups and zero weekday/hour groups for no trades", () => {
    const result = buildTradeAnalytics([]);
    expect(result.byEntryPrice).toEqual([]);
    expect(result.byQuantity).toEqual([]);
    expect(result.byWeekday.every((bucket) => bucket.tradeCount === 0)).toBe(true);
    expect(result.byHour).toHaveLength(17);
  });
});
