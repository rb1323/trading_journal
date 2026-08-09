"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RevokeDevice({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function revoke() {
    setBusy(true);
    await fetch(`/api/devices/${id}`, { method: "DELETE" });
    router.refresh();
    setBusy(false);
  }
  return <button className="ghost danger" onClick={revoke} disabled={busy}>{busy ? "Poistetaan…" : "Katkaise yhteys"}</button>;
}

