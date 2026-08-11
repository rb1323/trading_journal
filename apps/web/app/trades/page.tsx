import Decimal from "decimal.js";
import Link from "next/link";
import { DateTime } from "luxon";
import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

type TradeParams = { page?: string; date?: string; symbol?: string; direction?: string; account?: string; review?: string; tag?: string; followedPlan?: string; rating?: string; q?: string };

export default async function TradesPage({ searchParams }: { searchParams: Promise<TradeParams> }) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const pageSize = 100;
  let query = supabase.from("trades").select("*").eq("status", "closed");
  if (params.symbol) query = query.eq("symbol", params.symbol.toUpperCase());
  if (params.direction) query = query.eq("direction", params.direction);
  if (params.account) query = query.eq("source_account", params.account);
  if (params.date) {
    const day = DateTime.fromISO(params.date, { zone: "America/New_York" });
    query = query.gte("opened_at", day.startOf("day").toUTC().toISO()!).lte("opened_at", day.endOf("day").toUTC().toISO()!);
  }
  const [{ data: allTrades }, { data: accounts }, { data: reviews }, { data: tags }, { data: assignments }] = await Promise.all([
    query.order("opened_at", { ascending: false }).limit(50_000),
    supabase.from("broker_accounts").select("source_account,display_name").order("source_account"),
    supabase.from("trade_reviews").select("id,trade_key,status,rating,followed_plan,notes").limit(50_000),
    supabase.from("journal_tags").select("id,name,category,color").order("category").order("name").limit(2000),
    supabase.from("trade_review_tags").select("review_id,tag_id").limit(100_000)
  ]);
  const reviewByTrade = new Map((reviews ?? []).map((review) => [review.trade_key, review]));
  const tagIdsByReview = new Map<string, string[]>();
  for (const assignment of assignments ?? []) tagIdsByReview.set(assignment.review_id, [...(tagIdsByReview.get(assignment.review_id) ?? []), assignment.tag_id]);
  const normalizedSearch = params.q?.trim().toLocaleLowerCase("fi-FI") ?? "";
  const filtered = (allTrades ?? []).filter((trade) => {
    const review = reviewByTrade.get(trade.trade_key);
    if (params.review === "unreviewed" && review && review.status !== "unreviewed") return false;
    if (params.review && params.review !== "all" && params.review !== "unreviewed" && review?.status !== params.review) return false;
    if (params.tag && (!review || !(tagIdsByReview.get(review.id) ?? []).includes(params.tag))) return false;
    if (params.followedPlan === "yes" && review?.followed_plan !== true) return false;
    if (params.followedPlan === "no" && review?.followed_plan !== false) return false;
    if (params.rating && review?.rating !== Number(params.rating)) return false;
    if (normalizedSearch && !trade.symbol.toLocaleLowerCase("fi-FI").includes(normalizedSearch) && !review?.notes.toLocaleLowerCase("fi-FI").includes(normalizedSearch)) return false;
    return true;
  });
  const count = filtered.length;
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const trades = filtered.slice((page - 1) * pageSize, page * pageSize);
  const gross = trades.reduce((sum, trade) => sum.plus(String(trade.gross_pnl)), new Decimal(0));
  const net = trades.reduce((sum, trade) => sum.plus(String(trade.net_pnl ?? trade.gross_pnl)), new Decimal(0));
  const pageHref = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (key !== "page" && value) search.set(key, value);
    search.set("page", String(target));
    return `/trades?${search.toString()}`;
  };

  return <section className="page-shell"><AutoRefresh />
    <div className="page-heading"><div><p className="eyebrow">LIVE TRADE LOG</p><h1>Treidit</h1></div><div className="heading-actions"><Link className="ghost" href="/review">Avaa review-jono</Link><span className="live-pill">● Päivittyy 10 s välein</span></div></div>
    <form className="filter-bar trade-filters"><input type="date" name="date" defaultValue={params.date ?? ""} /><select name="account" defaultValue={params.account ?? ""}><option value="">Kaikki tilit</option>{(accounts ?? []).map((account) => <option key={account.source_account} value={account.source_account}>{account.display_name || account.source_account}</option>)}</select><input name="symbol" placeholder="Symboli" defaultValue={params.symbol ?? ""} /><select name="direction" defaultValue={params.direction ?? ""}><option value="">Long + short</option><option value="long">Long</option><option value="short">Short</option></select><select name="review" defaultValue={params.review ?? "all"}><option value="all">Kaikki reviewt</option><option value="unreviewed">Arvioimatta</option><option value="draft">Luonnokset</option><option value="reviewed">Arvioidut</option></select><select name="tag" defaultValue={params.tag ?? ""}><option value="">Kaikki tagit</option>{(tags ?? []).map((tag) => <option key={tag.id} value={tag.id}>{tag.category}: {tag.name}</option>)}</select><select name="followedPlan" defaultValue={params.followedPlan ?? ""}><option value="">Plan: kaikki</option><option value="yes">Noudatin plania</option><option value="no">En noudattanut</option></select><select name="rating" defaultValue={params.rating ?? ""}><option value="">Kaikki arvosanat</option>{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating}/5</option>)}</select><input name="q" placeholder="Hae muistiinpanoista" defaultValue={params.q ?? ""} /><button className="primary">Suodata</button></form>
    <div className="stats-row"><article><span>Suljetut treidit</span><strong>{count}</strong></article><article><span>Gross P&amp;L tällä sivulla</span><strong className={gross.isNegative() ? "negative" : "positive"}>{formatMoney(gross.toString())}</strong></article><article><span>Net P&amp;L tällä sivulla</span><strong className={net.isNegative() ? "negative" : "positive"}>{formatMoney(net.toString())}</strong></article></div>
    <div className="table-card"><table><thead><tr><th>Aika (ET)</th><th>Symboli</th><th>Suunta</th><th>Määrä</th><th>Entry VWAP</th><th>Exit VWAP</th><th>Gross</th><th>Kulut</th><th>Net</th><th>Journal</th></tr></thead><tbody>{trades.map((trade) => { const review = reviewByTrade.get(trade.trade_key); return <tr key={trade.id} className="clickable-row"><td><Link href={`/trades/${trade.id}`}>{formatDateTime(trade.opened_at)}</Link></td><td className="symbol"><Link href={`/trades/${trade.id}`}>{trade.symbol}</Link></td><td><span className={`side ${trade.direction}`}>{trade.direction}</span></td><td>{formatNumber(trade.quantity)}</td><td>{formatNumber(trade.entry_vwap, 4)}</td><td>{formatNumber(trade.exit_vwap, 4)}</td><td className={new Decimal(String(trade.gross_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.gross_pnl)}</td><td>{formatMoney(trade.allocated_fees ?? 0)}</td><td className={new Decimal(String(trade.net_pnl ?? trade.gross_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.net_pnl ?? trade.gross_pnl)}</td><td><span className={`review-status ${review?.status ?? "unreviewed"}`}>{review?.status === "reviewed" ? `Arvioitu${review.rating ? ` · ${review.rating}/5` : ""}` : review?.status === "draft" ? "Luonnos" : "Arvioimatta"}</span></td></tr>; })}</tbody></table>{trades.length === 0 && <div className="empty-state"><h3>Ei hakua vastaavia treidejä</h3><p>Muuta suodattimia tai odota seuraavaa DAS-snapshotia.</p></div>}</div>
    {pages > 1 && <div className="pagination"><Link className={`ghost ${page <= 1 ? "disabled" : ""}`} href={pageHref(Math.max(1, page - 1))}>Edellinen</Link><span>Sivu {page} / {pages}</span><Link className={`ghost ${page >= pages ? "disabled" : ""}`} href={pageHref(Math.min(pages, page + 1))}>Seuraava</Link></div>}
  </section>;
}
