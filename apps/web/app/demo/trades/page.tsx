import Decimal from "decimal.js";
import Link from "next/link";
import { DEMO_TRADES, demoSummary } from "@/lib/demo-data";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export default function DemoTradesPage() {
  const summary = demoSummary();
  return <section className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">READ-ONLY EXECUTION LOG</p><h1>Treidit</h1><p className="muted">Jokainen rivi on rekonstruoitu zero-to-zero-treidi synteettisestä DAS-datasta.</p></div><span className="count-pill">{summary.trades} treidiä</span></div>
    <div className="demo-readonly">Demo ei tallenna review-muutoksia. Avaa treidi nähdäksesi chartin, fillit ja esimerkkimuistiinpanon.</div>
    <div className="stats-row"><article><span>Suljetut treidit</span><strong>{summary.trades}</strong></article><article><span>Gross P&amp;L</span><strong className={summary.gross >= 0 ? "positive" : "negative"}>{formatMoney(summary.gross)}</strong></article><article><span>Net P&amp;L</span><strong className={summary.net >= 0 ? "positive" : "negative"}>{formatMoney(summary.net)}</strong></article></div>
    <div className="demo-table-card"><table><thead><tr><th>Aika (ET)</th><th>Symboli</th><th>Suunta</th><th>Määrä</th><th>Entry VWAP</th><th>Exit VWAP</th><th>Gross</th><th>Kulut</th><th>Net</th><th>Review</th></tr></thead><tbody>{DEMO_TRADES.map((trade) => <tr key={trade.id} className="clickable-row"><td><Link href={`/demo/trades/${trade.id}`}>{formatDateTime(trade.openedAt)}</Link></td><td className="symbol"><Link href={`/demo/trades/${trade.id}`}>{trade.symbol}</Link></td><td><span className={`side ${trade.direction}`}>{trade.direction}</span></td><td>{formatNumber(trade.quantity)}</td><td>{formatNumber(trade.entryVwap, 4)}</td><td>{formatNumber(trade.exitVwap, 4)}</td><td className={trade.grossPnl < 0 ? "negative" : "positive"}>{formatMoney(trade.grossPnl)}</td><td>{formatMoney(trade.fees)}</td><td className={new Decimal(trade.netPnl).isNegative() ? "negative" : "positive"}>{formatMoney(trade.netPnl)}</td><td><span className={`review-status ${trade.reviewStatus}`}>{trade.reviewStatus === "reviewed" ? `Arvioitu · ${trade.rating}/5` : trade.reviewStatus === "draft" ? "Luonnos" : "Arvioimatta"}</span></td></tr>)}</tbody></table></div>
  </section>;
}
