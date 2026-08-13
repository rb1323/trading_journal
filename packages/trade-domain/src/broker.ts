import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import Decimal from "decimal.js";
import { DateTime } from "luxon";
import type {
  BrokerParseResult,
  BrokerTransaction,
  CostReconciliationGroup,
  CostReconciliationResult,
  CostTradeLeg,
  MappedBrokerTransaction,
  ParseIssue,
  TradeCostAllocationResult
} from "./types";

const REQUIRED_HEADERS = [
  "account #", "transaction id", "entry type", "trade date", "side", "symbol", "qty", "price",
  "comm", "ecn", "exch fee", "regfee", "locate fee", "other fees", "occ fee", "orf fee",
  "taf fee", "total fees", "gross amt", "net amt"
] as const;

export class BrokerCsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrokerCsvParseError";
  }
}

function canonicalHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function get(row: string[], headers: Map<string, number>, name: string): string {
  const index = headers.get(name);
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function parseNumber(raw: string, line: number, field: string, issues: ParseIssue[]): string | null {
  try {
    const value = new Decimal(raw || "0");
    if (!value.isFinite()) throw new Error("not finite");
    return value.toString();
  } catch {
    issues.push({ line, message: `Virheellinen ${field}: ${raw}` });
    return null;
  }
}

function transactionKey(account: string, transactionId: string): string {
  return createHash("sha256").update(`${account}\u001f${transactionId}`, "utf8").digest("hex");
}

export function parseBrokerCsv(csv: string): BrokerParseResult {
  let records: string[][];
  try {
    records = parse(csv.replace(/^\uFEFF/, ""), {
      bom: true,
      columns: false,
      relax_column_count: false,
      skip_empty_lines: true,
      trim: false
    }) as string[][];
  } catch (error) {
    throw new BrokerCsvParseError(`Broker-CSV on virheellinen: ${error instanceof Error ? error.message : "tuntematon virhe"}`);
  }

  const rawHeaders = records[0];
  if (!rawHeaders) throw new BrokerCsvParseError("Broker-CSV on tyhjä.");
  const headers = new Map(rawHeaders.map((header, index) => [canonicalHeader(header), index]));
  const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
  if (missing.length > 0) throw new BrokerCsvParseError(`Pakollisia sarakkeita puuttuu: ${missing.join(", ")}`);

  const issues: ParseIssue[] = [];
  const transactions: BrokerTransaction[] = [];
  for (let index = 1; index < records.length; index += 1) {
    const row = records[index];
    if (!row) continue;
    const line = index + 1;
    const accountNumber = get(row, headers, "account #");
    const transactionId = get(row, headers, "transaction id");
    const entryType = get(row, headers, "entry type").toUpperCase();
    const tradeDateRaw = get(row, headers, "trade date");
    const settlementDateRaw = get(row, headers, "settlement date");
    const side = get(row, headers, "side").toUpperCase();
    const symbol = get(row, headers, "symbol").toUpperCase();

    if (!accountNumber || !transactionId || !entryType || !tradeDateRaw) {
      issues.push({ line, message: "Pakollinen broker-arvo puuttuu." });
      continue;
    }
    if (entryType === "TRD" && (!symbol || !side)) {
      issues.push({ line, message: "Treidiriviltä puuttuu symboli tai side." });
      continue;
    }
    if (!["", "B", "S", "SS"].includes(side)) {
      issues.push({ line, message: `Tuntematon Side-arvo: ${side}` });
      continue;
    }
    const tradeDate = DateTime.fromFormat(tradeDateRaw, "yyyy-MM-dd", { locale: "en-US" });
    const settlementDate = settlementDateRaw ? DateTime.fromFormat(settlementDateRaw, "yyyy-MM-dd", { locale: "en-US" }) : null;
    if (!tradeDate.isValid || (settlementDate && !settlementDate.isValid)) {
      issues.push({ line, message: `Virheellinen päivämäärä: ${tradeDateRaw}` });
      continue;
    }

    const numericFields = [
      ["quantity", get(row, headers, "qty")], ["price", get(row, headers, "price")],
      ["commission", get(row, headers, "comm")], ["ecnFee", get(row, headers, "ecn")],
      ["exchangeFee", get(row, headers, "exch fee")], ["regulatoryFee", get(row, headers, "regfee")],
      ["locateFee", get(row, headers, "locate fee")], ["otherFees", get(row, headers, "other fees")],
      ["occFee", get(row, headers, "occ fee")], ["orfFee", get(row, headers, "orf fee")],
      ["tafFee", get(row, headers, "taf fee")], ["totalFees", get(row, headers, "total fees")],
      ["grossAmount", get(row, headers, "gross amt")], ["netAmount", get(row, headers, "net amt")]
    ] as const;
    const parsed = Object.fromEntries(numericFields.map(([name, raw]) => [name, parseNumber(raw, line, name, issues)])) as Record<string, string | null>;
    if (Object.values(parsed).some((value) => value === null)) continue;
    if (entryType === "TRD" && new Decimal(parsed.quantity ?? 0).isZero()) {
      issues.push({ line, message: "Treidirivin Qty ei voi olla nolla." });
      continue;
    }

    const raw = Object.fromEntries(rawHeaders.map((header, headerIndex) => [header.trim(), row[headerIndex] ?? ""]));
    transactions.push({
      stableKey: transactionKey(accountNumber, transactionId), accountNumber, transactionId, entryType,
      description: get(row, headers, "description"), tradeDate: tradeDate.toISODate()!,
      settlementDate: settlementDate?.toISODate() ?? null, side, symbol,
      quantity: parsed.quantity!, price: parsed.price!, commission: parsed.commission!, ecnFee: parsed.ecnFee!,
      exchangeFee: parsed.exchangeFee!, regulatoryFee: parsed.regulatoryFee!, locateFee: parsed.locateFee!,
      otherFees: parsed.otherFees!, occFee: parsed.occFee!, orfFee: parsed.orfFee!, tafFee: parsed.tafFee!,
      totalFees: parsed.totalFees!, grossAmount: parsed.grossAmount!, netAmount: parsed.netAmount!, raw
    });
  }
  return { transactions, issues };
}

function groupKey(account: string, date: string, symbol: string, side: string): string {
  return `${account}\u001f${date}\u001f${symbol}\u001f${side}`;
}

function distribute(
  transaction: MappedBrokerTransaction,
  legs: CostTradeLeg[],
  costType: "trade_fee" | "locate_fee"
): TradeCostAllocationResult[] {
  const totalQuantity = legs.reduce((sum, leg) => sum.plus(leg.quantity), new Decimal(0));
  if (totalQuantity.isZero() || new Decimal(transaction.totalFees).isZero()) return [];
  const quantitiesByTrade = new Map<string, Decimal>();
  for (const leg of legs) quantitiesByTrade.set(leg.tradeId, (quantitiesByTrade.get(leg.tradeId) ?? new Decimal(0)).plus(leg.quantity));
  return [...quantitiesByTrade.entries()].map(([tradeId, quantity]) => ({
    transactionStableKey: transaction.stableKey,
    tradeId,
    costType,
    amount: new Decimal(transaction.totalFees).mul(quantity).div(totalQuantity).toString()
  }));
}

export function reconcileTradeCosts(
  legs: CostTradeLeg[],
  transactions: MappedBrokerTransaction[],
  notionalTolerance = "0.02"
): CostReconciliationResult {
  const tradeGroups = new Map<string, CostTradeLeg[]>();
  for (const leg of legs) {
    const key = groupKey(leg.sourceAccount, leg.tradeDate, leg.symbol, leg.side);
    tradeGroups.set(key, [...(tradeGroups.get(key) ?? []), leg]);
  }
  const brokerGroups = new Map<string, MappedBrokerTransaction[]>();
  for (const transaction of transactions.filter((row) => row.entryType === "TRD")) {
    const side = transaction.side === "B" ? "B" : "S";
    const key = groupKey(transaction.sourceAccount, transaction.tradeDate, transaction.symbol, side);
    brokerGroups.set(key, [...(brokerGroups.get(key) ?? []), transaction]);
  }

  const allocations: TradeCostAllocationResult[] = [];
  const groups: CostReconciliationGroup[] = [];
  const matchedKeys = new Set<string>();
  const conflictKeys = new Set<string>();
  const allKeys = new Set([...tradeGroups.keys(), ...brokerGroups.keys()]);
  for (const key of allKeys) {
    const groupLegs = tradeGroups.get(key) ?? [];
    const brokerRows = brokerGroups.get(key) ?? [];
    const executionQuantity = groupLegs.reduce((sum, leg) => sum.plus(leg.quantity), new Decimal(0));
    const executionNotional = groupLegs.reduce((sum, leg) => sum.plus(leg.notional), new Decimal(0));
    const brokerQuantity = brokerRows.reduce((sum, row) => sum.plus(new Decimal(row.quantity).abs()), new Decimal(0));
    const brokerNotional = brokerRows.reduce((sum, row) => sum.plus(new Decimal(row.grossAmount).abs()), new Decimal(0));
    const matches = executionQuantity.eq(brokerQuantity) && executionNotional.minus(brokerNotional).abs().lte(notionalTolerance);
    groups.push({
      key,
      status: matches ? "reconciled" : "conflict",
      brokerQuantity: brokerQuantity.toString(), executionQuantity: executionQuantity.toString(),
      brokerNotional: brokerNotional.toString(), executionNotional: executionNotional.toString(),
      ...(matches ? {} : { message: "Määrä tai notional ei täsmää DAS-executioneihin." })
    });
    if (matches) {
      matchedKeys.add(key);
      for (const row of brokerRows) allocations.push(...distribute(row, groupLegs, "trade_fee"));
    } else {
      conflictKeys.add(key);
    }
  }

  let unallocatedFees = new Decimal(0);
  for (const transaction of transactions.filter((row) => row.entryType === "JNLC")) {
    const isLocateFee = Boolean(transaction.symbol) && !new Decimal(transaction.locateFee).isZero();
    if (!isLocateFee) {
      unallocatedFees = unallocatedFees.plus(transaction.totalFees);
      continue;
    }
    const shortEntryLegs = legs.filter((leg) =>
      leg.sourceAccount === transaction.sourceAccount && leg.tradeDate === transaction.tradeDate &&
      leg.symbol === transaction.symbol && leg.direction === "short" && leg.side === "S"
    );
    if (shortEntryLegs.length === 0) unallocatedFees = unallocatedFees.plus(transaction.totalFees);
    else allocations.push(...distribute(transaction, shortEntryLegs, "locate_fee"));
  }

  const tradeStatuses: Record<string, "provisional" | "reconciled" | "conflict"> = {};
  for (const leg of legs) {
    const key = groupKey(leg.sourceAccount, leg.tradeDate, leg.symbol, leg.side);
    const current = tradeStatuses[leg.tradeId];
    if (conflictKeys.has(key)) tradeStatuses[leg.tradeId] = "conflict";
    else if (matchedKeys.has(key) && current !== "conflict") tradeStatuses[leg.tradeId] = "reconciled";
    else if (!current) tradeStatuses[leg.tradeId] = "provisional";
  }

  return { allocations, tradeStatuses, groups, unallocatedFees: unallocatedFees.toString() };
}
