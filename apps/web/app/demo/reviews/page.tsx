import Decimal from "decimal.js";
import Link from "next/link";
import { DEMO_TRADES } from "@/lib/demo-data";
import { formatDateTime, formatMoney } from "@/lib/format";

export default function DemoReviewsPage() {
  const reviewed = DEMO_TRADES.filter((trade) => trade.reviewStatus !== "unreviewed").length;
  const followedPlan = DEMO_TRADES.filter((trade) => trade.tags.includes("followed plan"));
  return <section className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">LEARNING LOOP · DEMO</p><h1>Review-jono</h1><p className="muted">Muistiinpanot ja tagit muuttavat yksittäiset treidit palautteeksi seuraavaa sessiota varten.</p></div><span className="count-pill">Read only</span></div>
    <div className="demo-readonly">Review-esimerkit ovat staattisia. Oikeassa sovelluksessa sama editori tallentaa muistiinpanot versionoituna Supabaseen.</div>
    <div className="review-summary"><article><span>Review-kattavuus</span><strong>{(reviewed / DEMO_TRADES.length * 100).toFixed(1)}%</strong><small>{reviewed} / {DEMO_TRADES.length} treidiä</small></article><article><span>Arvioimatta</span><strong>{DEMO_TRADES.length - reviewed}</strong><small>harjoittele review-rutiinia</small></article><article><span>Noudatin plania</span><strong>{followedPlan.length}</strong><small className="positive">{formatMoney(followedPlan.reduce((sum, trade) => sum + trade.netPnl, 0))}</small></article><article><span>Esimerkkitagi</span><strong>6</strong><small>setupit ja virheet</small></article></div>
    <div className="review-queue">{DEMO_TRADES.filter((trade) => trade.reviewStatus !== "unreviewed").slice(0, 12).map((trade) => { const net = new Decimal(trade.netPnl); return <Link className="review-row" href={`/demo/trades/${trade.id}`} key={trade.id}><div><strong>{trade.symbol}</strong><span className={`side ${trade.direction}`}>{trade.direction}</span><small>{formatDateTime(trade.openedAt)}</small></div><div className="review-row-tags">{trade.tags.map((tag) => <span className="tag-label" key={tag} style={{ borderColor: "#2e647c", color: "#8ea3af" }}>{tag}</span>)}</div><div><strong className={net.isNegative() ? "negative" : "positive"}>{formatMoney(trade.netPnl)}</strong><small>{trade.rating ? `${trade.rating}/5` : "Luonnos"}</small></div></Link>; })}</div>
  </section>;
}
