"use client";

import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries, type SeriesMarker, type UTCTimestamp } from "lightweight-charts";
import type { DemoTradeChartData } from "@/lib/demo-data";

function timestamp(value: string): UTCTimestamp {
  return Math.floor(Date.parse(value) / 1000) as UTCTimestamp;
}

export function DemoTradeChart({ data, entryVwap, exitVwap }: { data: DemoTradeChartData; entryVwap: number; exitVwap: number }) {
  const host = useRef<HTMLDivElement>(null);
  const [fullSession, setFullSession] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      width: host.current.clientWidth,
      height: 580,
      layout: { background: { type: ColorType.Solid, color: "#080d13" }, textColor: "#8da0ad", panes: { separatorColor: "#173040" } },
      grid: { vertLines: { color: "#10202b" }, horzLines: { color: "#10202b" } },
      rightPriceScale: { borderColor: "#1b3544" },
      timeScale: { borderColor: "#1b3544", timeVisible: true, secondsVisible: false },
      crosshair: { vertLine: { color: "#3a6c7e" }, horzLine: { color: "#3a6c7e" } }
    });
    const candles = chart.addSeries(CandlestickSeries, { upColor: "#19ee91", downColor: "#ff3b70", wickUpColor: "#19ee91", wickDownColor: "#ff3b70", borderVisible: false });
    candles.setData(data.bars.map((bar) => ({ time: timestamp(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#1a5668" }, 1);
    volume.setData(data.bars.map((bar) => ({ time: timestamp(bar.time), value: bar.volume, color: bar.close >= bar.open ? "#12684d" : "#6e2036" })));
    const markers: SeriesMarker<UTCTimestamp>[] = data.fills.map((fill) => ({ time: timestamp(fill.executedAt), position: fill.side === "B" ? "atPriceBottom" : "atPriceTop", price: fill.price, color: fill.side === "B" ? "#19ee91" : "#ff3b70", shape: fill.side === "B" ? "arrowUp" : "arrowDown", text: `${fill.role === "entry" ? "Entry" : "Exit"} ${fill.quantity} @ ${fill.price.toFixed(4)}`, size: 1.2 }));
    createSeriesMarkers(candles, markers, { autoScale: true });
    candles.createPriceLine({ price: entryVwap, color: "#00e7f2", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Entry VWAP" });
    candles.createPriceLine({ price: exitVwap, color: "#ffbd4a", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Exit VWAP" });
    if (fullSession) chart.timeScale().fitContent();
    else chart.timeScale().setVisibleRange({ from: timestamp(data.defaultRange.from), to: timestamp(data.defaultRange.to) });
    const observer = new ResizeObserver(() => host.current && chart.applyOptions({ width: host.current.clientWidth }));
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [data, entryVwap, exitVwap, fullSession]);
  return <div className="chart-card"><div className="chart-toolbar"><div><strong>1 min · Synthetic OHLCV</strong><span className="demo-chart-source"> · paikallinen demo-data</span></div><div className="segmented"><button type="button" className={!fullSession ? "active" : ""} onClick={() => setFullSession(false)}>Treidi ±30 min</button><button type="button" className={fullSession ? "active" : ""} onClick={() => setFullSession(true)}>Koko sessio</button></div></div><div ref={host} className="chart-host" /></div>;
}
