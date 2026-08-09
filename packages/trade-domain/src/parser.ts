import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import Decimal from "decimal.js";
import { DateTime } from "luxon";
import type { DasSide, NormalizedFill, ParseIssue, ParseResult } from "./types";

const REQUIRED_HEADERS = ["tradeid", "account", "b/s", "symb", "qty", "price", "time"] as const;

export class SnapshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotParseError";
  }
}

export interface ParseDasCsvOptions {
  sourceId: string;
  timezone?: string;
}

function canonicalHeader(value: string): string {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function get(row: string[], headerIndex: Map<string, number>, name: string): string {
  const index = headerIndex.get(name);
  return index === undefined ? "" : (row[index] ?? "").trim();
}

function stableKey(parts: Array<string | number>): string {
  return createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
}

export function parseDasCsv(csv: string, options: ParseDasCsvOptions): ParseResult {
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
    throw new SnapshotParseError(`CSV-tiedosto on keskeneräinen tai virheellinen: ${error instanceof Error ? error.message : "tuntematon virhe"}`);
  }

  const headers = records[0];
  if (!headers) {
    throw new SnapshotParseError("CSV-tiedosto on tyhjä.");
  }

  const headerIndex = new Map(headers.map((header, index) => [canonicalHeader(header), index]));
  const missing = REQUIRED_HEADERS.filter((header) => !headerIndex.has(header));
  if (missing.length > 0) {
    throw new SnapshotParseError(`Pakollisia sarakkeita puuttuu: ${missing.join(", ")}`);
  }

  const timezone = options.timezone ?? "America/New_York";
  const issues: ParseIssue[] = [];
  const fills: NormalizedFill[] = [];

  for (let index = 1; index < records.length; index += 1) {
    const row = records[index];
    if (!row) continue;
    const line = index + 1;
    const tradeId = get(row, headerIndex, "tradeid");
    const account = get(row, headerIndex, "account");
    const sideRaw = get(row, headerIndex, "b/s").toUpperCase();
    const symbol = get(row, headerIndex, "symb").toUpperCase();
    const quantityRaw = get(row, headerIndex, "qty");
    const priceRaw = get(row, headerIndex, "price");
    const timeRaw = get(row, headerIndex, "time");

    const missingRequired = !tradeId || !account || !symbol || !quantityRaw || !priceRaw || !timeRaw;
    if (missingRequired) {
      if (index === records.length - 1) {
        throw new SnapshotParseError(`CSV-tiedoston viimeinen rivi ${line} vaikuttaa keskeneräiseltä.`);
      }
      issues.push({ line, message: "Pakollinen arvo puuttuu." });
      continue;
    }

    if (!["B", "S"].includes(sideRaw)) {
      issues.push({ line, message: "B/S-arvo ei ole B tai S." });
      continue;
    }

    const quantity = Number(quantityRaw);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      issues.push({ line, message: `Virheellinen määrä: ${quantityRaw}` });
      continue;
    }

    let price: Decimal;
    try {
      price = new Decimal(priceRaw);
      if (!price.isPositive()) throw new Error("price must be positive");
    } catch {
      issues.push({ line, message: `Virheellinen hinta: ${priceRaw}` });
      continue;
    }

    const localTime = DateTime.fromFormat(timeRaw, "MM/dd/yy HH:mm:ss", { zone: timezone, locale: "en-US" });
    if (!localTime.isValid) {
      issues.push({ line, message: `Virheellinen aika: ${timeRaw}` });
      continue;
    }

    const executedAt = localTime.toUTC().toISO({ suppressMilliseconds: true });
    const executionDate = localTime.toISODate();
    if (!executedAt || !executionDate) {
      issues.push({ line, message: `Aikaa ei voitu muuntaa: ${timeRaw}` });
      continue;
    }

    const side = sideRaw as DasSide;
    const raw = Object.fromEntries(headers.map((header, headerPosition) => [header.trim(), row[headerPosition] ?? ""]));
    fills.push({
      stableKey: stableKey([options.sourceId, account, executionDate, tradeId, executedAt, symbol, side, quantity, price.toString()]),
      sourceId: options.sourceId,
      tradeId,
      orderId: get(row, headerIndex, "orderid"),
      trader: get(row, headerIndex, "trader"),
      account,
      branch: get(row, headerIndex, "branch"),
      route: get(row, headerIndex, "route"),
      brokerSymbol: get(row, headerIndex, "bkrsym"),
      rrno: get(row, headerIndex, "rrno"),
      side,
      shortFlag: get(row, headerIndex, "short").toUpperCase() === "Y",
      market: get(row, headerIndex, "market"),
      symbol,
      quantity,
      price: price.toString(),
      executedAt,
      executionDate,
      raw
    });
  }

  return { fills, issues };
}
