import { describe, expect, it } from "vitest";
import { createChartScale, dateRangeSpansYears, formatAxisMoney, formatChartDate, selectDateTickIndexes } from "./performance-charts";

describe("dashboard chart scales", () => {
  it("includes zero and both sides of cumulative P&L", () => {
    const scale = createChartScale([-25, 10, 85], "cumulative");
    expect(scale.min).toBeLessThanOrEqual(-25);
    expect(scale.max).toBeGreaterThanOrEqual(85);
    expect(scale.ticks).toContain(0);
  });

  it("uses a symmetric daily P&L scale", () => {
    const scale = createChartScale([-23, 81], "daily");
    expect(scale.min).toBe(-scale.max);
    expect(scale.ticks).toContain(0);
  });

  it("anchors drawdown at zero", () => {
    const scale = createChartScale([0, -12.4, -38], "drawdown");
    expect(scale.max).toBe(0);
    expect(scale.min).toBeLessThanOrEqual(-38);
    expect(scale.ticks.at(-1)).toBe(0);
  });

  it("creates safe scales for flat zero data", () => {
    for (const kind of ["cumulative", "daily", "drawdown"] as const) {
      const scale = createChartScale([0, 0], kind);
      expect(scale.max).toBeGreaterThan(scale.min);
      expect(scale.ticks).toContain(0);
    }
  });

  it("creates a useful scale for one data point", () => {
    const scale = createChartScale([12.5], "cumulative");
    expect(scale.min).toBe(0);
    expect(scale.max).toBeGreaterThanOrEqual(12.5);
    expect(scale.ticks.length).toBeGreaterThanOrEqual(4);
  });
});

describe("dashboard chart labels", () => {
  it("selects evenly spaced dates including both ends", () => {
    expect(selectDateTickIndexes(10, 5)).toEqual([0, 2, 5, 7, 9]);
    expect(selectDateTickIndexes(1, 5)).toEqual([0]);
    expect(selectDateTickIndexes(0, 5)).toEqual([]);
  });

  it("shows the year only when requested", () => {
    expect(formatChartDate("2026-08-15")).toBe("15.08.");
    expect(formatChartDate("2026-08-15", true)).toBe("15.08.26");
    expect(dateRangeSpansYears(["2025-12-31", "2026-01-02"])).toBe(true);
    expect(dateRangeSpansYears(["2026-01-02", "2026-08-15"])).toBe(false);
  });

  it("formats small and large USD values compactly", () => {
    expect(formatAxisMoney(0)).toBe("$0");
    expect(formatAxisMoney(-2.5)).toBe("-$2.50");
    expect(formatAxisMoney(1_500)).toBe("$1.5k");
    expect(formatAxisMoney(1_200_000)).toBe("$1.2M");
    expect(formatAxisMoney(-0.0000000001)).toBe("$0");
  });
});
