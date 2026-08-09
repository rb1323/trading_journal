export type DasSide = "B" | "S";

export interface NormalizedFill {
  stableKey: string;
  sourceId: string;
  tradeId: string;
  orderId: string;
  trader: string;
  account: string;
  branch: string;
  route: string;
  brokerSymbol: string;
  rrno: string;
  side: DasSide;
  shortFlag: boolean;
  market: string;
  symbol: string;
  quantity: number;
  price: string;
  executedAt: string;
  executionDate: string;
  raw: Record<string, string>;
}

export interface ParseIssue {
  line: number;
  message: string;
}

export interface ParseResult {
  fills: NormalizedFill[];
  issues: ParseIssue[];
}

export type TradeDirection = "long" | "short";
export type TradeStatus = "open" | "closed";

export interface ReconstructedTrade {
  tradeKey: string;
  account: string;
  symbol: string;
  direction: TradeDirection;
  status: TradeStatus;
  openedAt: string;
  closedAt: string | null;
  quantity: number;
  openQuantity: number;
  entryVwap: string;
  exitVwap: string | null;
  grossPnl: string;
  fillCount: number;
}

export interface TradeFillAllocation {
  tradeKey: string;
  fillStableKey: string;
  role: "entry" | "exit";
  quantity: number;
  price: string;
}

export interface ReconstructionResult {
  trades: ReconstructedTrade[];
  allocations: TradeFillAllocation[];
}

