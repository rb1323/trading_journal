import Decimal from "decimal.js";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requireUser();
  const params = await searchParams;
  const selected = ["unreviewed", "draft", "reviewed", "all"].includes(params.status ?? "") ? params.status! : "unreviewed";
  const [{ data: trades }, { data: reviews }, { data: assignments }, { data: tags }] = await Promise.all([
    supabase.from("trades").select("id,trade_key,symbol,direction,opened_at,net_pnl,gross_pnl").eq("status", "closed").order("opened_at", { ascending: false }).limit(5000),
    supabase.from("trade_reviews").select("id,trade_key,status,rating,followed_plan,notes").limit(5000),
    supabase.from("trade_review_tags").select("review_id,tag_id").limit(20000),
    supabase.from("journal_tags").select("id,name,category,color").limit(1000)
  ]);
  const reviewByTrade = new Map((reviews ?? []).map((review) => [review.trade_key, review]));
  const tagsById = new Map((tags ?? []).map((tag) => [tag.id, tag]));
  const tagIdsByReview = new Map<string, string[]>();
  for (const assignment of assignments ?? []) tagIdsByReview.set(assignment.review_id, [...(tagIdsByReview.get(assignment.review_id) ?? []), assignment.tag_id]);
  const rows = (trades ?? []).filter((trade) => {
    const review = reviewByTrade.get(trade.trade_key);
    if (selected === "all") return true;
    if (selected === "unreviewed") return !review || review.status === "unreviewed";
    return review?.status === selected;
  }).slice(0, 200);
  const counts = { unreviewed: 0, draft: 0, reviewed: 0 };
  for (const trade of trades ?? []) {
    const status = reviewByTrade.get(trade.trade_key)?.status ?? "unreviewed";
    counts[status as keyof typeof counts] += 1;
  }

  return <section className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">REVIEW WORKFLOW</p><h1>Review-jono</h1><p className="muted">Käy treidit läpi järjestyksessä ja muuta havainnot toistettaviksi toimintatavoiksi.</p></div><span className="count-pill">{counts.unreviewed} arvioimatta</span></div>
    <div className="review-tabs">{[["unreviewed", `Arvioimatta ${counts.unreviewed}`], ["draft", `Luonnokset ${counts.draft}`], ["reviewed", `Arvioidut ${counts.reviewed}`], ["all", `Kaikki ${(trades ?? []).length}`]].map(([value, label]) => <Link className={selected === value ? "active" : ""} key={value} href={`/review?status=${value}`}>{label}</Link>)}</div>
    <div className="review-queue">{rows.map((trade) => { const review = reviewByTrade.get(trade.trade_key); const net = new Decimal(String(trade.net_pnl ?? trade.gross_pnl)); const reviewTags = review ? (tagIdsByReview.get(review.id) ?? []).map((id) => tagsById.get(id)).filter(Boolean) : []; return <Link className="review-row" href={`/trades/${trade.id}`} key={trade.id}><div><strong>{trade.symbol}</strong><span className={`side ${trade.direction}`}>{trade.direction}</span><small>{formatDateTime(trade.opened_at)}</small></div><div className="review-row-tags">{reviewTags.slice(0, 4).map((tag) => <span className="tag-label" key={tag!.id} style={{ borderColor: tag!.color, color: tag!.color }}>{tag!.name}</span>)}</div><div><strong className={net.isNegative() ? "negative" : "positive"}>{formatMoney(net.toString())}</strong><small>{review?.rating ? `${review.rating}/5` : review?.status === "draft" ? "Luonnos" : review?.status === "reviewed" ? "Arvioitu" : "Arvioimatta"}</small></div></Link>; })}</div>
    {rows.length === 0 && <div className="empty-panel"><p>Tässä jonossa ei ole treidejä.</p></div>}
  </section>;
}
