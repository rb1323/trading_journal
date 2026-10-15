import Link from "next/link";
import { formatMoney, formatNumber } from "@/lib/format";
import { DEMO_TRADES, demoSummary } from "@/lib/demo-data";

export default function DemoLandingPage() {
  const summary = demoSummary();
  return <section className="page-shell">
    <div className="demo-intro">
      <div>
        <p className="eyebrow">TRADING JOURNAL · LIVE PRODUCT DEMO</p>
        <h2>Turn every trade into a repeatable lesson.</h2>
        <p className="muted">Northstar Journal imports DAS Trader executions, reconstructs round trips, reconciles broker costs and makes the patterns behind your performance visible.</p>
        <div className="demo-actions"><Link className="primary" href="/demo/dashboard">Tutustu dashboardiin →</Link><Link className="ghost" href="/demo/trades">Selaa treidejä</Link></div>
      </div>
      <div className="demo-card">
        <p className="eyebrow">SYNTHETIC DATASET</p>
        <h3>Read-only portfolio</h3>
        <p>Esimerkkidata on generoitu tätä demoa varten. Se ei sisällä oikeita tilejä, tunnuksia tai henkilökohtaista P&amp;L-dataa.</p>
        <div className="demo-stat-line"><span><strong>{summary.trades}</strong> treidiä</span><span><strong>{formatNumber(DEMO_TRADES.reduce((sum, trade) => sum + trade.fills.length, 0))}</strong> filleä</span></div>
      </div>
    </div>
    <div className="demo-kpi-grid">
      <article><span>Net P&amp;L</span><strong className={summary.net >= 0 ? "positive" : "negative"}>{formatMoney(summary.net)}</strong></article>
      <article><span>Win rate</span><strong>{(summary.winRate * 100).toFixed(1)}%</strong></article>
      <article><span>Average trade</span><strong>{formatMoney(summary.average)}</strong></article>
      <article><span>Profit factor</span><strong>{summary.profitFactor.toFixed(2)}</strong></article>
      <article><span>Broker fees</span><strong>{formatMoney(summary.fees)}</strong></article>
    </div>
    <div className="section-heading"><h2>Mitä demo näyttää</h2><span className="live-pill">No login required</span></div>
    <div className="demo-card-grid">
      <article className="demo-card"><h3>Performance</h3><p>Daily net P&amp;L, cumulative equity curve ja drawdown-käyrä samassa näkymässä.</p></article>
      <article className="demo-card"><h3>Charting</h3><p>Yksittäisen treidin fillit näkyvät kynttilächartilla entry- ja exit-tasoineen.</p></article>
      <article className="demo-card"><h3>Learning loop</h3><p>Weekday-, hour-, hinta- ja kokojakaumat yhdistyvät muistiinpanoihin ja tageihin.</p></article>
    </div>
  </section>;
}
