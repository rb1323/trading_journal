import { buildTradeAnalytics, calculateDrawdowns, type TradeAnalytics } from "@trading-journal/trade-domain";
import { DateTime } from "luxon";

export interface DemoFill {
  id: string;
  executedAt: string;
  side: "B" | "S";
  quantity: number;
  price: number;
  role: "entry" | "exit";
  sourceTradeId: string;
  sourceOrderId: string;
}

export interface DemoTrade {
  id: string;
  symbol: string;
  direction: "long" | "short";
  openedAt: string;
  closedAt: string;
  quantity: number;
  entryVwap: number;
  exitVwap: number;
  grossPnl: number;
  fees: number;
  netPnl: number;
  fills: DemoFill[];
  notes: string;
  tags: string[];
  rating: number | null;
  reviewStatus: "reviewed" | "draft" | "unreviewed";
}

export interface DemoBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DemoTradeChartData {
  bars: DemoBar[];
  fills: DemoFill[];
  defaultRange: { from: string; to: string };
}

const DEMO_SYMBOLS = ["NOVA", "ORBIT", "PULSE", "LUMEN", "ATLAS", "KITE"];
const DAILY_NET = [
  138, -82, 94, 172, -214, -96, 62, 188, 124, -44, -28, 156, 232, -178, -118, 76, 214, -64
];
const ENTRY_HOURS = [9, 10, 11, 13, 14, 15, 9, 12, 10, 14, 11, 15, 9, 13, 10, 14, 11, 15];
const TAGS = ["opening range", "momentum", "breakout", "late entry", "followed plan", "overtrading"];

function isoAt(day: DateTime, hour: number, minute: number): string {
  return day.set({ hour, minute, second: 0, millisecond: 0 }).toUTC().toISO()!;
}

function makeFill(
  tradeIndex: number,
  leg: "entry" | "exit",
  sequence: number,
  at: string,
  side: "B" | "S",
  quantity: number,
  price: number
): DemoFill {
  const id = `demo-fill-${tradeIndex + 1}-${leg}-${sequence}`;
  return {
    id,
    executedAt: at,
    side,
    quantity,
    price: Number(price.toFixed(4)),
    role: leg,
    sourceTradeId: `DEMO-T${String(tradeIndex + 1).padStart(3, "0")}`,
    sourceOrderId: `DEMO-O${String(tradeIndex + 1).padStart(3, "0")}-${leg === "entry" ? "E" : "X"}`
  };
}

function makeTrade(index: number, day: DateTime, dailyNet: number): DemoTrade {
  const symbol = DEMO_SYMBOLS[index % DEMO_SYMBOLS.length]!;
  const direction: DemoTrade["direction"] = index % 5 === 0 || index % 7 === 0 ? "short" : "long";
  const hour = ENTRY_HOURS[index % ENTRY_HOURS.length]!;
  const minute = 6 + (index * 7) % 45;
  const openedAt = isoAt(day, hour, minute);
  const durationMinutes = 8 + (index * 11) % 48;
  const closedAt = DateTime.fromISO(openedAt, { zone: "utc" }).plus({ minutes: durationMinutes }).toISO()!;
  const quantity = 300 + (index % 6) * 150;
  const entry = 5.25 + (index % 9) * 1.35 + (index % 3) * 0.17;
  const fee = Number((1.68 + (quantity / 1000) * 0.11).toFixed(2));
  const gross = dailyNet / 2 + (index % 2 === 0 ? 4 : -4);
  const net = gross - fee;
  const delta = gross / quantity;
  const exit = direction === "long" ? entry + delta : entry - delta;
  const firstQuantity = Math.ceil(quantity * 0.56);
  const secondQuantity = quantity - firstQuantity;
  const entryPriceOne = entry - (direction === "long" ? 0.018 : -0.018);
  const entryPriceTwo = entry + (direction === "long" ? 0.022 : -0.022);
  const exitTime = DateTime.fromISO(closedAt, { zone: "utc" });
  const entryTime = DateTime.fromISO(openedAt, { zone: "utc" });
  const entrySide = direction === "long" ? "B" : "S";
  const exitSide = direction === "long" ? "S" : "B";
  const fills = [
    makeFill(index, "entry", 1, openedAt, entrySide, firstQuantity, entryPriceOne),
    makeFill(index, "entry", 2, entryTime.plus({ minutes: 1 }).toISO()!, entrySide, secondQuantity, entryPriceTwo),
    makeFill(index, "exit", 1, exitTime.minus({ minutes: 1 }).toISO()!, exitSide, Math.ceil(quantity * 0.45), exit - (direction === "long" ? 0.012 : -0.012)),
    makeFill(index, "exit", 2, closedAt, exitSide, quantity - Math.ceil(quantity * 0.45), exit + (direction === "long" ? 0.015 : -0.015))
  ];
  const reviewed = index % 4 !== 0;
  return {
    id: `demo-trade-${index + 1}`,
    symbol,
    direction,
    openedAt,
    closedAt,
    quantity,
    entryVwap: Number(entry.toFixed(4)),
    exitVwap: Number(exit.toFixed(4)),
    grossPnl: Number(gross.toFixed(2)),
    fees: fee,
    netPnl: Number(net.toFixed(2)),
    fills,
    notes: reviewed
      ? index % 3 === 0 ? "Hyvä suunnitelman mukainen entry ja selkeä exit. Säilytä kärsivällisyys ensimmäisen impulssin jälkeen." : "Entry oli perusteltu, mutta position kokoa voisi pienentää epävarmassa markkinassa."
      : "",
    tags: reviewed ? [TAGS[index % TAGS.length]!, index % 3 === 0 ? "followed plan" : "late entry"] : [],
    rating: reviewed ? (index % 5) + 1 : null,
    reviewStatus: reviewed ? (index % 6 === 0 ? "draft" : "reviewed") : "unreviewed"
  };
}

function buildTrades(): DemoTrade[] {
  const firstDay = DateTime.fromISO("2026-09-01", { zone: "America/New_York" });
  const trades: DemoTrade[] = [];
  let tradingDay = firstDay;
  let dayIndex = 0;
  while (dayIndex < DAILY_NET.length) {
    if (tradingDay.weekday <= 5) {
      const dayNet = DAILY_NET[dayIndex]!;
      trades.push(makeTrade(dayIndex * 2, tradingDay, dayNet * 0.58));
      trades.push(makeTrade(dayIndex * 2 + 1, tradingDay, dayNet * 0.42));
      dayIndex += 1;
    }
    tradingDay = tradingDay.plus({ days: 1 });
  }
  return trades;
}

export const DEMO_TRADES: DemoTrade[] = buildTrades();

export function demoTradeById(id: string): DemoTrade | undefined {
  return DEMO_TRADES.find((trade) => trade.id === id);
}

export function demoDailyPerformance() {
  const byDate = new Map<string, number>();
  for (const trade of DEMO_TRADES) {
    const date = DateTime.fromISO(trade.openedAt, { zone: "utc" }).setZone("America/New_York").toISODate()!;
    byDate.set(date, (byDate.get(date) ?? 0) + trade.netPnl);
  }
  return calculateDrawdowns([...byDate.entries()].map(([date, net]) => ({ date, net: Number(net.toFixed(2)) })));
}

export function demoAnalytics(): TradeAnalytics {
  return buildTradeAnalytics(DEMO_TRADES.map((trade) => ({
    openedAt: trade.openedAt,
    entryPrice: trade.entryVwap,
    quantity: trade.quantity,
    netPnl: trade.netPnl
  })));
}

export function demoSummary() {
  const net = DEMO_TRADES.reduce((sum, trade) => sum + trade.netPnl, 0);
  const gross = DEMO_TRADES.reduce((sum, trade) => sum + trade.grossPnl, 0);
  const fees = DEMO_TRADES.reduce((sum, trade) => sum + trade.fees, 0);
  const winners = DEMO_TRADES.filter((trade) => trade.netPnl > 0);
  const losers = DEMO_TRADES.filter((trade) => trade.netPnl < 0);
  return {
    trades: DEMO_TRADES.length,
    net: Number(net.toFixed(2)),
    gross: Number(gross.toFixed(2)),
    fees: Number(fees.toFixed(2)),
    winRate: DEMO_TRADES.length ? winners.length / DEMO_TRADES.length : 0,
    average: DEMO_TRADES.length ? net / DEMO_TRADES.length : 0,
    averageWinner: winners.length ? winners.reduce((sum, trade) => sum + trade.netPnl, 0) / winners.length : 0,
    averageLoser: losers.length ? losers.reduce((sum, trade) => sum + trade.netPnl, 0) / losers.length : 0,
    profitFactor: losers.length ? winners.reduce((sum, trade) => sum + trade.netPnl, 0) / Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0)) : 0
  };
}

export function demoChartData(trade: DemoTrade): DemoTradeChartData {
  const start = DateTime.fromISO(trade.openedAt, { zone: "utc" }).minus({ minutes: 30 });
  const bars: DemoBar[] = [];
  let price = trade.entryVwap - (trade.direction === "long" ? 0.12 : -0.12);
  for (let index = 0; index < 180; index += 1) {
    const at = start.plus({ minutes: index });
    const wave = Math.sin(index / 7 + trade.id.length) * 0.028 + Math.cos(index / 13) * 0.014;
    const drift = (trade.exitVwap - trade.entryVwap) / 180;
    const open = price;
    const close = price + drift + wave;
    const high = Math.max(open, close) + 0.025 + (index % 4) * 0.004;
    const low = Math.min(open, close) - 0.021 - (index % 3) * 0.004;
    bars.push({ time: at.toUTC().toISO()!, open: Number(open.toFixed(4)), high: Number(high.toFixed(4)), low: Number(low.toFixed(4)), close: Number(close.toFixed(4)), volume: 12_000 + (index % 17) * 1_500 + Math.round(Math.abs(wave) * 100_000) });
    price = close;
  }
  const from = DateTime.fromISO(trade.openedAt, { zone: "utc" }).minus({ minutes: 30 }).toISO()!;
  const to = DateTime.fromISO(trade.closedAt, { zone: "utc" }).plus({ minutes: 30 }).toISO()!;
  return { bars, fills: trade.fills, defaultRange: { from, to } };
}
