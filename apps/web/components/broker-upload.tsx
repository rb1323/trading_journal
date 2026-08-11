"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BrokerUpload() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(formData: FormData) {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/broker-imports", { method: "POST", body: formData });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) setMessage(body.error ?? "Broker-importti epäonnistui.");
    else {
      setMessage(body.status === "succeeded" ? "Broker-tiedosto täsmäytettiin onnistuneesti." : `Importin tila: ${body.status}`);
      router.refresh();
    }
  }
  return <form className="upload-card" action={upload}><div><p className="eyebrow">BROKER COSTS</p><h2>Transactions.csv</h2><p className="muted">Lataa brokerin seuraavan päivän CSV. Sama tiedosto voidaan lähettää turvallisesti uudelleen.</p></div><div className="upload-controls"><input name="file" type="file" accept=".csv,text/csv" required disabled={busy} /><button className="primary" type="submit" disabled={busy}>{busy ? "Tuodaan…" : "Tuo kulut"}</button>{message && <span className="form-message">{message}</span>}</div></form>;
}
