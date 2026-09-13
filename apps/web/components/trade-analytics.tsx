"use client";

import { useEffect, useRef, useState } from "react";
import type { AnalyticsBucket, TradeAnalytics } from "@trading-journal/trade-domain";
import { formatAxisMoney } from "./performance-charts";

type MetricMode = "count" | "pnl";
type AnalyticsTab = "times" | "price-volume";

const CHART_MARGIN = { top: 8, right: 16, bottom: 36, left: 132 };

function niceStep(range: number, intervals = 4): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const rough = range / intervals;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function createAnalyticsAxis(mode: MetricMode, rows: AnalyticsBucket[]): { min: number; max: number; ticks: number[] } {
  if (mode === "count") {
    const maxValue = Math.max(1, ...rows.map((row) => row.tradeCount));
    const step = maxValue <= 4 ? 1 : Math.max(1, Math.ceil(niceStep(maxValue)));
    const max = Math.ceil(maxValue / step) * step;
    return { min: 0, max, ticks: Array.from({ length: Math.round(max / step) + 1 }, (_, index) => index * step) };
  }
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(Number(row.netPnl))));
  const step = niceStep(maxAbs * 2);
  const max = Math.ceil(maxAbs / step) * step;
  return { min: -max, max, ticks: Array.from({ length: Math.round((max * 2) / step) + 1 }, (_, index) => -max + index * step) };
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatExactMoney(value: string | number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Number(value));
}

function formatBarValue(mode: MetricMode, value: number): string {
  return mode === "count" ? formatCount(value) : formatAxisMoney(value);
}

function HorizontalBarChart({ title, rows, mode, description }: { title: string; rows: AnalyticsBucket[]; mode: MetricMode; description: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const rowHeight = 26;
  const height = Math.max(220, CHART_MARGIN.top + CHART_MARGIN.bottom + rows.length * rowHeight);
  const scale = createAnalyticsAxis(mode, rows);
  const plotWidth = width - CHART_MARGIN.left - CHART_MARGIN.right;
  const baseline = mode === "pnl" ? CHART_MARGIN.left + plotWidth / 2 : CHART_MARGIN.left;
  const plotTop = CHART_MARGIN.top;
  const plotBottom = height - CHART_MARGIN.bottom;
  const rowValue = (row: AnalyticsBucket) => mode === "count" ? row.tradeCount : Number(row.netPnl);
  const xForValue = (value: number) => mode === "count"
    ? CHART_MARGIN.left + value / scale.max * plotWidth
    : baseline + value / scale.max * (plotWidth / 2);

  useEffect(() => {
    if (!host.current) return;
    const updateWidth = () => host.current && setWidth(Math.max(260, Math.round(host.current.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  return <div className="analytics-chart-host" ref={host}>
    <svg viewBox={`0 0 ${width} ${height}`} style={{ height: `${height}px` }} role="img" aria-label={description}>
      <title>{title}</title>
      <desc>{description}</desc>
      {scale.ticks.map((tick) => {
        const x = xForValue(tick);
        return <g key={tick}>
          <line className={mode === "pnl" && Math.abs(tick) < 1e-10 ? "analytics-zero-line" : "analytics-grid-line"} x1={x} y1={plotTop} x2={x} y2={plotBottom} vectorEffect="non-scaling-stroke" />
          <text className="analytics-axis-label" x={x} y={height - 10} textAnchor="middle">{formatBarValue(mode, tick)}</text>
        </g>;
      })}
      {rows.map((row, index) => {
        const centerY = plotTop + index * rowHeight + rowHeight / 2;
        const value = rowValue(row);
        const valueX = xForValue(value);
        const x = mode === "pnl" ? Math.min(baseline, valueX) : CHART_MARGIN.left;
        const barWidth = mode === "pnl" ? Math.abs(valueX - baseline) : Math.max(0, valueX - CHART_MARGIN.left);
        return <g key={row.key}>
          <text className="analytics-category-label" x={CHART_MARGIN.left - 10} y={centerY} textAnchor="end" dominantBaseline="middle">{row.label}</text>
          <rect className={mode === "count" ? "analytics-bar analytics-bar-count" : value >= 0 ? "analytics-bar analytics-bar-positive" : "analytics-bar analytics-bar-negative"} x={x} y={centerY - 8} width={barWidth} height={16} rx={2}>
            <title>{`${row.label}: ${formatCount(row.tradeCount)} treidiä, net P&L ${formatExactMoney(row.netPnl)} (keskiarvo ${formatExactMoney(row.averageNetPnl)})`}</title>
          </rect>
        </g>;
      })}
      <line className="analytics-axis-line" x1={CHART_MARGIN.left} y1={plotBottom} x2={width - CHART_MARGIN.right} y2={plotBottom} vectorEffect="non-scaling-stroke" />
    </svg>
  </div>;
}

function AnalyticsCard({ title, rows, mode, description }: { title: string; rows: AnalyticsBucket[]; mode: MetricMode; description: string }) {
  return <article className="analytics-card">
    <div className="analytics-card-title"><h3>{title}</h3><span>{mode === "count" ? "Treidien määrä" : "Net P&L"}</span></div>
    <HorizontalBarChart title={title} rows={rows} mode={mode} description={description} />
  </article>;
}

export function TradeAnalytics({ analytics }: { analytics: TradeAnalytics }) {
  const [tab, setTab] = useState<AnalyticsTab>("times");
  const hasTrades = analytics.byEntryPrice.length > 0;
  if (!hasTrades) return <section className="trade-analytics-section">
    <div className="section-heading"><div><h2>Treidianalytiikka</h2><span className="muted">Suljetut treidit · entry-aika ET · net P&amp;L</span></div></div>
    <div className="empty-panel"><p>Analytiikkaa varten ei ole suljettuja treidejä valitulla aikavälillä.</p></div>
  </section>;
  return <section className="trade-analytics-section">
    <div className="section-heading"><div><h2>Treidianalytiikka</h2><span className="muted">Suljetut treidit · entry-aika ET · net P&amp;L</span></div></div>
    <div className="analytics-tabs" role="tablist" aria-label="Treidianalytiikan näkymät">
      <button type="button" role="tab" aria-selected={tab === "times"} className={tab === "times" ? "active" : ""} onClick={() => setTab("times")}>Päivät ja kellonajat</button>
      <button type="button" role="tab" aria-selected={tab === "price-volume"} className={tab === "price-volume" ? "active" : ""} onClick={() => setTab("price-volume")}>Hinta ja volyymi</button>
    </div>
    {tab === "times" ? <div className="analytics-grid">
      <AnalyticsCard title="Treidien jakauma viikonpäivittäin" rows={analytics.byWeekday} mode="count" description="Treidien lukumäärä viikonpäivittäin." />
      <AnalyticsCard title="Net P&L viikonpäivittäin" rows={analytics.byWeekday} mode="pnl" description="Net P&L viikonpäivittäin." />
      <AnalyticsCard title="Treidien jakauma tunneittain" rows={analytics.byHour} mode="count" description="Treidien lukumäärä entry-tunnin mukaan New Yorkin ajassa." />
      <AnalyticsCard title="Net P&L tunneittain" rows={analytics.byHour} mode="pnl" description="Net P&L entry-tunnin mukaan New Yorkin ajassa." />
    </div> : <div className="analytics-grid">
      <AnalyticsCard title="Treidien jakauma entry-hinnan mukaan" rows={analytics.byEntryPrice} mode="count" description="Treidien lukumäärä entry VWAP -hintaluokittain." />
      <AnalyticsCard title="Net P&L entry-hinnan mukaan" rows={analytics.byEntryPrice} mode="pnl" description="Net P&L entry VWAP -hintaluokittain." />
      <AnalyticsCard title="Treidien jakauma position koon mukaan" rows={analytics.byQuantity} mode="count" description="Treidien lukumäärä treidatun osakemäärän mukaan." />
      <AnalyticsCard title="Net P&L position koon mukaan" rows={analytics.byQuantity} mode="pnl" description="Net P&L treidatun osakemäärän mukaan." />
    </div>}
    <p className="analytics-note">Hinta = entry VWAP. Volyymi = treidin osakemäärä. Hintaluokat ja kokoluokat muodostetaan automaattisesti enintään viiteen kvantiilibucketiin.</p>
  </section>;
}
