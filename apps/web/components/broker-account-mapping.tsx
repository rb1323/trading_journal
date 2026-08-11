"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BrokerAccountMapping({ externalAccount, accounts }: { externalAccount: string; accounts: Array<{ id: string; source_account: string; display_name: string | null }> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(formData: FormData) {
    setBusy(true);
    setError("");
    const response = await fetch("/api/broker-account-mappings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalAccountNumber: externalAccount, brokerAccountId: formData.get("brokerAccountId") }) });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) setError(body.error ?? "Tilikartoitus epäonnistui.");
    else router.refresh();
  }
  return <form className="mapping-row" action={save}><span className="mono">{externalAccount}</span><span>→</span><select name="brokerAccountId" required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name || account.source_account}</option>)}</select><button className="ghost" disabled={busy}>{busy ? "Tallennetaan…" : "Yhdistä"}</button>{error && <span className="error">{error}</span>}</form>;
}
