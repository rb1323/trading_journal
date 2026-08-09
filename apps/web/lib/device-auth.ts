import { createSupabaseAdminClient } from "./supabase/admin";
import { sha256 } from "./crypto";

export async function authenticateDevice(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  if (!token) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("sync_devices")
    .select("id,user_id,revoked_at")
    .eq("token_hash", sha256(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;
  return { admin, device: data };
}

