import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import { alpacaEnv } from "./env";

export interface MarketBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradeCount: number;
  vwap: number;
}

interface AlpacaBar { t: string; o: number; h: number; l: number; c: number; v: number; n: number; vw: number }
interface AlpacaResponse { bars?: AlpacaBar[]; next_page_token?: string | null; message?: string }

export class AlpacaMarketDataError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "AlpacaMarketDataError";
  }
}

export function marketSessionBounds(sessionDate: string) {
  const day = DateTime.fromISO(sessionDate, { zone: "America/New_York" });
  if (!day.isValid) throw new Error("Virheellinen markkinapäivä.");
  const start = day.set({ hour: 4, minute: 0, second: 0, millisecond: 0 });
  const end = day.set({ hour: 20, minute: 0, second: 0, millisecond: 0 });
  return { start, end };
}

export async function fetchAlpacaBars(symbol: string, sessionDate: string, endOverride?: DateTime): Promise<MarketBar[]> {
  const { keyId, secretKey } = alpacaEnv();
  const bounds = marketSessionBounds(sessionDate);
  const end = endOverride && endOverride < bounds.end ? endOverride : bounds.end;
  const bars: MarketBar[] = [];
  let pageToken: string | null = null;
  do {
    const url = new URL(`https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/bars`);
    url.searchParams.set("timeframe", "1Min");
    url.searchParams.set("start", bounds.start.toUTC().toISO()!);
    url.searchParams.set("end", end.toUTC().toISO()!);
    url.searchParams.set("adjustment", "raw");
    url.searchParams.set("feed", "sip");
    url.searchParams.set("sort", "asc");
    url.searchParams.set("limit", "10000");
    url.searchParams.set("asof", sessionDate);
    if (pageToken) url.searchParams.set("page_token", pageToken);
    const response = await fetch(url, {
      headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secretKey },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
    const body = await response.json().catch(() => ({})) as AlpacaResponse;
    if (!response.ok) throw new AlpacaMarketDataError(body.message ?? `Alpaca vastasi ${response.status}.`, response.status);
    for (const bar of body.bars ?? []) {
      if (![bar.o, bar.h, bar.l, bar.c, bar.v].every(Number.isFinite) || bar.o <= 0 || bar.h <= 0 || bar.l <= 0 || bar.c <= 0 || !Date.parse(bar.t)) {
        throw new AlpacaMarketDataError("Alpaca palautti virheellisen kynttilän.", 502);
      }
      bars.push({ time: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v, tradeCount: bar.n, vwap: bar.vw });
    }
    pageToken = body.next_page_token ?? null;
  } while (pageToken);
  bars.sort((a, b) => a.time.localeCompare(b.time));
  return bars;
}

export async function readCachedBars(admin: SupabaseClient, storagePath: string): Promise<MarketBar[] | null> {
  const { data, error } = await admin.storage.from("market-data").download(storagePath);
  if (error || !data) return null;
  try {
    const json = gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8");
    const parsed = JSON.parse(json) as { version: number; bars: MarketBar[] };
    return parsed.version === 1 && Array.isArray(parsed.bars) ? parsed.bars : null;
  } catch {
    return null;
  }
}

export async function cacheBars(admin: SupabaseClient, options: { userId: string; symbol: string; sessionDate: string; bars: MarketBar[] }) {
  const payload = Buffer.from(JSON.stringify({ version: 1, provider: "alpaca", feed: "sip", timeframe: "1Min", symbol: options.symbol, sessionDate: options.sessionDate, bars: options.bars }));
  const zipped = gzipSync(payload);
  const storagePath = `${options.userId}/alpaca/sip/1Min/${options.symbol}/${options.sessionDate}.json.gz`;
  const { error } = await admin.storage.from("market-data").upload(storagePath, zipped, { contentType: "application/gzip", upsert: true });
  if (error) throw error;
  return { storagePath, sha256: createHash("sha256").update(zipped).digest("hex"), size: zipped.length };
}
