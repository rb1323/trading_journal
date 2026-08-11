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

export interface BrokerTransaction {
  stableKey: string;
  accountNumber: string;
  transactionId: string;
  entryType: string;
  description: string;
  tradeDate: string;
  settlementDate: string | null;
  side: string;
  symbol: string;
  quantity: string;
  price: string;
  commission: string;
  ecnFee: string;
  exchangeFee: string;
  regulatoryFee: string;
  locateFee: string;
  otherFees: string;
  occFee: string;
  orfFee: string;
  tafFee: string;
  totalFees: string;
  grossAmount: string;
  netAmount: string;
  raw: Record<string, string>;
}

export interface BrokerParseResult {
  transactions: BrokerTransaction[];
  issues: ParseIssue[];
}

export interface CostTradeLeg {
  tradeId: string;
  sourceAccount: string;
  symbol: string;
  tradeDate: string;
  direction: TradeDirection;
  side: DasSide;
  quantity: number;
  notional: string;
}

export interface MappedBrokerTransaction extends BrokerTransaction {
  sourceAccount: string;
}

export interface TradeCostAllocationResult {
  transactionStableKey: string;
  tradeId: string;
  costType: "trade_fee" | "locate_fee";
  amount: string;
}

export interface CostReconciliationGroup {
  key: string;
  status: "reconciled" | "conflict";
  brokerQuantity: string;
  executionQuantity: string;
  brokerNotional: string;
  executionNotional: string;
  message?: string;
}

export interface CostReconciliationResult {
  allocations: TradeCostAllocationResult[];
  tradeStatuses: Record<string, "provisional" | "reconciled" | "conflict">;
  groups: CostReconciliationGroup[];
  unallocatedFees: string;
}
