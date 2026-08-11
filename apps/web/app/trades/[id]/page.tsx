import Decimal from "decimal.js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TradeChart } from "@/components/trade-chart";
import { TradeReviewEditor } from "@/components/trade-review-editor";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: trade } = await supabase.from("trades").select("*").eq("id", id).maybeSingle();
  if (!trade) notFound();
  const { data: allocations } = await supabase.from("trade_fill_allocations").select("fill_id,role,quantity,price").eq("trade_id", id);
  const fillIds = (allocations ?? []).map((row) => row.fill_id);
  const { data: fills } = fillIds.length ? await supabase.from("execution_fills").select("id,executed_at,side,source_trade_id,source_order_id").in("id", fillIds).order("executed_at") : { data: [] };
  const [{ data: review }, { data: tags }, { data: previous }, { data: next }] = await Promise.all([
    supabase.from("trade_reviews").select("id,notes,rating,followed_plan,status,version").eq("trade_key", trade.trade_key).maybeSingle(),
    supabase.from("journal_tags").select("id,name,category,color").order("category").order("name"),
    supabase.from("trades").select("id,symbol").eq("status", "closed").lt("opened_at", trade.opened_at).order("opened_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("trades").select("id,symbol").eq("status", "closed").gt("opened_at", trade.opened_at).order("opened_at").limit(1).maybeSingle()
  ]);
  const { data: reviewTags } = review ? await supabase.from("trade_review_tags").select("tag_id").eq("review_id", review.id) : { data: [] };
  const fillById = new Map((fills ?? []).map((fill) => [fill.id, fill]));
  const fees = new Decimal(String(trade.allocated_fees ?? 0));
  return <section className="page-shell">
    <div className="trade-title"><div><p className="eyebrow">TRADE REVIEW</p><h1>{trade.symbol} <span className={`side ${trade.direction}`}>{trade.direction}</span></h1><p className="muted">{formatDateTime(trade.opened_at)} – {formatDateTime(trade.closed_at)}</p></div><span className={`status ${trade.cost_status === "reconciled" ? "succeeded" : trade.cost_status === "conflict" ? "conflict" : "processing"}`}>{trade.cost_status}</span></div>
    <div className="trade-stats">
      <article><span>Määrä</span><strong>{formatNumber(trade.quantity)}</strong></article>
      <article><span>Entry VWAP</span><strong>{formatNumber(trade.entry_vwap, 4)}</strong></article>
      <article><span>Exit VWAP</span><strong>{formatNumber(trade.exit_vwap, 4)}</strong></article>
      <article><span>Gross P&amp;L</span><strong className={new Decimal(String(trade.gross_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.gross_pnl)}</strong></article>
      <article><span>Kulut</span><strong>{formatMoney(fees.toString())}</strong></article>
      <article><span>Net P&amp;L</span><strong className={new Decimal(String(trade.net_pnl)).isNegative() ? "negative" : "positive"}>{formatMoney(trade.net_pnl)}</strong></article>
    </div>
    <TradeChart tradeId={id} entryVwap={String(trade.entry_vwap)} exitVwap={trade.exit_vwap ? String(trade.exit_vwap) : null} />
    <TradeReviewEditor tradeId={id} initialReview={{ notes: review?.notes ?? "", rating: review?.rating ?? null, followedPlan: review?.followed_plan ?? null, status: review?.status ?? "unreviewed", version: review?.version ?? 0, tagIds: (reviewTags ?? []).map((row) => row.tag_id) }} initialTags={(tags ?? []).map((tag) => ({ ...tag, category: tag.category as "setup" | "mistake" | "emotion" | "custom" }))} />
    <nav className="trade-navigation"><span>{previous ? <Link className="ghost" href={`/trades/${previous.id}`}>← {previous.symbol}</Link> : null}</span><Link className="ghost" href="/review">Review-jono</Link><span>{next ? <Link className="ghost" href={`/trades/${next.id}`}>{next.symbol} →</Link> : null}</span></nav>
    <div className="section-heading"><h2>Executionit</h2><span className="count-pill">{allocations?.length ?? 0} allokaatiota</span></div>
    <div className="table-card"><table><thead><tr><th>Aika (ET)</th><th>Rooli</th><th>Side</th><th>Määrä</th><th>Hinta</th><th>Trade ID</th><th>Order ID</th></tr></thead><tbody>{(allocations ?? []).map((allocation, index) => { const fill = fillById.get(allocation.fill_id); return <tr key={`${allocation.fill_id}-${allocation.role}-${index}`}><td>{formatDateTime(fill?.executed_at)}</td><td>{allocation.role}</td><td><span className={`execution-side ${fill?.side === "B" ? "buy" : "sell"}`}>{fill?.side}</span></td><td>{formatNumber(allocation.quantity)}</td><td>{formatNumber(allocation.price, 4)}</td><td className="mono">{fill?.source_trade_id}</td><td className="mono">{fill?.source_order_id || "—"}</td></tr>; })}</tbody></table></div>
  </section>;
}
