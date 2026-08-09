import { NextResponse } from "next/server";
import { generatePairingCode, sha256 } from "@/lib/crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await supabase.from("pairing_codes").delete().eq("user_id", user.id).is("used_at", null);
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error } = await supabase.from("pairing_codes").insert({
    user_id: user.id,
    code_hash: sha256(code),
    expires_at: expiresAt
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code, expiresAt });
}

