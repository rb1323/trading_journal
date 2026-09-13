import Decimal from "decimal.js";
import { DateTime } from "luxon";

export interface TradeAnalyticsInput {
  openedAt: string;
  entryPrice: string | number;
  quantity: number;
  netPnl: string | number;
}

export interface AnalyticsBucket {
  key: string;
  label: string;
  tradeCount: number;
  netPnl: string;
  averageNetPnl: string;
  winningTrades: number;
  losingTrades: number;
}

export interface TradeAnalytics {
  byWeekday: AnalyticsBucket[];
  byHour: AnalyticsBucket[];
  byEntryPrice: AnalyticsBucket[];
  byQuantity: AnalyticsBucket[];
}

interface PreparedTrade extends TradeAnalyticsInput {
  price: Decimal;
  quantityValue: Decimal;
  net: Decimal;
  localDate: DateTime;
}

interface MutableBucket {
  key: string;
  label: string;
  tradeCount: number;
  netPnl: Decimal;
  winningTrades: number;
  losingTrades: number;
}

const WEEKDAYS = [
  { key: "mon", label: "Maanantai", weekday: 1 },
  { key: "tue", label: "Tiistai", weekday: 2 },
  { key: "wed", label: "Keskiviikko", weekday: 3 },
  { key: "thu", label: "Torstai", weekday: 4 },
  { key: "fri", label: "Perjantai", weekday: 5 }
] as const;

const MARKET_HOUR_START = 4;
const MARKET_HOUR_END = 20;

function emptyBucket(key: string, label: string): MutableBucket {
  return { key, label, tradeCount: 0, netPnl: new Decimal(0), winningTrades: 0, losingTrades: 0 };
}

function addTrade(bucket: MutableBucket, trade: PreparedTrade): void {
  bucket.tradeCount += 1;
  bucket.netPnl = bucket.netPnl.plus(trade.net);
  if (trade.net.gt(0)) bucket.winningTrades += 1;
  if (trade.net.lt(0)) bucket.losingTrades += 1;
}

function finalizeBucket(bucket: MutableBucket): AnalyticsBucket {
  return {
    key: bucket.key,
    label: bucket.label,
    tradeCount: bucket.tradeCount,
    netPnl: bucket.netPnl.toString(),
    averageNetPnl: bucket.tradeCount ? bucket.netPnl.div(bucket.tradeCount).toString() : "0",
    winningTrades: bucket.winningTrades,
    losingTrades: bucket.losingTrades
  };
}

function formatPrice(value: Decimal): string {
  const absolute = value.abs();
  const digits = absolute.gte(100) ? 2 : absolute.gte(1) ? 3 : 4;
  return `$${value.toFixed(digits).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "")}`;
}

function formatQuantity(value: Decimal): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value.toNumber());
}

function makeRangeLabel(start: Decimal, end: Decimal, formatter: (value: Decimal) => string): string {
  const first = formatter(start);
  const last = formatter(end);
  return first === last ? first : `${first}–${last}`;
}

function makeNumericBuckets(
  trades: PreparedTrade[],
  value: (trade: PreparedTrade) => Decimal,
  formatter: (value: Decimal) => string,
  keyPrefix: string
): AnalyticsBucket[] {
  if (trades.length === 0) return [];

  const sorted = [...trades].sort((left, right) => value(left).cmp(value(right)));
  const uniqueValues: Decimal[] = [];
  const uniqueKeys = new Set<string>();
  for (const trade of sorted) {
    const current = value(trade);
    const key = current.toString();
    if (!uniqueKeys.has(key)) {
      uniqueKeys.add(key);
      uniqueValues.push(current);
    }
  }

  const bucketCount = Math.min(5, uniqueValues.length);
  const uniqueIndexByKey = new Map(uniqueValues.map((candidate, index) => [candidate.toString(), index]));
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const startIndex = Math.floor(index * uniqueValues.length / bucketCount);
    const endIndex = Math.ceil((index + 1) * uniqueValues.length / bucketCount) - 1;
    const start = uniqueValues[startIndex]!;
    const end = uniqueValues[endIndex]!;
    return emptyBucket(`${keyPrefix}-${index + 1}`, makeRangeLabel(start, end, formatter));
  });

  for (const trade of trades) {
    const currentKey = value(trade).toString();
    const valueIndex = uniqueIndexByKey.get(currentKey) ?? 0;
    const bucketIndex = Math.min(bucketCount - 1, Math.floor(valueIndex * bucketCount / uniqueValues.length));
    addTrade(buckets[bucketIndex]!, trade);
  }

  return buckets.map(finalizeBucket);
}

export function buildTradeAnalytics(trades: TradeAnalyticsInput[], timezone = "America/New_York"): TradeAnalytics {
  const prepared: PreparedTrade[] = [];
  for (const trade of trades) {
    const localDate = DateTime.fromISO(trade.openedAt, { zone: timezone });
    let price: Decimal;
    let quantityValue: Decimal;
    let net: Decimal;
    try {
      price = new Decimal(trade.entryPrice);
      quantityValue = new Decimal(trade.quantity);
      net = new Decimal(trade.netPnl);
    } catch {
      continue;
    }
    if (!localDate.isValid || !price.isFinite() || !price.isPositive() || !quantityValue.isFinite() || !quantityValue.isPositive() || !net.isFinite()) continue;
    prepared.push({ ...trade, price, quantityValue, net, localDate });
  }

  const weekdays = WEEKDAYS.map((weekday) => emptyBucket(weekday.key, weekday.label));
  const outsideWeekdays = emptyBucket("weekday-other", "Muut");
  const hours = Array.from({ length: MARKET_HOUR_END - MARKET_HOUR_START + 1 }, (_, index) => {
    const hour = MARKET_HOUR_START + index;
    return emptyBucket(`hour-${hour}`, `${String(hour).padStart(2, "0")}:00`);
  });
  const outsideHours = emptyBucket("hour-other", "Muut");

  for (const trade of prepared) {
    const weekday = WEEKDAYS.findIndex((candidate) => candidate.weekday === trade.localDate.weekday);
    if (weekday >= 0) addTrade(weekdays[weekday]!, trade);
    else addTrade(outsideWeekdays, trade);
    const hourIndex = trade.localDate.hour - MARKET_HOUR_START;
    if (hourIndex >= 0 && hourIndex < hours.length) addTrade(hours[hourIndex]!, trade);
    else addTrade(outsideHours, trade);
  }

  const hourBuckets = [...hours];
  if (outsideHours.tradeCount > 0) hourBuckets.push(outsideHours);

  const weekdayBuckets = [...weekdays];
  if (outsideWeekdays.tradeCount > 0) weekdayBuckets.push(outsideWeekdays);

  return {
    byWeekday: weekdayBuckets.map(finalizeBucket),
    byHour: hourBuckets.map(finalizeBucket),
    byEntryPrice: makeNumericBuckets(prepared, (trade) => trade.price, formatPrice, "price"),
    byQuantity: makeNumericBuckets(prepared, (trade) => trade.quantityValue, formatQuantity, "quantity")
  };
}
