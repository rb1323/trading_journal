export interface DailyPerformance { date: string; net: number; cumulative: number; drawdown: number }

function points(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  return values.map((value, index) => `${values.length === 1 ? width / 2 : index * width / (values.length - 1)},${height - ((value - min) / spread) * height}`).join(" ");
}

export function PerformanceCharts({ daily }: { daily: DailyPerformance[] }) {
  if (daily.length === 0) return <div className="empty-panel"><p>Valitulla aikavälillä ei ole suljettuja treidejä.</p></div>;
  const width = 800;
  const height = 240;
  const maxAbs = Math.max(1, ...daily.map((row) => Math.abs(row.net)));
  return <div className="dashboard-charts">
    <article className="visual-card"><div className="visual-title"><span>Kumulatiivinen net P&amp;L</span><strong>{daily.at(-1)?.cumulative.toFixed(2)}</strong></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Kumulatiivinen net P&L"><polyline points={points(daily.map((row) => row.cumulative), width, height)} fill="none" stroke="#00e7f2" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg></article>
    <article className="visual-card"><div className="visual-title"><span>Päivittäinen net P&amp;L</span></div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Päivittäinen net P&L"><line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#29404d" />{daily.map((row, index) => { const barWidth = Math.max(2, width / daily.length - 3); const barHeight = Math.abs(row.net) / maxAbs * (height / 2 - 6); const x = index * width / daily.length + 1; const y = row.net >= 0 ? height / 2 - barHeight : height / 2; return <rect key={row.date} x={x} y={y} width={barWidth} height={barHeight} fill={row.net >= 0 ? "#19ee91" : "#ff3b70"}><title>{row.date}: {row.net.toFixed(2)}</title></rect>; })}</svg></article>
    <article className="visual-card wide"><div className="visual-title"><span>Drawdown</span><strong>{Math.min(...daily.map((row) => row.drawdown)).toFixed(2)}</strong></div><svg viewBox={`0 0 ${width * 2} ${height}`} role="img" aria-label="Drawdown"><polyline points={points(daily.map((row) => row.drawdown), width * 2, height)} fill="none" stroke="#ff3b70" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg></article>
  </div>;
}
