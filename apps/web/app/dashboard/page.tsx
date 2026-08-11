import Decimal from "decimal.js";
import { DateTime } from "luxon";
import Link from "next/link";
import { PerformanceCharts, type DailyPerformance } from "@/components/performance-charts";
import { requireUser } from "@/lib/auth";
import { formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

function resolveDates(params: Record<string, string | undefined>) {
  const now = DateTime.now().setZone("America/New_York");
  const preset = params.preset ?? "30d";
  let from = now.minus({ days: 29 }).startOf("day");
  if (preset === "today") from = now.startOf("day");
  if (preset === "week") from = now.startOf("week");
  if (preset === "month") from = now.startOf("month");
  if (preset === "ytd") from = now.startOf("year");
  if (preset === "all") from = DateTime.fromISO("2016-01-01", { zone: "America/New_York" });
  if (params.from) from = DateTime.fromISO(params.from, { zone: "America/New_York" }).startOf("day");
  const to = params.to ? DateTime.fromISO(params.to, { zone: "America/New_York" }).endOf("day") : now.endOf("day");
  return { preset, from, to };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { preset, from, to } = resolveDates(params);
  const { supabase } = await requireUser();
  let tradeQuery = supabase.from("trades").select("*").eq("status", "closed").gte("opened_at", from.toUTC().toISO()!).lte("opened_at", to.toUTC().toISO()!).order("opened_at");
  if (params.account) tradeQuery = tradeQuery.eq("source_account", params.account);
  if (params.symbol) tradeQuery = tradeQuery.eq("symbol", params.symbol.toUpperCase());
  if (params.direction) tradeQuery = tradeQuery.eq("direction", params.direction);
  const [{ data: trades }, { data: accounts }] = await Promise.all([
    tradeQuery.limit(50_000),
    supabase.from("broker_accounts").select("id,source_account,display_name").order("source_account")
  ]);

  const rows = trades ?? [];
  const gross = rows.reduce((sum, trade) => sum.plus(String(trade.gross_pnl)), new Decimal(0));
  const totalFees = rows.reduce((sum, trade) => sum.plus(String(trade.allocated_fees ?? 0)), new Decimal(0));
  const net = rows.reduce((sum, trade) => sum.plus(String(trade.net_pnl ?? trade.gross_pnl)), new Decimal(0));
  const tradeNet = rows.map((trade) => new Decimal(String(trade.net_pnl ?? trade.gross_pnl)));
  const winners = tradeNet.filter((value) => value.gt(0));
  const losers = tradeNet.filter((value) => value.lt(0));
  const winRate = rows.length ? winners.length / rows.length : 0;
  const grossProfit = winners.reduce((sum, value) => sum.plus(value), new Decimal(0));
  const grossLoss = losers.reduce((sum, value) => sum.plus(value.abs()), new Decimal(0));
  const provisional = rows.filter((trade) => trade.cost_status !== "reconciled").length;

  const grossByDate = new Map<string, Decimal>();
  for (const trade of rows) {
    const date = DateTime.fromISO(trade.opened_at, { zone: "utc" }).setZone("America/New_York").toISODate()!;
    grossByDate.set(date, (grossByDate.get(date) ?? new Decimal(0)).plus(String(trade.gross_pnl)));
  }
  const feesByDate = new Map<string, Decimal>();
  for (const trade of rows) {
    const date = DateTime.fromISO(trade.opened_at, { zone: "utc" }).setZone("America/New_York").toISODate()!;
    feesByDate.set(date, (feesByDate.get(date) ?? new Decimal(0)).plus(String(trade.allocated_fees ?? 0)));
  }
  const dates = [...new Set([...grossByDate.keys(), ...feesByDate.keys()])].sort();
  const performance = dates.reduce<{ daily: DailyPerformance[]; cumulative: Decimal; peak: Decimal }>((state, date) => {
    const value = (grossByDate.get(date) ?? new Decimal(0)).minus(feesByDate.get(date) ?? 0);
    const cumulative = state.cumulative.plus(value);
    const peak = cumulative.gt(state.peak) ? cumulative : state.peak;
    return { daily: [...state.daily, { date, net: value.toNumber(), cumulative: cumulative.toNumber(), drawdown: cumulative.minus(peak).toNumber() }], cumulative, peak };
  }, { daily: [], cumulative: new Decimal(0), peak: new Decimal(0) });
  const daily = performance.daily;

  const tradesByDate = new Map<string, number>();
  for (const trade of rows) {
    const date = DateTime.fromISO(trade.opened_at, { zone: "utc" }).setZone("America/New_York").toISODate()!;
    tradesByDate.set(date, (tradesByDate.get(date) ?? 0) + 1);
  }
  return <section className="page-shell">
    <div className="page-heading"><div><p className="eyebrow">PERFORMANCE</p><h1>Dashboard</h1><p className="muted">{from.toFormat("dd.LL.yyyy")} – {to.toFormat("dd.LL.yyyy")} · America/New_York</p></div><span className={`status ${provisional ? "processing" : "succeeded"}`}>{provisional ? `${provisional} provisional` : "reconciled"}</span></div>
    <form className="filter-bar"><div className="preset-links">{[["30d","30 päivää"],["today","Tänään"],["week","Viikko"],["month","Kuukausi"],["ytd","YTD"],["all","Kaikki"]].map(([key,label]) => <Link key={key} className={preset === key ? "active" : ""} href={`/dashboard?preset=${key}`}>{label}</Link>)}</div><input type="date" name="from" defaultValue={from.toISODate()!} /><input type="date" name="to" defaultValue={to.toISODate()!} /><select name="account" defaultValue={params.account ?? ""}><option value="">Kaikki tilit</option>{(accounts ?? []).map((account) => <option key={account.source_account} value={account.source_account}>{account.display_name || account.source_account}</option>)}</select><input name="symbol" placeholder="Symboli" defaultValue={params.symbol ?? ""} /><select name="direction" defaultValue={params.direction ?? ""}><option value="">Long + short</option><option value="long">Long</option><option value="short">Short</option></select><button className="primary">Suodata</button></form>
    <div className="kpi-grid">
      <article><span>Treidit</span><strong>{rows.length}</strong></article><article><span>Gross P&amp;L</span><strong className={gross.isNegative() ? "negative" : "positive"}>{formatMoney(gross.toString())}</strong></article><article><span>Net P&amp;L</span><strong className={net.isNegative() ? "negative" : "positive"}>{formatMoney(net.toString())}</strong></article><article><span>Kulut</span><strong>{formatMoney(totalFees.toString())}</strong></article>
      <article><span>Win rate</span><strong>{(winRate * 100).toFixed(1)}%</strong></article><article><span>Avg trade</span><strong>{formatMoney(rows.length ? net.div(rows.length).toString() : 0)}</strong></article><article><span>Avg winner</span><strong className="positive">{formatMoney(winners.length ? grossProfit.div(winners.length).toString() : 0)}</strong></article><article><span>Avg loser</span><strong className="negative">{formatMoney(losers.length ? grossLoss.neg().div(losers.length).toString() : 0)}</strong></article>
      <article><span>Profit factor</span><strong>{grossLoss.isZero() ? "—" : grossProfit.div(grossLoss).toFixed(2)}</strong></article><article><span>Kokonaisvolyymi</span><strong>{formatNumber(rows.reduce((sum, trade) => sum + trade.quantity, 0))}</strong></article>
    </div>
    <PerformanceCharts daily={daily} />
    <div className="section-heading"><h2>Päiväkohtainen tulos</h2></div>
    <div className="calendar-grid">{daily.map((day) => <Link href={`/trades?date=${day.date}`} key={day.date} className={`calendar-day ${day.net >= 0 ? "win" : "loss"}`}><span>{DateTime.fromISO(day.date).toFormat("dd.LL")}</span><strong>{formatMoney(day.net)}</strong><small>{tradesByDate.get(day.date) ?? 0} treidiä</small></Link>)}</div>
  </section>;
}
