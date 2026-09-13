import { describe, expect, it } from "vitest";
import { createAnalyticsAxis } from "./trade-analytics";

const row = (tradeCount: number, netPnl: string) => ({
  key: "test",
  label: "Test",
  tradeCount,
  netPnl,
  averageNetPnl: netPnl,
  winningTrades: 0,
  losingTrades: 0
});

describe("trade analytics chart axes", () => {
  it("keeps distribution ticks as whole numbers", () => {
    const axis = createAnalyticsAxis("count", [row(1, "0")]);
    expect(axis).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  it("keeps performance axes symmetric around zero", () => {
    const axis = createAnalyticsAxis("pnl", [row(2, "12.5"), row(1, "-8.25")]);
    expect(axis.min).toBe(-axis.max);
    expect(axis.ticks).toContain(0);
  });
});
