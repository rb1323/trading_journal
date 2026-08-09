import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import type {
  NormalizedFill,
  ReconstructionResult,
  ReconstructedTrade,
  TradeDirection,
  TradeFillAllocation
} from "./types";

interface DraftTrade {
  tradeKey: string;
  account: string;
  symbol: string;
  direction: TradeDirection;
  openedAt: string;
  closedAt: string | null;
  position: number;
  averageCost: Decimal;
  entryQuantity: number;
  entryNotional: Decimal;
  exitQuantity: number;
  exitNotional: Decimal;
  grossPnl: Decimal;
  fillKeys: Set<string>;
}

function makeTradeKey(account: string, symbol: string, openedAt: string, direction: TradeDirection, sequence: number): string {
  return createHash("sha256").update(`${account}|${symbol}|${openedAt}|${direction}|${sequence}`).digest("hex");
}

function compareFills(a: NormalizedFill, b: NormalizedFill): number {
  const byTime = a.executedAt.localeCompare(b.executedAt);
  if (byTime !== 0) return byTime;
  const aId = Number(a.tradeId);
  const bId = Number(b.tradeId);
  if (Number.isFinite(aId) && Number.isFinite(bId)) return aId - bId;
  return a.tradeId.localeCompare(b.tradeId);
}

function serializeTrade(draft: DraftTrade): ReconstructedTrade {
  return {
    tradeKey: draft.tradeKey,
    account: draft.account,
    symbol: draft.symbol,
    direction: draft.direction,
    status: draft.position === 0 ? "closed" : "open",
    openedAt: draft.openedAt,
    closedAt: draft.position === 0 ? draft.closedAt : null,
    quantity: draft.entryQuantity,
    openQuantity: Math.abs(draft.position),
    entryVwap: draft.entryNotional.div(draft.entryQuantity).toString(),
    exitVwap: draft.exitQuantity > 0 ? draft.exitNotional.div(draft.exitQuantity).toString() : null,
    grossPnl: draft.grossPnl.toString(),
    fillCount: draft.fillKeys.size
  };
}

export function reconstructTrades(input: NormalizedFill[]): ReconstructionResult {
  const grouped = new Map<string, NormalizedFill[]>();
  for (const fill of input) {
    const key = `${fill.account}\u001f${fill.symbol}`;
    const group = grouped.get(key) ?? [];
    group.push(fill);
    grouped.set(key, group);
  }

  const trades: ReconstructedTrade[] = [];
  const allocations: TradeFillAllocation[] = [];

  for (const group of grouped.values()) {
    const fills = [...group].sort(compareFills);
    let current: DraftTrade | null = null;
    let sequence = 0;

    const openTrade = (fill: NormalizedFill, signedQuantity: number, quantity: number): DraftTrade => {
      const direction: TradeDirection = signedQuantity > 0 ? "long" : "short";
      sequence += 1;
      const trade: DraftTrade = {
        tradeKey: makeTradeKey(fill.account, fill.symbol, fill.executedAt, direction, sequence),
        account: fill.account,
        symbol: fill.symbol,
        direction,
        openedAt: fill.executedAt,
        closedAt: null,
        position: signedQuantity > 0 ? quantity : -quantity,
        averageCost: new Decimal(fill.price),
        entryQuantity: quantity,
        entryNotional: new Decimal(fill.price).mul(quantity),
        exitQuantity: 0,
        exitNotional: new Decimal(0),
        grossPnl: new Decimal(0),
        fillKeys: new Set([fill.stableKey])
      };
      allocations.push({ tradeKey: trade.tradeKey, fillStableKey: fill.stableKey, role: "entry", quantity, price: fill.price });
      return trade;
    };

    for (const fill of fills) {
      let remaining = fill.quantity;
      const signedDirection = fill.side === "B" ? 1 : -1;

      while (remaining > 0) {
        if (!current) {
          current = openTrade(fill, signedDirection, remaining);
          remaining = 0;
          continue;
        }

        const positionDirection = Math.sign(current.position);
        if (positionDirection === signedDirection) {
          const price = new Decimal(fill.price);
          current.averageCost = current.averageCost.mul(Math.abs(current.position)).plus(price.mul(remaining)).div(Math.abs(current.position) + remaining);
          current.position += signedDirection * remaining;
          current.entryQuantity += remaining;
          current.entryNotional = current.entryNotional.plus(price.mul(remaining));
          current.fillKeys.add(fill.stableKey);
          allocations.push({ tradeKey: current.tradeKey, fillStableKey: fill.stableKey, role: "entry", quantity: remaining, price: fill.price });
          remaining = 0;
          continue;
        }

        const closingQuantity = Math.min(remaining, Math.abs(current.position));
        const price = new Decimal(fill.price);
        const pnlPerShare = current.direction === "long" ? price.minus(current.averageCost) : current.averageCost.minus(price);
        current.grossPnl = current.grossPnl.plus(pnlPerShare.mul(closingQuantity));
        current.exitQuantity += closingQuantity;
        current.exitNotional = current.exitNotional.plus(price.mul(closingQuantity));
        current.position += signedDirection * closingQuantity;
        current.fillKeys.add(fill.stableKey);
        allocations.push({ tradeKey: current.tradeKey, fillStableKey: fill.stableKey, role: "exit", quantity: closingQuantity, price: fill.price });
        remaining -= closingQuantity;

        if (current.position === 0) {
          current.closedAt = fill.executedAt;
          trades.push(serializeTrade(current));
          current = null;
        }
      }
    }

    if (current) trades.push(serializeTrade(current));
  }

  trades.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  return { trades, allocations };
}

