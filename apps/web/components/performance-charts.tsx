"use client";

import { useEffect, useRef, useState } from "react";

export interface DailyPerformance { date: string; net: number; cumulative: number; drawdown: number }

export interface ChartScale {
  min: number;
  max: number;
  ticks: number[];
}

type ChartKind = "cumulative" | "daily" | "drawdown";

const CHART_HEIGHT = 280;
const MARGIN = { top: 10, right: 12, bottom: 42, left: 72 };

function roundFloat(value: number): number {
  return Number(value.toPrecision(12));
}

function niceStep(range: number, intervalCount = 5): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const roughStep = range / intervalCount;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude;
}

function ticksBetween(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(roundFloat(value));
  return ticks;
}

export function createChartScale(values: number[], kind: ChartKind): ChartScale {
  const finiteValues = values.filter(Number.isFinite);
  if (kind === "daily") {
    const rawMax = Math.max(0, ...finiteValues.map(Math.abs));
    const safeMax = rawMax || 1;
    const step = niceStep(safeMax * 2);
    const max = Math.ceil(safeMax / step) * step;
    return { min: -max, max, ticks: ticksBetween(-max, max, step) };
  }

  if (kind === "drawdown") {
    const rawMin = Math.min(0, ...finiteValues);
    if (rawMin === 0) return { min: -1, max: 0, ticks: [-1, -0.75, -0.5, -0.25, 0] };
    const step = niceStep(Math.abs(rawMin));
    const min = Math.floor(rawMin / step) * step;
    return { min, max: 0, ticks: ticksBetween(min, 0, step) };
  }

  const rawMin = Math.min(0, ...finiteValues);
  const rawMax = Math.max(0, ...finiteValues);
  if (rawMin === 0 && rawMax === 0) return { min: -1, max: 1, ticks: [-1, -0.5, 0, 0.5, 1] };
  const step = niceStep(rawMax - rawMin);
  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  const safeMax = max === min ? min + step : max;
  return { min, max: safeMax, ticks: ticksBetween(min, safeMax, step) };
}

export function selectDateTickIndexes(length: number, maximum = 5): number[] {
  if (length <= 0 || maximum <= 0) return [];
  if (length <= maximum) return Array.from({ length }, (_, index) => index);
  if (maximum === 1) return [0];
  return [...new Set(Array.from({ length: maximum }, (_, index) => Math.round(index * (length - 1) / (maximum - 1))))];
}

export function formatChartDate(date: string, includeYear = false): string {
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return includeYear ? `${day}.${month}.${year.slice(-2)}` : `${day}.${month}.`;
}

export function dateRangeSpansYears(dates: string[]): boolean {
  return dates.length > 1 && dates[0]?.slice(0, 4) !== dates.at(-1)?.slice(0, 4);
}

export function formatAxisMoney(value: number): string {
  if (!Number.isFinite(value) || Object.is(value, -0) || value === 0) return "$0";
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const units = [
    { limit: 1_000_000_000, suffix: "B" },
    { limit: 1_000_000, suffix: "M" },
    { limit: 1_000, suffix: "k" }
  ];
  const unit = units.find((candidate) => absolute >= candidate.limit);
  if (unit) {
    const scaled = absolute / unit.limit;
    const digits = scaled < 10 && !Number.isInteger(scaled) ? 1 : 0;
    return `${sign}$${scaled.toFixed(digits)}${unit.suffix}`;
  }
  const digits = absolute < 10 && !Number.isInteger(absolute) ? 2 : absolute < 100 && !Number.isInteger(absolute) ? 1 : 0;
  return `${sign}$${absolute.toFixed(digits)}`;
}

function yPosition(value: number, scale: ChartScale): number {
  const plotHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
  return MARGIN.top + (scale.max - value) / (scale.max - scale.min) * plotHeight;
}

function xPosition(index: number, length: number, width: number): number {
  const plotWidth = width - MARGIN.left - MARGIN.right;
  return length === 1 ? MARGIN.left + plotWidth / 2 : MARGIN.left + index * plotWidth / (length - 1);
}

function barXPosition(index: number, length: number, width: number): number {
  const plotWidth = width - MARGIN.left - MARGIN.right;
  return MARGIN.left + (index + 0.5) * plotWidth / Math.max(1, length);
}

function ChartAxes({ daily, kind, scale, width }: { daily: DailyPerformance[]; kind: ChartKind; scale: ChartScale; width: number }) {
  const plotBottom = CHART_HEIGHT - MARGIN.bottom;
  const dateIndexes = selectDateTickIndexes(daily.length, width < 520 ? 3 : 5);
  const includeYear = dateRangeSpansYears(daily.map((row) => row.date));
  return <>
    {scale.ticks.map((tick) => {
      const y = yPosition(tick, scale);
      const isZero = Math.abs(tick) < 1e-10;
      return <g key={tick}>
        <line className={isZero ? "chart-zero-line" : "chart-grid-line"} x1={MARGIN.left} y1={y} x2={width - MARGIN.right} y2={y} vectorEffect="non-scaling-stroke" />
        <text className="chart-axis-label" x={MARGIN.left - 9} y={y} textAnchor="end" dominantBaseline="middle">{formatAxisMoney(tick)}</text>
      </g>;
    })}
    <line className="chart-axis-line" x1={MARGIN.left} y1={plotBottom} x2={width - MARGIN.right} y2={plotBottom} vectorEffect="non-scaling-stroke" />
    {dateIndexes.map((index) => {
      const x = kind === "daily" ? barXPosition(index, daily.length, width) : xPosition(index, daily.length, width);
      const anchor = kind === "daily" || daily.length === 1 ? "middle" : index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle";
      const day = daily[index]!;
      return <g key={`${day.date}-${index}`}>
        <line className="chart-axis-tick" x1={x} y1={plotBottom} x2={x} y2={plotBottom + 5} vectorEffect="non-scaling-stroke" />
        <text className="chart-axis-label chart-date-label" x={x} y={plotBottom + 20} textAnchor={anchor}>{formatChartDate(day.date, includeYear)}</text>
      </g>;
    })}
  </>;
}

function LineSeries({ values, scale, width, color }: { values: number[]; scale: ChartScale; width: number; color: string }) {
  const linePoints = values.map((value, index) => `${xPosition(index, values.length, width)},${yPosition(value, scale)}`).join(" ");
  return <polyline points={linePoints} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />;
}

function DailyBars({ daily, scale, width }: { daily: DailyPerformance[]; scale: ChartScale; width: number }) {
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const bandWidth = plotWidth / Math.max(1, daily.length);
  const barWidth = Math.max(2, Math.min(34, bandWidth * 0.72));
  const zeroY = yPosition(0, scale);
  return <>{daily.map((row, index) => {
    const centerX = barXPosition(index, daily.length, width);
    const valueY = yPosition(row.net, scale);
    return <rect key={row.date} x={centerX - barWidth / 2} y={Math.min(zeroY, valueY)} width={barWidth} height={Math.abs(valueY - zeroY)} fill={row.net >= 0 ? "#19ee91" : "#ff3b70"}>
      <title>{row.date}: {formatAxisMoney(row.net)}</title>
    </rect>;
  })}</>;
}

function ResponsiveChart({ daily, kind, label }: { daily: DailyPerformance[]; kind: ChartKind; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const values = daily.map((row) => kind === "cumulative" ? row.cumulative : kind === "daily" ? row.net : row.drawdown);
  const scale = createChartScale(values, kind);
  const start = daily[0]!.date;
  const end = daily.at(-1)!.date;
  const latest = values.at(-1) ?? 0;

  useEffect(() => {
    if (!host.current) return;
    const updateWidth = () => host.current && setWidth(Math.max(300, Math.round(host.current.clientWidth)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  return <div className="performance-chart-host" ref={host}>
    <svg viewBox={`0 0 ${width} ${CHART_HEIGHT}`} role="img" aria-label={`${label}, ${start}–${end}, viimeisin arvo ${formatAxisMoney(latest)}`}>
      <title>{label}</title>
      <desc>{`Aikaväli ${start}–${end}. Viimeisin arvo ${formatAxisMoney(latest)}.`}</desc>
      <ChartAxes daily={daily} kind={kind} scale={scale} width={width} />
      {kind === "daily" ? <DailyBars daily={daily} scale={scale} width={width} /> : <LineSeries values={values} scale={scale} width={width} color={kind === "drawdown" ? "#ff3b70" : "#00e7f2"} />}
    </svg>
  </div>;
}

export function PerformanceCharts({ daily }: { daily: DailyPerformance[] }) {
  if (daily.length === 0) return <div className="empty-panel"><p>Valitulla aikavälillä ei ole suljettuja treidejä.</p></div>;
  return <div className="dashboard-charts">
    <article className="visual-card"><div className="visual-title"><span>Kumulatiivinen net P&amp;L</span><strong>{formatAxisMoney(daily.at(-1)?.cumulative ?? 0)}</strong></div><ResponsiveChart daily={daily} kind="cumulative" label="Kumulatiivinen net P&L" /></article>
    <article className="visual-card"><div className="visual-title"><span>Päivittäinen net P&amp;L</span></div><ResponsiveChart daily={daily} kind="daily" label="Päivittäinen net P&L" /></article>
    <article className="visual-card wide"><div className="visual-title"><span>Drawdown</span><strong>{formatAxisMoney(Math.min(...daily.map((row) => row.drawdown)))}</strong></div><ResponsiveChart daily={daily} kind="drawdown" label="Drawdown" /></article>
  </div>;
}
