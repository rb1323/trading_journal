import Decimal from "decimal.js";
import { AutoRefresh } from "@/components/auto-refresh";
import { BrokerUpload } from "@/components/broker-upload";
import { BrokerAccountMapping } from "@/components/broker-account-mapping";
import { requireUser } from "@/lib/auth";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const { supabase } = await requireUser();
  const [{ data: snapshots }, { data: brokerImports }, { data: brokerTransactions }, { data: accounts }, { data: mappings }] = await Promise.all([
    supabase.from("sync_snapshots").select("*").order("received_at", { ascending: false }).limit(200),
    supabase.from("broker_imports").select("*").order("received_at", { ascending: false }).limit(100),
    supabase.from("broker_transactions").select("account_number,total_fees").limit(10_000),
    supabase.from("broker_accounts").select("id,source_account,display_name").order("source_account"),
    supabase.from("broker_account_mappings").select("external_account_number")
  ]);
  const mapped = new Set((mappings ?? []).map((row) => row.external_account_number));
  const unmapped = [...new Set((brokerTransactions ?? []).map((row) => row.account_number))].filter((account) => !mapped.has(account));
  const totalFees = (brokerTransactions ?? []).reduce((sum, row) => sum.plus(String(row.total_fees)), new Decimal(0));

  return <section className="page-shell"><AutoRefresh />
    <div className="page-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h1>Importit</h1></div></div>
    <BrokerUpload />
    {unmapped.length > 0 && <div className="mapping-card"><h3>Yhdistä broker-tilit DAS-tileihin</h3>{unmapped.map((external) => <BrokerAccountMapping key={external} externalAccount={external} accounts={accounts ?? []} />)}</div>}
    <div className="section-heading"><h2>Broker-kulut</h2><span className="count-pill">Yhteensä {formatMoney(totalFees.toString())}</span></div>
    <div className="table-card"><table><thead><tr><th>Vastaanotettu</th><th>Tiedosto</th><th>Tila</th><th>Rivit</th><th>Uudet</th><th>Duplikaatit</th><th>Virheet</th></tr></thead><tbody>{(brokerImports ?? []).map((item) => <tr key={item.id}><td>{formatDateTime(item.received_at)}</td><td>{item.file_name}<small>{formatNumber(item.file_size)} bytes</small></td><td><span className={`status ${item.status}`}>{item.status}</span></td><td>{item.row_count}</td><td>{item.added_count}</td><td>{item.duplicate_count}</td><td className={item.error_count ? "negative" : ""}>{item.error_count}</td></tr>)}</tbody></table>{(brokerImports?.length ?? 0) === 0 && <div className="empty-state"><h3>Ei broker-importteja</h3><p>Lataa ensimmäinen Transactions.csv yllä olevalla lomakkeella.</p></div>}</div>
    <div className="section-heading"><h2>DAS-snapshotit</h2></div>
    <div className="table-card"><table><thead><tr><th>Vastaanotettu</th><th>Tiedosto</th><th>Tila</th><th>Uudet</th><th>Duplikaatit</th><th>Virheet</th><th>Treidit</th><th>Avoimet</th></tr></thead><tbody>{(snapshots ?? []).map((snapshot) => <tr key={snapshot.id}><td>{formatDateTime(snapshot.received_at)}</td><td>{snapshot.file_name}<small>{formatNumber(snapshot.file_size)} bytes</small></td><td><span className={`status ${snapshot.status}`}>{snapshot.status}</span></td><td>{snapshot.added_count}</td><td>{snapshot.duplicate_count}</td><td className={snapshot.error_count ? "negative" : ""}>{snapshot.error_count}</td><td>{snapshot.trade_count}</td><td>{snapshot.open_position_count}</td></tr>)}</tbody></table>{(snapshots?.length ?? 0) === 0 && <div className="empty-state"><h3>Ei snapshotteja</h3><p>Jokainen muuttunut DAS-tiedosto muodostaa jäljitettävän importin.</p></div>}</div>
  </section>;
}
