import Decimal from "decimal.js";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  const { supabase } = await requireUser();
  const { data: trades } = await supabase.from("trades").select("*").eq("status", "closed").order("opened_at", { ascending: false }).limit(500);
  const gross = (trades ?? []).reduce((sum, trade) => sum.plus(String(trade.gross_pnl)), new Decimal(0));
  return (
    <section className="page-shell">
      <AutoRefresh />
      <div className="page-heading"><div><p className="eyebrow">LIVE TRADE LOG</p><h1>Treidit</h1></div><span className="live-pill">● Päivittyy 10 s välein</span></div>
      <div className="stats-row">
        <article><span>Suljetut treidit</span><strong>{trades?.length ?? 0}</strong></article>
        <article><span>Gross P&amp;L</span><strong className={gross.isNegative() ? "negative" : "positive"}>{formatMoney(gross.toString())}</strong></article>
        <article><span>Viimeisin sync</span><strong className="small">Live</strong></article>
      </div>
      <div className="table-card">
        <table><thead><tr><th>Aika (ET)</th><th>Symboli</th><th>Suunta</th><th>Määrä</th><th>Entry VWAP</th><th>Exit VWAP</th><th>Gross P&amp;L</th><th>Fillit</th></tr></thead>
          <tbody>{(trades ?? []).map((trade) => <tr key={trade.id}><td>{formatDateTime(trade.opened_at)}</td><td className="symbol">{trade.symbol}</td><td><span className={`side ${trade.direction}`}>{trade.direction}</span></td><td>{formatNumber(trade.quantity)}</td><td>{formatNumber(trade.entry_vwap, 4)}</td><td>{formatNumber(trade.exit_vwap, 4)}</td><td className={new Decimal(String(trade.gross_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.gross_pnl)}</td><td>{trade.fill_count}</td></tr>)}</tbody>
        </table>
        {(trades?.length ?? 0) === 0 && <div className="empty-state"><h3>Odotetaan ensimmäistä treidiä</h3><p>Yhdistä DAS Sync ja valitse export-hakemisto.</p></div>}
      </div>
    </section>
  );
}

