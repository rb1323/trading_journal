import { TradeAnalytics } from "@/components/trade-analytics";
import { demoAnalytics, demoSummary } from "@/lib/demo-data";
import { formatMoney } from "@/lib/format";

export default function DemoAnalyticsPage() {
  const summary = demoSummary();
  return <section className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">PATTERN DISCOVERY · DEMO</p><h1>Treidianalytiikka</h1><p className="muted">Mistä treidit tulevat ja missä olosuhteissa tulos syntyy?</p></div></div>
    <div className="demo-readonly">Analytics käyttää entry-aikaa New Yorkin ajassa, entry VWAP -hintaa, osakemäärää ja net P&amp;L:ää. Buckets muodostetaan automaattisesti.</div>
    <div className="demo-kpi-grid"><article><span>Net P&amp;L</span><strong className="positive">{formatMoney(summary.net)}</strong></article><article><span>Average winner</span><strong className="positive">{formatMoney(summary.averageWinner)}</strong></article><article><span>Average loser</span><strong className="negative">{formatMoney(summary.averageLoser)}</strong></article><article><span>Win rate</span><strong>{(summary.winRate * 100).toFixed(1)}%</strong></article><article><span>Profit factor</span><strong>{summary.profitFactor.toFixed(2)}</strong></article></div>
    <TradeAnalytics analytics={demoAnalytics()} />
  </section>;
}
