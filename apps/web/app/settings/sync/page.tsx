import { AutoRefresh } from "@/components/auto-refresh";
import { PairDevice } from "@/components/pair-device";
import { RevokeDevice } from "@/components/revoke-device";
import { requireUser } from "@/lib/auth";
import { formatDateTime, isFreshHeartbeat } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SyncSettingsPage() {
  const { supabase } = await requireUser();
  const { data: devices } = await supabase.from("sync_devices").select("id,name,version,last_seen_at,local_state,revoked_at,created_at").order("created_at", { ascending: false });
  const active = (devices ?? []).filter((device) => !device.revoked_at);
  return <section className="page-shell"><AutoRefresh /><div className="page-heading"><div><p className="eyebrow">AUTOMATION</p><h1>DAS Live Sync</h1><p className="muted">Windows-agentti seuraa export-hakemistoa ja lähettää vain muuttuneet snapshotit.</p></div></div><PairDevice /><div className="device-grid">{active.map((device) => { const online = isFreshHeartbeat(device.last_seen_at); const state = device.local_state as Record<string, unknown> | null; return <article className="device-card" key={device.id}><div className="device-head"><div><span className={`connection-dot ${online ? "online" : "offline"}`} /> <strong>{device.name}</strong></div><span className="mono">v{device.version}</span></div><dl><div><dt>Tila</dt><dd>{online ? "Online" : "Offline"}</dd></div><div><dt>Viimeksi nähty</dt><dd>{formatDateTime(device.last_seen_at)}</dd></div><div><dt>Export-hakemisto</dt><dd>{String(state?.exportFolder ?? "Ei raportoitu")}</dd></div><div><dt>Jonossa</dt><dd>{String(state?.pendingUploads ?? 0)}</dd></div></dl><RevokeDevice id={device.id} /></article>; })}</div>{active.length === 0 && <div className="empty-panel"><p>Yhtään aktiivista DAS-laitetta ei ole vielä yhdistetty.</p></div>}</section>;
}
