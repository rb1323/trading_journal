"use client";

import { useState } from "react";

export function PairDevice() {
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function createCode() {
    setBusy(true);
    setError("");
    const response = await fetch("/api/device-pairings", { method: "POST" });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Koodin luonti epäonnistui.");
    else setPairing(body);
    setBusy(false);
  }

  return (
    <div className="pairing-card">
      <div>
        <p className="eyebrow">UUSI LAITE</p>
        <h2>Yhdistä DAS Sync</h2>
        <p className="muted">Syötä kertakäyttökoodi Windows-agenttiin. Koodi on voimassa 10 minuuttia.</p>
      </div>
      {pairing ? (
        <div className="pairing-code" aria-label={`Parituskoodi ${pairing.code}`}>{pairing.code}</div>
      ) : (
        <button className="primary" onClick={createCode} disabled={busy}>{busy ? "Luodaan…" : "Luo parituskoodi"}</button>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

