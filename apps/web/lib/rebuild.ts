import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconstructTrades, type NormalizedFill } from "@trading-journal/trade-domain";

export async function rebuildUserTrades(admin: SupabaseClient, userId: string) {
  const { data: rows, error } = await admin
    .from("execution_fills")
    .select("id,stable_key,source_id,source_trade_id,source_order_id,trader,source_account,branch,route,broker_symbol,rrno,side,short_flag,market,symbol,quantity,price,executed_at,execution_date,raw_payload")
    .eq("user_id", userId)
    .order("executed_at", { ascending: true })
    .range(0, 49_999);
  if (error) throw error;

  const fillIds = new Map<string, string>();
  const fills: NormalizedFill[] = (rows ?? []).map((row) => {
    fillIds.set(row.stable_key, row.id);
    return {
      stableKey: row.stable_key,
      sourceId: row.source_id,
      tradeId: row.source_trade_id,
      orderId: row.source_order_id,
      trader: row.trader,
      account: row.source_account,
      branch: row.branch,
      route: row.route,
      brokerSymbol: row.broker_symbol,
      rrno: row.rrno,
      side: row.side,
      shortFlag: row.short_flag,
      market: row.market,
      symbol: row.symbol,
      quantity: row.quantity,
      price: String(row.price),
      executedAt: row.executed_at,
      executionDate: row.execution_date,
      raw: row.raw_payload
    } as NormalizedFill;
  });

  const rebuilt = reconstructTrades(fills);
  const tradeIds = new Map<string, string>();
  const trades = rebuilt.trades.map((trade) => {
    const id = randomUUID();
    tradeIds.set(trade.tradeKey, id);
    return {
      id,
      trade_key: trade.tradeKey,
      source_account: trade.account,
      symbol: trade.symbol,
      direction: trade.direction,
      status: trade.status,
      opened_at: trade.openedAt,
      closed_at: trade.closedAt,
      quantity: trade.quantity,
      open_quantity: trade.openQuantity,
      entry_vwap: trade.entryVwap,
      exit_vwap: trade.exitVwap,
      gross_pnl: trade.grossPnl,
      fill_count: trade.fillCount
    };
  });
  const allocations = rebuilt.allocations.map((allocation) => ({
    trade_id: tradeIds.get(allocation.tradeKey),
    fill_id: fillIds.get(allocation.fillStableKey),
    role: allocation.role,
    quantity: allocation.quantity,
    price: allocation.price
  }));
  if (allocations.some((allocation) => !allocation.trade_id || !allocation.fill_id)) {
    throw new Error("Reconstruction produced an unresolved allocation.");
  }

  const { error: replaceError } = await admin.rpc("replace_reconstructed_trades", {
    p_user_id: userId,
    p_trades: trades,
    p_allocations: allocations
  });
  if (replaceError) throw replaceError;
  return rebuilt;
}

