"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, HistogramSeries,
  type SeriesMarker, type UTCTimestamp
} from "lightweight-charts";

interface ChartPayload {
  status: "ready" | "partial";
  source: "cache" | "alpaca";
  bars: Array<{ time: string; open: number; high: number; low: number; close: number; volume: number }>;
  fills: Array<{ id: string; executedAt: string; side: "B" | "S"; quantity: number; price: string; role: "entry" | "exit" }>;
  defaultRange: { from: string; to: string };
}

function timestamp(value: string): UTCTimestamp {
  return Math.floor(Date.parse(value) / 1000) as UTCTimestamp;
}

export function TradeChart({ tradeId, entryVwap, exitVwap }: { tradeId: string; entryVwap: string; exitVwap: string | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [message, setMessage] = useState("Ladataan markkinadataa…");
  const [fullSession, setFullSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trades/${tradeId}/chart`, { cache: "no-store" }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (cancelled) return;
      if (response.status === 202) {
        setMessage(`Chart on saatavilla ${new Intl.DateTimeFormat("fi-FI", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }).format(new Date(body.availableAt))}.`);
      } else if (!response.ok) setMessage(body.error ?? "Chartin lataus epäonnistui.");
      else {
        setPayload(body as ChartPayload);
        setMessage("");
      }
    }).catch(() => !cancelled && setMessage("Chartin lataus epäonnistui."));
    return () => { cancelled = true; };
  }, [tradeId]);

  useEffect(() => {
    if (!host.current || !payload) return;
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
    candles.setData(payload.bars.map((bar) => ({ time: timestamp(bar.time), open: bar.open, high: bar.high, low: bar.low, close: bar.close })));
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#1a5668" }, 1);
    volume.setData(payload.bars.map((bar) => ({ time: timestamp(bar.time), value: bar.volume, color: bar.close >= bar.open ? "#12684d" : "#6e2036" })));

    const grouped = new Map<string, { time: UTCTimestamp; side: "B" | "S"; quantity: number; notional: number }>();
    for (const fill of payload.fills) {
      const minute = Math.floor(timestamp(fill.executedAt) / 60) * 60 as UTCTimestamp;
      const key = `${minute}|${fill.side}`;
      const current = grouped.get(key) ?? { time: minute, side: fill.side, quantity: 0, notional: 0 };
      current.quantity += fill.quantity;
      current.notional += Number(fill.price) * fill.quantity;
      grouped.set(key, current);
    }
    const markers: SeriesMarker<UTCTimestamp>[] = [...grouped.values()].sort((a, b) => a.time - b.time).map((fill) => ({
      time: fill.time,
      position: fill.side === "B" ? "atPriceBottom" : "atPriceTop",
      price: fill.notional / fill.quantity,
      color: fill.side === "B" ? "#19ee91" : "#ff3b70",
      shape: fill.side === "B" ? "arrowUp" : "arrowDown",
      text: `${fill.side} ${fill.quantity} @ ${(fill.notional / fill.quantity).toFixed(4)}`,
      size: 1.2
    }));
    createSeriesMarkers(candles, markers, { autoScale: true });
    candles.createPriceLine({ price: Number(entryVwap), color: "#00e7f2", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Entry VWAP" });
    if (exitVwap) candles.createPriceLine({ price: Number(exitVwap), color: "#ffbd4a", lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Exit VWAP" });
    if (fullSession) chart.timeScale().fitContent();
    else chart.timeScale().setVisibleRange({ from: timestamp(payload.defaultRange.from), to: timestamp(payload.defaultRange.to) });
    const observer = new ResizeObserver(() => host.current && chart.applyOptions({ width: host.current.clientWidth }));
    observer.observe(host.current);
    return () => { observer.disconnect(); chart.remove(); };
  }, [payload, fullSession, entryVwap, exitVwap]);

  return <div className="chart-card"><div className="chart-toolbar"><div><strong>1 min · SIP</strong>{payload && <span className="muted"> · {payload.source === "cache" ? "Supabase-arkisto" : "Alpaca"}{payload.status === "partial" ? " · osittainen sessio" : ""}</span>}</div><div className="segmented"><button className={!fullSession ? "active" : ""} onClick={() => setFullSession(false)}>Treidi ±30 min</button><button className={fullSession ? "active" : ""} onClick={() => setFullSession(true)}>Koko sessio</button></div></div>{message ? <div className="chart-message">{message}</div> : <div ref={host} className="chart-host" />}</div>;
}
