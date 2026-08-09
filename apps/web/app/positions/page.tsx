import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PositionsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("trades").select("*").eq("status", "open").order("opened_at", { ascending: false });
  return <section className="page-shell"><AutoRefresh /><div className="page-heading"><div><p className="eyebrow">INTRADAY</p><h1>Avoimet positiot</h1></div><span className="live-pill">● Live</span></div><div className="table-card"><table><thead><tr><th>Avattu (ET)</th><th>Symboli</th><th>Suunta</th><th>Avoin määrä</th><th>Entry VWAP</th><th>Realisoitu gross</th><th>Fillit</th></tr></thead><tbody>{(data ?? []).map((trade) => <tr key={trade.id}><td>{formatDateTime(trade.opened_at)}</td><td className="symbol">{trade.symbol}</td><td><span className={`side ${trade.direction}`}>{trade.direction}</span></td><td>{formatNumber(trade.open_quantity)}</td><td>{formatNumber(trade.entry_vwap, 4)}</td><td>{formatMoney(trade.gross_pnl)}</td><td>{trade.fill_count}</td></tr>)}</tbody></table>{(data?.length ?? 0) === 0 && <div className="empty-state"><h3>Ei avoimia positioita</h3><p>Zero-to-zero-treidit siirtyvät automaattisesti treidilokiin.</p></div>}</div></section>;
}

