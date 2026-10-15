import Decimal from "decimal.js";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoTradeChart } from "@/components/demo-trade-chart";
import { demoChartData, demoTradeById, DEMO_TRADES } from "@/lib/demo-data";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export function generateStaticParams() {
  return DEMO_TRADES.map((trade) => ({ id: trade.id }));
}

export default async function DemoTradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trade = demoTradeById(id);
  if (!trade) notFound();
  const chart = demoChartData(trade);
  const index = DEMO_TRADES.findIndex((candidate) => candidate.id === trade.id);
  const previous = DEMO_TRADES[index - 1];
  const next = DEMO_TRADES[index + 1];
  return <section className="page-shell">
    <div className="trade-title"><div><p className="eyebrow">TRADE REVIEW · DEMO</p><h1>{trade.symbol} <span className={`side ${trade.direction}`}>{trade.direction}</span></h1><p className="muted">{formatDateTime(trade.openedAt)} – {formatDateTime(trade.closedAt)}</p></div><span className="status succeeded">read only</span></div>
    <div className="trade-stats"><article><span>Määrä</span><strong>{formatNumber(trade.quantity)}</strong></article><article><span>Entry VWAP</span><strong>{formatNumber(trade.entryVwap, 4)}</strong></article><article><span>Exit VWAP</span><strong>{formatNumber(trade.exitVwap, 4)}</strong></article><article><span>Gross P&amp;L</span><strong className={trade.grossPnl < 0 ? "negative" : "positive"}>{formatMoney(trade.grossPnl)}</strong></article><article><span>Kulut</span><strong>{formatMoney(trade.fees)}</strong></article><article><span>Net P&amp;L</span><strong className={new Decimal(trade.netPnl).isNegative() ? "negative" : "positive"}>{formatMoney(trade.netPnl)}</strong></article></div>
    <DemoTradeChart data={chart} entryVwap={trade.entryVwap} exitVwap={trade.exitVwap} />
    <div className="review-card"><div className="review-heading"><div><h2>Journal review</h2><p className="muted">Esimerkkimuistiinpano · ei tallenneta</p></div><span className={`review-status ${trade.reviewStatus}`}>{trade.reviewStatus}</span></div><p className="demo-review-note">{trade.notes || "Tälle treidille ei ole vielä muistiinpanoa."}</p><div className="tag-groups"><div className="tag-group"><strong>Tags</strong><div>{trade.tags.length ? trade.tags.map((tag) => <span className="tag-pill selected" key={tag}>{tag}</span>) : <span className="muted">Ei tageja</span>}</div></div></div></div>
    <nav className="trade-navigation"><span>{previous ? <Link className="ghost" href={`/demo/trades/${previous.id}`}>← {previous.symbol}</Link> : null}</span><Link className="ghost" href="/demo/trades">Kaikki demotreidit</Link><span>{next ? <Link className="ghost" href={`/demo/trades/${next.id}`}>{next.symbol} →</Link> : null}</span></nav>
    <div className="section-heading"><h2>Executionit</h2><span className="count-pill">{trade.fills.length} filliä</span></div>
    <div className="demo-table-card"><table><thead><tr><th>Aika (ET)</th><th>Rooli</th><th>Side</th><th>Määrä</th><th>Hinta</th><th>Trade ID</th><th>Order ID</th></tr></thead><tbody>{trade.fills.map((fill) => <tr key={fill.id}><td>{formatDateTime(fill.executedAt)}</td><td>{fill.role}</td><td><span className={`execution-side ${fill.side === "B" ? "buy" : "sell"}`}>{fill.side}</span></td><td>{formatNumber(fill.quantity)}</td><td>{formatNumber(fill.price, 4)}</td><td className="mono">{fill.sourceTradeId}</td><td className="mono">{fill.sourceOrderId}</td></tr>)}</tbody></table></div>
  </section>;
}
