import Decimal from "decimal.js";

export interface DailyNetResult {
  date: string;
  net: string | number;
}

export interface EquityPoint {
  date: string;
  net: number;
  cumulative: number;
  drawdown: number;
}

export interface DrawdownEpisode {
  startDate: string;
  troughDate: string;
  recoveryDate: string | null;
  depth: string;
  lengthTradingDays: number;
}

export interface DrawdownAnalysis {
  daily: EquityPoint[];
  episodes: DrawdownEpisode[];
  averageDrawdown: string;
  maxDrawdown: string;
  currentDrawdown: string;
  averageLengthTradingDays: number;
  longestLengthTradingDays: number;
  currentLengthTradingDays: number;
}

export function calculateDrawdowns(results: DailyNetResult[]): DrawdownAnalysis {
  const byDate = new Map<string, Decimal>();
  for (const result of results) {
    byDate.set(result.date, (byDate.get(result.date) ?? new Decimal(0)).plus(result.net));
  }

  let cumulative = new Decimal(0);
  let peak = new Decimal(0);
  let active: DrawdownEpisode | null = null;
  const episodes: DrawdownEpisode[] = [];
  const daily: EquityPoint[] = [];

  for (const date of [...byDate.keys()].sort()) {
    const net = byDate.get(date)!;
    cumulative = cumulative.plus(net);

    if (cumulative.gte(peak)) {
      if (active) {
        active.lengthTradingDays += 1;
        active.recoveryDate = date;
        episodes.push(active);
        active = null;
      }
      peak = cumulative;
    } else {
      const drawdown = cumulative.minus(peak);
      if (!active) {
        active = {
          startDate: date,
          troughDate: date,
          recoveryDate: null,
          depth: drawdown.toString(),
          lengthTradingDays: 1
        };
      } else {
        active.lengthTradingDays += 1;
        if (drawdown.lt(active.depth)) {
          active.depth = drawdown.toString();
          active.troughDate = date;
        }
      }
    }

    daily.push({
      date,
      net: net.toNumber(),
      cumulative: cumulative.toNumber(),
      drawdown: cumulative.minus(peak).toNumber()
    });
  }

  if (active) episodes.push(active);
  const totalDepth = episodes.reduce((sum, episode) => sum.plus(episode.depth), new Decimal(0));
  const maxDrawdown = episodes.reduce((lowest, episode) => Decimal.min(lowest, episode.depth), new Decimal(0));
  const totalLength = episodes.reduce((sum, episode) => sum + episode.lengthTradingDays, 0);
  const current = episodes.at(-1)?.recoveryDate === null ? episodes.at(-1)! : null;

  return {
    daily,
    episodes,
    averageDrawdown: episodes.length ? totalDepth.div(episodes.length).toString() : "0",
    maxDrawdown: maxDrawdown.toString(),
    currentDrawdown: current?.depth ?? "0",
    averageLengthTradingDays: episodes.length ? totalLength / episodes.length : 0,
    longestLengthTradingDays: episodes.reduce((longest, episode) => Math.max(longest, episode.lengthTradingDays), 0),
    currentLengthTradingDays: current?.lengthTradingDays ?? 0
  };
}
