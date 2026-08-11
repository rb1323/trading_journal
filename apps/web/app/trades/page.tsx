import Decimal from "decimal.js";
import Link from "next/link";
import { DateTime } from "luxon";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TradesPage({ searchParams }: { searchParams: Promise<{ page?: string; date?: string; symbol?: string; direction?: string; account?: string }> }) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 100;
  const from = (page - 1) * pageSize;
  let query = supabase.from("trades").select("*", { count: "exact" }).eq("status", "closed");
  if (params.symbol) query = query.eq("symbol", params.symbol.toUpperCase());
  if (params.direction) query = query.eq("direction", params.direction);
  if (params.account) query = query.eq("source_account", params.account);
  if (params.date) {
    const day = DateTime.fromISO(params.date, { zone: "America/New_York" });
    query = query.gte("opened_at", day.startOf("day").toUTC().toISO()!).lte("opened_at", day.endOf("day").toUTC().toISO()!);
  }
  const { data: trades, count } = await query.order("opened_at", { ascending: false }).range(from, from + pageSize - 1);
  const { data: accounts } = await supabase.from("broker_accounts").select("source_account,display_name").order("source_account");
  const gross = (trades ?? []).reduce((sum, trade) => sum.plus(String(trade.gross_pnl)), new Decimal(0));
  const net = (trades ?? []).reduce((sum, trade) => sum.plus(String(trade.net_pnl ?? trade.gross_pnl)), new Decimal(0));
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const pageHref = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (key !== "page" && value) query.set(key, value);
    query.set("page", String(target));
    return `/trades?${query.toString()}`;
  };
  return <section className="page-shell"><AutoRefresh />
    <div className="page-heading"><div><p className="eyebrow">LIVE TRADE LOG</p><h1>Treidit</h1></div><span className="live-pill">● Päivittyy 10 s välein</span></div>
    <form className="filter-bar"><input type="date" name="date" defaultValue={params.date ?? ""} /><select name="account" defaultValue={params.account ?? ""}><option value="">Kaikki tilit</option>{(accounts ?? []).map((account) => <option key={account.source_account} value={account.source_account}>{account.display_name || account.source_account}</option>)}</select><input name="symbol" placeholder="Symboli" defaultValue={params.symbol ?? ""} /><select name="direction" defaultValue={params.direction ?? ""}><option value="">Long + short</option><option value="long">Long</option><option value="short">Short</option></select><button className="primary">Suodata</button></form>
    <div className="stats-row"><article><span>Suljetut treidit</span><strong>{count ?? 0}</strong></article><article><span>Gross P&amp;L tällä sivulla</span><strong className={gross.isNegative() ? "negative" : "positive"}>{formatMoney(gross.toString())}</strong></article><article><span>Net P&amp;L tällä sivulla</span><strong className={net.isNegative() ? "negative" : "positive"}>{formatMoney(net.toString())}</strong></article></div>
    <div className="table-card"><table><thead><tr><th>Aika (ET)</th><th>Symboli</th><th>Suunta</th><th>Määrä</th><th>Entry VWAP</th><th>Exit VWAP</th><th>Gross</th><th>Kulut</th><th>Net</th><th>Status</th></tr></thead><tbody>{(trades ?? []).map((trade) => <tr key={trade.id} className="clickable-row"><td><Link href={`/trades/${trade.id}`}>{formatDateTime(trade.opened_at)}</Link></td><td className="symbol"><Link href={`/trades/${trade.id}`}>{trade.symbol}</Link></td><td><span className={`side ${trade.direction}`}>{trade.direction}</span></td><td>{formatNumber(trade.quantity)}</td><td>{formatNumber(trade.entry_vwap, 4)}</td><td>{formatNumber(trade.exit_vwap, 4)}</td><td className={new Decimal(String(trade.gross_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.gross_pnl)}</td><td>{formatMoney(trade.allocated_fees ?? 0)}</td><td className={new Decimal(String(trade.net_pnl ?? trade.gross_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.net_pnl ?? trade.gross_pnl)}</td><td><span className={`status ${trade.cost_status === "reconciled" ? "succeeded" : trade.cost_status === "conflict" ? "conflict" : "processing"}`}>{trade.cost_status}</span></td></tr>)}</tbody></table>{(trades?.length ?? 0) === 0 && <div className="empty-state"><h3>Odotetaan ensimmäistä treidiä</h3><p>Yhdistä DAS Sync ja valitse export-hakemisto.</p></div>}</div>
    {pages > 1 && <div className="pagination"><Link className={`ghost ${page <= 1 ? "disabled" : ""}`} href={pageHref(Math.max(1, page - 1))}>Edellinen</Link><span>Sivu {page} / {pages}</span><Link className={`ghost ${page >= pages ? "disabled" : ""}`} href={pageHref(Math.min(pages, page + 1))}>Seuraava</Link></div>}
  </section>;
}
