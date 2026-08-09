import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseDasCsv, SnapshotParseError } from "@trading-journal/trade-domain";
import { authenticateDevice } from "@/lib/device-auth";
import { sha256 } from "@/lib/crypto";
import { rebuildUserTrades } from "@/lib/rebuild";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function canonicalJson(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function equalHash(expected: string, actual: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(expected) || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected.toLowerCase()), Buffer.from(actual.toLowerCase()));
}

export async function POST(request: Request) {
  const auth = await authenticateDevice(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const sourceId = String(form?.get("sourceId") ?? "");
  const providedHash = String(form?.get("sha256") ?? "");
  const lastModified = String(form?.get("lastModifiedUtc") ?? "");
  if (!(file instanceof File) || !sourceId || !lastModified || Number.isNaN(Date.parse(lastModified))) {
    return NextResponse.json({ error: "Invalid multipart snapshot" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Snapshot exceeds 10 MB" }, { status: 413 });

  const { data: source } = await auth.admin
    .from("sync_sources")
    .select("id,user_id,device_id,timezone")
    .eq("id", sourceId)
    .eq("device_id", auth.device.id)
    .maybeSingle();
  if (!source) return NextResponse.json({ error: "Unknown source" }, { status: 403 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const actualHash = sha256(bytes);
  if (!equalHash(providedHash, actualHash)) return NextResponse.json({ error: "SHA-256 mismatch" }, { status: 400 });

  const { data: previous } = await auth.admin
    .from("sync_snapshots")
    .select("id,status,added_count,duplicate_count,error_count,trade_count,open_position_count,issues")
    .eq("source_id", sourceId)
    .eq("sha256", actualHash)
    .maybeSingle();
  if (previous) return NextResponse.json({ ...previous, idempotent: true });

  const { data: snapshot, error: snapshotError } = await auth.admin
    .from("sync_snapshots")
    .insert({
      user_id: source.user_id,
      source_id: sourceId,
      file_name: file.name,
      file_size: file.size,
      file_last_modified_at: new Date(lastModified).toISOString(),
      sha256: actualHash,
      status: "processing"
    })
    .select("id")
    .single();
  if (snapshotError || !snapshot) return NextResponse.json({ error: snapshotError?.message ?? "Snapshot creation failed" }, { status: 500 });

  try {
    const parsed = parseDasCsv(bytes.toString("utf8"), { sourceId, timezone: source.timezone });
    const accounts = [...new Set(parsed.fills.map((fill) => fill.account))];
    if (accounts.length > 0) {
      const { error } = await auth.admin.from("broker_accounts").upsert(
        accounts.map((account) => ({ user_id: source.user_id, source_account: account })),
        { onConflict: "user_id,source_account", ignoreDuplicates: true }
      );
      if (error) throw error;
    }
    const keys = parsed.fills.map((fill) => fill.stableKey);
    const existing = new Map<string, Record<string, string>>();
    for (let offset = 0; offset < keys.length; offset += 200) {
      const batch = keys.slice(offset, offset + 200);
      if (batch.length === 0) continue;
      const { data, error } = await auth.admin.from("execution_fills").select("stable_key,raw_payload").eq("source_id", sourceId).in("stable_key", batch);
      if (error) throw error;
      for (const row of data ?? []) existing.set(row.stable_key, row.raw_payload);
    }

    const conflicts: Array<{ stableKey: string; message: string }> = [];
    const newFills = parsed.fills.filter((fill) => {
      const old = existing.get(fill.stableKey);
      if (!old) return true;
      if (canonicalJson(old) !== canonicalJson(fill.raw)) conflicts.push({ stableKey: fill.stableKey, message: "Sama filliavain saapui eri raakasisällöllä." });
      return false;
    });

    if (newFills.length > 0) {
      const { error } = await auth.admin.from("execution_fills").insert(newFills.map((fill) => ({
        user_id: source.user_id,
        source_id: sourceId,
        first_snapshot_id: snapshot.id,
        stable_key: fill.stableKey,
        source_trade_id: fill.tradeId,
        source_order_id: fill.orderId,
        trader: fill.trader,
        source_account: fill.account,
        branch: fill.branch,
        route: fill.route,
        broker_symbol: fill.brokerSymbol,
        rrno: fill.rrno,
        side: fill.side,
        short_flag: fill.shortFlag,
        market: fill.market,
        symbol: fill.symbol,
        quantity: fill.quantity,
        price: fill.price,
        executed_at: fill.executedAt,
        execution_date: fill.executionDate,
        raw_payload: fill.raw
      })));
      if (error) throw error;
    }

    const rebuilt = await rebuildUserTrades(auth.admin, source.user_id);
    const issues = [...parsed.issues, ...conflicts];
    const summary = {
      status: conflicts.length > 0 ? "conflict" : "succeeded",
      added_count: newFills.length,
      duplicate_count: parsed.fills.length - newFills.length,
      error_count: issues.length,
      trade_count: rebuilt.trades.filter((trade) => trade.status === "closed").length,
      open_position_count: rebuilt.trades.filter((trade) => trade.status === "open").length,
      issues,
      processed_at: new Date().toISOString()
    };
    await auth.admin.from("sync_snapshots").update(summary).eq("id", snapshot.id);
    await auth.admin.from("sync_sources").update({ last_snapshot_at: summary.processed_at }).eq("id", sourceId);
    return NextResponse.json({ snapshotId: snapshot.id, ...summary });
  } catch (error) {
    const message = error instanceof SnapshotParseError || error instanceof Error ? error.message : "Unknown import error";
    await auth.admin.from("sync_snapshots").update({
      status: "rejected",
      error_count: 1,
      issues: [{ line: 0, message }],
      processed_at: new Date().toISOString()
    }).eq("id", snapshot.id);
    return NextResponse.json({ error: message, snapshotId: snapshot.id }, { status: 422 });
  }
}
