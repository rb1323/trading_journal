import { NextResponse } from "next/server";
import { parseBrokerCsv, BrokerCsvParseError } from "@trading-journal/trade-domain";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { sha256 } from "@/lib/crypto";
import { reconcileUserBrokerCosts } from "@/lib/broker-costs";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function canonicalJson(value: Record<string, string>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "CSV-tiedosto puuttuu." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Tiedosto ylittää 10 Mt rajan." }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = sha256(bytes);
  const admin = createSupabaseAdminClient();
  const { data: previous } = await admin.from("broker_imports").select("*").eq("user_id", user.id).eq("sha256", hash).maybeSingle();
  if (previous && ["succeeded", "needs_mapping"].includes(previous.status)) return NextResponse.json({ ...previous, idempotent: true });

  const importOperation = previous
    ? admin.from("broker_imports").update({
        file_name: file.name, file_size: file.size, status: "processing", row_count: 0,
        added_count: 0, duplicate_count: 0, error_count: 0, issues: [], processed_at: null
      }).eq("id", previous.id).select("id").single()
    : admin.from("broker_imports").insert({
        user_id: user.id, file_name: file.name, file_size: file.size, sha256: hash
      }).select("id").single();
  const { data: brokerImport, error: importError } = await importOperation;
  if (importError || !brokerImport) return NextResponse.json({ error: importError?.message ?? "Importin luonti epäonnistui." }, { status: 500 });

  try {
    const parsed = parseBrokerCsv(bytes.toString("utf8"));
    const keys = parsed.transactions.map((row) => row.stableKey);
    const existing = new Map<string, Record<string, string>>();
    for (let offset = 0; offset < keys.length; offset += 200) {
      const { data, error } = await admin.from("broker_transactions").select("stable_key,raw_payload").eq("user_id", user.id).in("stable_key", keys.slice(offset, offset + 200));
      if (error) throw error;
      for (const row of data ?? []) existing.set(row.stable_key, row.raw_payload);
    }
    const conflicts: Array<{ stableKey: string; message: string }> = [];
    const newRows = parsed.transactions.filter((row) => {
      const old = existing.get(row.stableKey);
      if (!old) return true;
      if (canonicalJson(old) !== canonicalJson(row.raw)) conflicts.push({ stableKey: row.stableKey, message: "Sama broker-transaction saapui eri sisällöllä." });
      return false;
    });
    if (newRows.length > 0) {
      const { error } = await admin.from("broker_transactions").insert(newRows.map((row) => ({
        user_id: user.id, first_import_id: brokerImport.id, stable_key: row.stableKey,
        account_number: row.accountNumber, transaction_id: row.transactionId, entry_type: row.entryType,
        description: row.description, trade_date: row.tradeDate, settlement_date: row.settlementDate,
        side: row.side, symbol: row.symbol, quantity: row.quantity, price: row.price,
        commission: row.commission, ecn_fee: row.ecnFee, exchange_fee: row.exchangeFee,
        regulatory_fee: row.regulatoryFee, locate_fee: row.locateFee, other_fees: row.otherFees,
        occ_fee: row.occFee, orf_fee: row.orfFee, taf_fee: row.tafFee, total_fees: row.totalFees,
        gross_amount: row.grossAmount, net_amount: row.netAmount, raw_payload: row.raw
      })));
      if (error) throw error;
    }

    const reconciliation = await reconcileUserBrokerCosts(admin, user.id);
    const conflictGroups = reconciliation.groups.filter((group) => group.status === "conflict");
    const issues = [...parsed.issues, ...conflicts, ...conflictGroups.map((group) => ({ group: group.key, message: group.message }))];
    const status = reconciliation.unmappedAccounts.length > 0 ? "needs_mapping" : issues.length > 0 ? "conflict" : "succeeded";
    const summary = {
      status,
      row_count: parsed.transactions.length,
      added_count: newRows.length,
      duplicate_count: parsed.transactions.length - newRows.length,
      error_count: issues.length,
      issues,
      processed_at: new Date().toISOString()
    };
    await admin.from("broker_imports").update(summary).eq("id", brokerImport.id);
    return NextResponse.json({ importId: brokerImport.id, ...summary, unmappedAccounts: reconciliation.unmappedAccounts });
  } catch (error) {
    const message = error instanceof BrokerCsvParseError || error instanceof Error ? error.message : "Tuntematon broker-importin virhe.";
    await admin.from("broker_imports").update({ status: "rejected", error_count: 1, issues: [{ message }], processed_at: new Date().toISOString() }).eq("id", brokerImport.id);
    return NextResponse.json({ error: message, importId: brokerImport.id }, { status: 422 });
  }
}
