import { AutoRefresh } from "@/components/auto-refresh";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ExecutionsPage() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("execution_fills").select("id,executed_at,symbol,side,short_flag,quantity,price,source_trade_id,source_order_id,source_account").order("executed_at", { ascending: false }).limit(1000);
  return <section className="page-shell"><AutoRefresh /><div className="page-heading"><div><p className="eyebrow">RAW EXECUTIONS</p><h1>Executionit</h1></div><span className="count-pill">{data?.length ?? 0} viimeisintä</span></div><div className="table-card"><table><thead><tr><th>Aika (ET)</th><th>Symboli</th><th>Side</th><th>Määrä</th><th>Hinta</th><th>Trade ID</th><th>Order ID</th><th>Tili</th></tr></thead><tbody>{(data ?? []).map((fill) => <tr key={fill.id}><td>{formatDateTime(fill.executed_at)}</td><td className="symbol">{fill.symbol}</td><td><span className={`execution-side ${fill.side === "B" ? "buy" : "sell"}`}>{fill.side}{fill.short_flag ? " / SHORT" : ""}</span></td><td>{formatNumber(fill.quantity)}</td><td>{formatNumber(fill.price, 4)}</td><td className="mono">{fill.source_trade_id}</td><td className="mono">{fill.source_order_id || "—"}</td><td className="mono">{fill.source_account}</td></tr>)}</tbody></table>{(data?.length ?? 0) === 0 && <div className="empty-state"><h3>Ei execution-dataa</h3><p>Ensimmäinen vakaa DAS-snapshot ilmestyy tähän automaattisesti.</p></div>}</div></section>;
}

