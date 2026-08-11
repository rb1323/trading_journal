import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { reconcileUserBrokerCosts } from "@/lib/broker-costs";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { externalAccountNumber?: string; brokerAccountId?: string } | null;
  if (!body?.externalAccountNumber || !body.brokerAccountId) return NextResponse.json({ error: "Tilikartoitus puuttuu." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data: account } = await admin.from("broker_accounts").select("id").eq("id", body.brokerAccountId).eq("user_id", user.id).maybeSingle();
  if (!account) return NextResponse.json({ error: "Tuntematon DAS-tili." }, { status: 404 });
  const { error } = await admin.from("broker_account_mappings").upsert({ user_id: user.id, external_account_number: body.externalAccountNumber, broker_account_id: account.id }, { onConflict: "user_id,external_account_number" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const reconciliation = await reconcileUserBrokerCosts(admin, user.id);
  const status = reconciliation.groups.some((group) => group.status === "conflict") ? "conflict" : "succeeded";
  await admin.from("broker_imports").update({ status, processed_at: new Date().toISOString() }).eq("user_id", user.id).eq("status", "needs_mapping");
  return NextResponse.json({ status, reconciliation });
}
