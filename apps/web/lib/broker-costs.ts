import Decimal from "decimal.js";
import { reconcileTradeCosts, type CostTradeLeg, type MappedBrokerTransaction } from "@trading-journal/trade-domain";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function ensureExactBrokerMappings(admin: SupabaseClient, userId: string): Promise<void> {
  const [{ data: accounts, error: accountError }, { data: transactions, error: transactionError }, { data: mappings, error: mappingError }] = await Promise.all([
    admin.from("broker_accounts").select("id,source_account").eq("user_id", userId),
    admin.from("broker_transactions").select("account_number").eq("user_id", userId),
    admin.from("broker_account_mappings").select("external_account_number").eq("user_id", userId)
  ]);
  if (accountError || transactionError || mappingError) throw new Error(accountError?.message ?? transactionError?.message ?? mappingError?.message);
  const existing = new Set((mappings ?? []).map((row) => row.external_account_number));
  const accountBySource = new Map((accounts ?? []).map((row) => [row.source_account, row.id]));
  const inserts = [...new Set((transactions ?? []).map((row) => row.account_number))]
    .filter((external) => !existing.has(external) && accountBySource.has(external))
    .map((external) => ({ user_id: userId, external_account_number: external, broker_account_id: accountBySource.get(external) }));
  if (inserts.length > 0) {
    const { error } = await admin.from("broker_account_mappings").upsert(inserts, { onConflict: "user_id,external_account_number" });
    if (error) throw error;
  }
}

export async function reconcileUserBrokerCosts(admin: SupabaseClient, userId: string) {
  await ensureExactBrokerMappings(admin, userId);
  const [tradeResult, allocationResult, transactionResult, mappingResult, accountResult] = await Promise.all([
    admin.from("trades").select("id,source_account,symbol,direction").eq("user_id", userId),
    admin.from("trade_fill_allocations").select("trade_id,fill_id,quantity,price").eq("user_id", userId),
    admin.from("broker_transactions").select("*").eq("user_id", userId),
    admin.from("broker_account_mappings").select("external_account_number,broker_account_id").eq("user_id", userId),
    admin.from("broker_accounts").select("id,source_account").eq("user_id", userId)
  ]);
  const error = tradeResult.error ?? allocationResult.error ?? transactionResult.error ?? mappingResult.error ?? accountResult.error;
  if (error) throw error;

  const trades = new Map((tradeResult.data ?? []).map((trade) => [trade.id, trade]));
  const fillIds = [...new Set((allocationResult.data ?? []).map((allocation) => allocation.fill_id))];
  const fills: Array<{ id: string; side: "B" | "S"; execution_date: string }> = [];
  for (let offset = 0; offset < fillIds.length; offset += 200) {
    const { data, error: fillError } = await admin.from("execution_fills").select("id,side,execution_date").eq("user_id", userId).in("id", fillIds.slice(offset, offset + 200));
    if (fillError) throw fillError;
    fills.push(...((data ?? []) as Array<{ id: string; side: "B" | "S"; execution_date: string }>));
  }
  const fillById = new Map(fills.map((fill) => [fill.id, fill]));
  const accountById = new Map((accountResult.data ?? []).map((account) => [account.id, account.source_account]));
  const sourceByExternal = new Map((mappingResult.data ?? []).map((mapping) => [mapping.external_account_number, accountById.get(mapping.broker_account_id)]));

  const mappedTransactions: MappedBrokerTransaction[] = (transactionResult.data ?? [])
    .filter((row) => sourceByExternal.has(row.account_number))
    .map((row) => ({
      stableKey: row.stable_key,
      accountNumber: row.account_number,
      transactionId: row.transaction_id,
      entryType: row.entry_type,
      description: row.description,
      tradeDate: row.trade_date,
      settlementDate: row.settlement_date,
      side: row.side,
      symbol: row.symbol,
      quantity: String(row.quantity),
      price: String(row.price),
      commission: String(row.commission),
      ecnFee: String(row.ecn_fee),
      exchangeFee: String(row.exchange_fee),
      regulatoryFee: String(row.regulatory_fee),
      locateFee: String(row.locate_fee),
      otherFees: String(row.other_fees),
      occFee: String(row.occ_fee),
      orfFee: String(row.orf_fee),
      tafFee: String(row.taf_fee),
      totalFees: String(row.total_fees),
      grossAmount: String(row.gross_amount),
      netAmount: String(row.net_amount),
      raw: row.raw_payload,
      sourceAccount: sourceByExternal.get(row.account_number)!
    }));
  const coveredAccountDates = new Set(mappedTransactions.map((row) => `${row.sourceAccount}\u001f${row.tradeDate}`));
  const legs: CostTradeLeg[] = [];
  for (const allocation of allocationResult.data ?? []) {
    const trade = trades.get(allocation.trade_id);
    const fill = fillById.get(allocation.fill_id);
    if (!trade || !fill || !coveredAccountDates.has(`${trade.source_account}\u001f${fill.execution_date}`)) continue;
    legs.push({
      tradeId: trade.id,
      sourceAccount: trade.source_account,
      symbol: trade.symbol,
      tradeDate: fill.execution_date,
      direction: trade.direction,
      side: fill.side,
      quantity: allocation.quantity,
      notional: new Decimal(String(allocation.price)).mul(allocation.quantity).toString()
    });
  }

  const reconciliation = reconcileTradeCosts(legs, mappedTransactions);
  const transactionIdByKey = new Map((transactionResult.data ?? []).map((row) => [row.stable_key, row.id]));
  const { error: deleteError } = await admin.from("trade_cost_allocations").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  const { error: resetError } = await admin.from("trades").update({ allocated_fees: "0", cost_status: "provisional" }).eq("user_id", userId);
  if (resetError) throw resetError;

  const allocationRows = reconciliation.allocations.map((allocation) => ({
    user_id: userId,
    trade_id: allocation.tradeId,
    broker_transaction_id: transactionIdByKey.get(allocation.transactionStableKey),
    cost_type: allocation.costType,
    amount: allocation.amount
  })).filter((row) => row.broker_transaction_id);
  if (allocationRows.length > 0) {
    const { error: insertError } = await admin.from("trade_cost_allocations").insert(allocationRows);
    if (insertError) throw insertError;
  }

  const feesByTrade = new Map<string, Decimal>();
  for (const allocation of reconciliation.allocations) {
    feesByTrade.set(allocation.tradeId, (feesByTrade.get(allocation.tradeId) ?? new Decimal(0)).plus(allocation.amount));
  }
  for (const [tradeId, status] of Object.entries(reconciliation.tradeStatuses)) {
    const { error: updateError } = await admin.from("trades").update({
      allocated_fees: feesByTrade.get(tradeId)?.toString() ?? "0",
      cost_status: status
    }).eq("user_id", userId).eq("id", tradeId);
    if (updateError) throw updateError;
  }

  const mappedAccounts = new Set(mappedTransactions.map((row) => row.accountNumber));
  const allAccounts = new Set((transactionResult.data ?? []).map((row) => row.account_number));
  return {
    ...reconciliation,
    unmappedAccounts: [...allAccounts].filter((account) => !mappedAccounts.has(account))
  };
}
