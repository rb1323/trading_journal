import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { generateDeviceToken, sha256 } from "@/lib/crypto";

interface PairBody { code?: string; deviceName?: string; version?: string }

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as PairBody | null;
  const code = body?.code?.trim();
  const deviceName = body?.deviceName?.trim();
  const version = body?.version?.trim();
  if (!code || !/^\d{6}$/.test(code) || !deviceName || !version) {
    return NextResponse.json({ error: "Invalid pairing request" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: pairing } = await admin
    .from("pairing_codes")
    .select("id,user_id,expires_at,used_at")
    .eq("code_hash", sha256(code))
    .maybeSingle();
  if (!pairing || pairing.used_at || new Date(pairing.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ error: "Pairing code is invalid or expired" }, { status: 401 });
  }

  const token = generateDeviceToken();
  const { data: device, error: deviceError } = await admin
    .from("sync_devices")
    .insert({ user_id: pairing.user_id, name: deviceName, version, token_hash: sha256(token), last_seen_at: new Date().toISOString() })
    .select("id")
    .single();
  if (deviceError || !device) return NextResponse.json({ error: deviceError?.message ?? "Pairing failed" }, { status: 500 });

  const { data: source, error: sourceError } = await admin
    .from("sync_sources")
    .insert({ user_id: pairing.user_id, device_id: device.id, source_type: "das_trades_csv" })
    .select("id")
    .single();
  if (sourceError || !source) {
    await admin.from("sync_devices").delete().eq("id", device.id);
    return NextResponse.json({ error: sourceError?.message ?? "Source creation failed" }, { status: 500 });
  }

  const { data: claimed } = await admin
    .from("pairing_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", pairing.id)
    .is("used_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    await admin.from("sync_devices").delete().eq("id", device.id);
    return NextResponse.json({ error: "Pairing code was already used" }, { status: 409 });
  }

  return NextResponse.json({ deviceId: device.id, sourceId: source.id, token });
}

