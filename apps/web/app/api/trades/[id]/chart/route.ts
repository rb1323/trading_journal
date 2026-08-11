import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AlpacaMarketDataError, cacheBars, fetchAlpacaBars, marketSessionBounds, readCachedBars } from "@/lib/market-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: trade } = await supabase.from("trades").select("*").eq("id", id).maybeSingle();
  if (!trade) return NextResponse.json({ error: "Treidiä ei löytynyt." }, { status: 404 });
  const { data: allocations } = await supabase.from("trade_fill_allocations").select("fill_id,role,quantity,price").eq("trade_id", id);
  const fillIds = (allocations ?? []).map((row) => row.fill_id);
  const { data: fills } = fillIds.length > 0
    ? await supabase.from("execution_fills").select("id,executed_at,side,quantity,price,source_trade_id").in("id", fillIds).order("executed_at")
    : { data: [] };
  const fillById = new Map((fills ?? []).map((fill) => [fill.id, fill]));
  const chartFills = (allocations ?? []).map((allocation) => ({
    id: allocation.fill_id,
    executedAt: fillById.get(allocation.fill_id)?.executed_at,
    side: fillById.get(allocation.fill_id)?.side,
    quantity: allocation.quantity,
    price: String(allocation.price),
    role: allocation.role,
    sourceTradeId: fillById.get(allocation.fill_id)?.source_trade_id
  })).filter((fill) => fill.executedAt && fill.side);

  const openedEt = DateTime.fromISO(trade.opened_at, { zone: "utc" }).setZone("America/New_York");
  const sessionDate = openedEt.toISODate()!;
  const bounds = marketSessionBounds(sessionDate);
  const closed = trade.closed_at ? DateTime.fromISO(trade.closed_at, { zone: "utc" }).setZone("America/New_York") : DateTime.now().setZone("America/New_York");
  const defaultStart = DateTime.max(bounds.start, openedEt.minus({ minutes: 30 }));
  const defaultEnd = DateTime.min(bounds.end, closed.plus({ minutes: 30 }));
  const availableAt = defaultEnd.plus({ minutes: 15 });
  const nowEt = DateTime.now().setZone("America/New_York");
  if (nowEt < availableAt) return NextResponse.json({ status: "pending", availableAt: availableAt.toUTC().toISO() }, { status: 202 });

  const admin = createSupabaseAdminClient();
  const { data: cached } = await admin.from("market_data_sessions").select("*")
    .eq("user_id", user.id).eq("provider", "alpaca").eq("feed", "sip").eq("timeframe", "1Min")
    .eq("symbol", trade.symbol).eq("session_date", sessionDate).maybeSingle();
  if (cached?.status === "ready" && cached.storage_path) {
    const bars = await readCachedBars(admin, cached.storage_path);
    if (bars) return NextResponse.json({ status: "ready", source: "cache", bars, fills: chartFills, defaultRange: { from: defaultStart.toUTC().toISO(), to: defaultEnd.toUTC().toISO() } });
  }

  const complete = nowEt >= bounds.end.plus({ minutes: 15 });
  await admin.from("market_data_sessions").upsert({
    user_id: user.id, provider: "alpaca", feed: "sip", timeframe: "1Min", symbol: trade.symbol,
    session_date: sessionDate, status: "fetching", error_message: null, updated_at: new Date().toISOString()
  }, { onConflict: "user_id,provider,feed,timeframe,symbol,session_date" });
  try {
    const bars = await fetchAlpacaBars(trade.symbol, sessionDate, complete ? undefined : defaultEnd);
    if (complete) {
      try {
        const archived = await cacheBars(admin, { userId: user.id, symbol: trade.symbol, sessionDate, bars });
        await admin.from("market_data_sessions").update({
          status: "ready", storage_path: archived.storagePath, bar_count: bars.length, sha256: archived.sha256,
          covered_until: bounds.end.toUTC().toISO(), fetched_at: new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null
        }).eq("user_id", user.id).eq("symbol", trade.symbol).eq("session_date", sessionDate);
      } catch (storageError) {
        await admin.from("market_data_sessions").update({ status: "error", error_message: storageError instanceof Error ? storageError.message : "Storage-tallennus epäonnistui.", updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("symbol", trade.symbol).eq("session_date", sessionDate);
      }
    } else {
      await admin.from("market_data_sessions").update({ status: "error", error_message: "Sessio on vielä kesken; väliaikaista dataa ei arkistoitu.", updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("symbol", trade.symbol).eq("session_date", sessionDate);
    }
    return NextResponse.json({ status: complete ? "ready" : "partial", source: "alpaca", bars, fills: chartFills, defaultRange: { from: defaultStart.toUTC().toISO(), to: defaultEnd.toUTC().toISO() } });
  } catch (error) {
    const unavailable = error instanceof AlpacaMarketDataError && [403, 404].includes(error.status);
    const message = error instanceof Error ? error.message : "Markkinadatan haku epäonnistui.";
    await admin.from("market_data_sessions").update({ status: unavailable ? "unavailable" : "error", error_message: message, updated_at: new Date().toISOString() }).eq("user_id", user.id).eq("symbol", trade.symbol).eq("session_date", sessionDate);
    return NextResponse.json({ error: message, status: unavailable ? "unavailable" : "error" }, { status: unavailable ? 422 : 503 });
  }
}
