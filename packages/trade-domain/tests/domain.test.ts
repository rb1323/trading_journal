import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { calculateDrawdowns, parseBrokerCsv, parseDasCsv, reconcileTradeCosts, reconstructTrades, SnapshotParseError } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(resolve(here, "../../../examples/Trades.csv"), "utf8");
const fixture2 = readFileSync(resolve(here, "../../../examples/Trades2.csv"), "utf8");
const transactions2 = readFileSync(resolve(here, "../../../examples/Transactions2.csv"), "utf8");

describe("DAS CSV parser", () => {
  it("parses the supplied fixture with invariant timestamps and decimals", () => {
    const result = parseDasCsv(fixture, { sourceId: "fixture" });
    expect(result.issues).toEqual([]);
    expect(result.fills).toHaveLength(59);
    expect(new Set(result.fills.map((fill) => fill.orderId)).size).toBe(11);
    expect(new Set(result.fills.map((fill) => fill.symbol))).toEqual(new Set(["ASTC", "BRTX", "SNGX"]));
    expect(result.fills.find((fill) => fill.tradeId === "133356")?.executedAt).toBe("2026-05-27T08:12:14Z");
  });

  it("accepts BOM and case-insensitive headers", () => {
    const csv = "\uFEFFtradeid,ACCOUNT,B/s,SYMB,QTY,PRICE,TIME\r\n1,A,B,TEST,1,1.25,01/15/26 09:30:00\r\n";
    const result = parseDasCsv(csv, { sourceId: "fixture" });
    expect(result.fills).toHaveLength(1);
  });

  it("reports invalid rows without accepting them", () => {
    const csv = "TradeID,Account,B/S,symb,qty,price,time\n1,A,X,TEST,0,nope,bad\n2,A,B,TEST,1,1.25,01/15/26 09:30:00\n";
    const result = parseDasCsv(csv, { sourceId: "fixture" });
    expect(result.fills).toHaveLength(1);
    expect(result.issues).toHaveLength(1);
  });

  it("rejects a malformed snapshot", () => {
    expect(() => parseDasCsv('TradeID,Account,B/S,symb,qty,price,time\n"1,A,B', { sourceId: "fixture" })).toThrow(SnapshotParseError);
  });

  it("rejects an incomplete final row", () => {
    const csv = "TradeID,Account,B/S,symb,qty,price,time\n1,A,B,TEST,100,10,";
    expect(() => parseDasCsv(csv, { sourceId: "fixture" })).toThrow(/viimeinen rivi/);
  });

  it("rejects a missing required column", () => {
    const csv = "TradeID,Account,B/S,symb,qty,time\n1,A,B,TEST,100,01/15/26 09:30:00\n";
    expect(() => parseDasCsv(csv, { sourceId: "fixture" })).toThrow(/price/);
  });

  it("converts New York summer and winter times to UTC", () => {
    const csv = [
      "TradeID,Account,B/S,symb,qty,price,time",
      "1,A,B,WINTER,1,10,01/15/26 09:30:00",
      "2,A,B,SUMMER,1,10,07/15/26 09:30:00"
    ].join("\n");
    const result = parseDasCsv(csv, { sourceId: "fixture" });
    expect(result.fills.map((fill) => fill.executedAt)).toEqual([
      "2026-01-15T14:30:00Z",
      "2026-07-15T13:30:00Z"
    ]);
  });
});

describe("trade reconstruction", () => {
  it("creates the expected five round trips and exact gross P&L", () => {
    const parsed = parseDasCsv(fixture, { sourceId: "fixture" });
    const result = reconstructTrades(parsed.fills);
    expect(result.trades).toHaveLength(5);
    expect(result.trades.filter((trade) => trade.status === "closed")).toHaveLength(5);
    expect(result.trades.filter((trade) => trade.symbol === "ASTC")).toHaveLength(2);
    expect(result.trades.filter((trade) => trade.symbol === "BRTX")).toHaveLength(1);
    expect(result.trades.filter((trade) => trade.symbol === "SNGX")).toHaveLength(2);
    const total = result.trades.reduce((sum, trade) => sum.plus(trade.grossPnl), new Decimal(0));
    expect(total.toFixed(4)).toBe("-2.6318");
  });

  it("splits a direction-changing fill between two trades", () => {
    const csv = [
      "TradeID,Account,B/S,symb,qty,price,time",
      "1,A,B,TEST,100,10,01/15/26 09:30:00",
      "2,A,S,TEST,150,11,01/15/26 09:31:00"
    ].join("\n");
    const result = reconstructTrades(parseDasCsv(csv, { sourceId: "fixture" }).fills);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ status: "closed", direction: "long", grossPnl: "100" });
    expect(result.trades[1]).toMatchObject({ status: "open", direction: "short", openQuantity: 50 });
  });

  it("keeps partial exits open", () => {
    const csv = [
      "TradeID,Account,B/S,symb,qty,price,time",
      "1,A,S,TEST,100,10,01/15/26 09:30:00",
      "2,A,B,TEST,40,9,01/15/26 09:31:00"
    ].join("\n");
    const [trade] = reconstructTrades(parseDasCsv(csv, { sourceId: "fixture" }).fills).trades;
    expect(trade).toMatchObject({ status: "open", direction: "short", openQuantity: 60, grossPnl: "40" });
  });

  it("orders out-of-order rows by timestamp", () => {
    const csv = [
      "TradeID,Account,B/S,symb,qty,price,time",
      "2,A,S,TEST,100,11,01/15/26 09:31:00",
      "1,A,B,TEST,100,10,01/15/26 09:30:00"
    ].join("\n");
    const [trade] = reconstructTrades(parseDasCsv(csv, { sourceId: "fixture" }).fills).trades;
    expect(trade).toMatchObject({ status: "closed", direction: "long", grossPnl: "100" });
  });

  it("uses numeric TradeID order for fills in the same second", () => {
    const csv = [
      "TradeID,Account,B/S,symb,qty,price,time",
      "10,A,S,TEST,100,11,01/15/26 09:30:00",
      "2,A,B,TEST,100,10,01/15/26 09:30:00"
    ].join("\n");
    const [trade] = reconstructTrades(parseDasCsv(csv, { sourceId: "fixture" }).fills).trades;
    expect(trade).toMatchObject({ status: "closed", direction: "long", grossPnl: "100" });
  });
});

describe("phase 2 broker reconciliation", () => {
  it("reconstructs the supplied second DAS export", () => {
    const parsed = parseDasCsv(fixture2, { sourceId: "fixture-2" });
    const result = reconstructTrades(parsed.fills);
    expect(parsed.fills).toHaveLength(47);
    expect(result.trades).toHaveLength(15);
    expect(result.trades.reduce((sum, trade) => sum.plus(trade.grossPnl), new Decimal(0)).toFixed(4)).toBe("-111.1466");
  });

  it("parses and reconciles the supplied broker export", () => {
    const broker = parseBrokerCsv(transactions2);
    expect(broker.issues).toEqual([]);
    expect(broker.transactions).toHaveLength(17);
    expect(broker.transactions.filter((row) => row.entryType === "TRD")).toHaveLength(12);
    expect(broker.transactions.filter((row) => row.entryType === "JNLC")).toHaveLength(5);
    expect(broker.transactions.reduce((sum, row) => sum.plus(row.totalFees), new Decimal(0)).toFixed(2)).toBe("27.69");

    const parsed = parseDasCsv(fixture2, { sourceId: "fixture-2" });
    const rebuilt = reconstructTrades(parsed.fills);
    const fills = new Map(parsed.fills.map((fill) => [fill.stableKey, fill]));
    const trades = new Map(rebuilt.trades.map((trade) => [trade.tradeKey, trade]));
    const legs = rebuilt.allocations.map((allocation) => {
      const fill = fills.get(allocation.fillStableKey)!;
      const trade = trades.get(allocation.tradeKey)!;
      return {
        tradeId: trade.tradeKey,
        sourceAccount: trade.account,
        symbol: trade.symbol,
        tradeDate: fill.executionDate,
        direction: trade.direction,
        side: fill.side,
        quantity: allocation.quantity,
        notional: new Decimal(allocation.price).mul(allocation.quantity).toString()
      };
    });
    const result = reconcileTradeCosts(legs, broker.transactions.map((row) => ({ ...row, sourceAccount: row.accountNumber })));
    expect(result.groups).toHaveLength(10);
    expect(result.groups.every((group) => group.status === "reconciled")).toBe(true);
    expect(result.unallocatedFees).toBe("0");
    expect(result.allocations.reduce((sum, allocation) => sum.plus(allocation.amount), new Decimal(0)).toFixed(2)).toBe("27.69");
  });
});

describe("phase 3 drawdown analytics", () => {
  it("measures recovered and open drawdown episodes in trading days", () => {
    const result = calculateDrawdowns([
      { date: "2026-08-03", net: 100 },
      { date: "2026-08-04", net: -40 },
      { date: "2026-08-05", net: -30 },
      { date: "2026-08-06", net: 70 },
      { date: "2026-08-07", net: 50 },
      { date: "2026-08-10", net: -20 }
    ]);
    expect(result.episodes).toEqual([
      { startDate: "2026-08-04", troughDate: "2026-08-05", recoveryDate: "2026-08-06", depth: "-70", lengthTradingDays: 3 },
      { startDate: "2026-08-10", troughDate: "2026-08-10", recoveryDate: null, depth: "-20", lengthTradingDays: 1 }
    ]);
    expect(result.averageDrawdown).toBe("-45");
    expect(result.maxDrawdown).toBe("-70");
    expect(result.currentDrawdown).toBe("-20");
    expect(result.averageLengthTradingDays).toBe(2);
    expect(result.longestLengthTradingDays).toBe(3);
    expect(result.currentLengthTradingDays).toBe(1);
  });

  it("aggregates duplicate dates and returns zeros without a drawdown", () => {
    const result = calculateDrawdowns([
      { date: "2026-08-03", net: 25 },
      { date: "2026-08-03", net: 25 },
      { date: "2026-08-04", net: 10 }
    ]);
    expect(result.daily.map((day) => day.cumulative)).toEqual([50, 60]);
    expect(result.episodes).toEqual([]);
    expect(result.maxDrawdown).toBe("0");
    expect(result.averageLengthTradingDays).toBe(0);
  });

  it("starts an episode when the first result is negative", () => {
    const result = calculateDrawdowns([{ date: "2026-08-03", net: "-12.50" }]);
    expect(result.maxDrawdown).toBe("-12.5");
    expect(result.currentLengthTradingDays).toBe(1);
  });
});
