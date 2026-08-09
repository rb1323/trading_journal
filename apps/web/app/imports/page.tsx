import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("sync_snapshots").select("*").order("received_at", { ascending: false }).limit(200);
  return <section className="page-shell"><AutoRefresh /><div className="page-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h1>Importit</h1></div></div><div className="table-card"><table><thead><tr><th>Vastaanotettu</th><th>Tiedosto</th><th>Tila</th><th>Uudet</th><th>Duplikaatit</th><th>Virheet</th><th>Treidit</th><th>Avoimet</th></tr></thead><tbody>{(data ?? []).map((snapshot) => <tr key={snapshot.id}><td>{formatDateTime(snapshot.received_at)}</td><td>{snapshot.file_name}<small>{formatNumber(snapshot.file_size)} bytes</small></td><td><span className={`status ${snapshot.status}`}>{snapshot.status}</span></td><td>{snapshot.added_count}</td><td>{snapshot.duplicate_count}</td><td className={snapshot.error_count ? "negative" : ""}>{snapshot.error_count}</td><td>{snapshot.trade_count}</td><td>{snapshot.open_position_count}</td></tr>)}</tbody></table>{(data?.length ?? 0) === 0 && <div className="empty-state"><h3>Ei snapshotteja</h3><p>Jokainen muuttunut DAS-tiedosto muodostaa jäljitettävän importin.</p></div>}</div></section>;
}

