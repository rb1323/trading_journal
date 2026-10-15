import Link from "next/link";
import Decimal from "decimal.js";
import { DateTime } from "luxon";
import { PerformanceCharts } from "@/components/performance-charts";
import { TradeAnalytics } from "@/components/trade-analytics";
import { demoAnalytics, demoDailyPerformance, demoSummary } from "@/lib/demo-data";
import { formatMoney, formatNumber } from "@/lib/format";

export default function DemoDashboardPage() {
  const summary = demoSummary();
  const drawdowns = demoDailyPerformance();
  const analytics = demoAnalytics();
  const first = drawdowns.daily[0]?.date;
  const last = drawdowns.daily.at(-1)?.date;
  return <section className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">PERFORMANCE · DEMO</p><h1>Dashboard</h1><p className="muted">{first} – {last} · America/New_York</p></div><span className="status succeeded">synthetic</span></div>
    <div className="demo-readonly">Tämä näkymä on read-only. Tuotannon dashboard käyttää samaa laskentamallia, mutta kirjautuneen käyttäjän omasta Supabase-datasta.</div>
    <div className="demo-kpi-grid">
      <article><span>Treidit</span><strong>{summary.trades}</strong></article>
      <article><span>Gross P&amp;L</span><strong className={summary.gross >= 0 ? "positive" : "negative"}>{formatMoney(summary.gross)}</strong></article>
      <article><span>Net P&amp;L</span><strong className={summary.net >= 0 ? "positive" : "negative"}>{formatMoney(summary.net)}</strong></article>
      <article><span>Kulut</span><strong>{formatMoney(summary.fees)}</strong></article>
      <article><span>Win rate</span><strong>{(summary.winRate * 100).toFixed(1)}%</strong></article>
      <article><span>Avg trade</span><strong>{formatMoney(summary.average)}</strong></article>
      <article><span>Avg winner</span><strong className="positive">{formatMoney(summary.averageWinner)}</strong></article>
      <article><span>Avg loser</span><strong className="negative">{formatMoney(summary.averageLoser)}</strong></article>
      <article><span>Profit factor</span><strong>{summary.profitFactor.toFixed(2)}</strong></article>
      <article><span>Total shares</span><strong>{formatNumber(38_250)}</strong></article>
    </div>
    <div className="section-heading"><h2>Drawdown</h2><span className="muted">Net P&amp;L · treidauspäivät</span></div>
    <div className="drawdown-kpis">
      <article><span>Avg drawdown length</span><strong>{drawdowns.averageLengthTradingDays.toFixed(1)} pv</strong></article>
      <article><span>Longest drawdown</span><strong>{drawdowns.longestLengthTradingDays} pv</strong></article>
      <article><span>Avg drawdown</span><strong className="negative">{formatMoney(drawdowns.averageDrawdown)}</strong></article>
      <article><span>Max drawdown</span><strong className="negative">{formatMoney(drawdowns.maxDrawdown)}</strong></article>
      <article><span>Current drawdown</span><strong className={new Decimal(drawdowns.currentDrawdown).isNegative() ? "negative" : ""}>{formatMoney(drawdowns.currentDrawdown)} · {drawdowns.currentLengthTradingDays} pv</strong></article>
    </div>
    <PerformanceCharts daily={drawdowns.daily} />
    <TradeAnalytics analytics={analytics} />
    <div className="section-heading"><h2>Viimeisimmät demotreidit</h2><Link className="ghost" href="/demo/trades">Avaa kaikki</Link></div>
    <div className="demo-table-card"><table><thead><tr><th>Aika (ET)</th><th>Symboli</th><th>Suunta</th><th>Määrä</th><th>Entry</th><th>Exit</th><th>Net</th></tr></thead><tbody>{[...drawdowns.daily].slice(-3).reverse().map((day) => <tr key={day.date}><td colSpan={7}><Link href={`/demo/trades?date=${day.date}`}>{DateTime.fromISO(day.date).toFormat("dd.LL.yyyy")} · {formatMoney(day.net)} · Katso päivän treidit →</Link></td></tr>)}</tbody></table></div>
  </section>;
}
