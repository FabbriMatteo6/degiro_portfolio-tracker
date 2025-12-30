// Types for DEGIRO portfolio data

export interface AccountEntry {
  date: Date;
  time: string;
  valueDate: Date;
  product: string;
  isin: string;
  description: string;
  exchange: string;
  currency: string;
  amount: number;
  balanceCurrency: string;
  balance: number;
  orderId: string;
}

export interface PortfolioPosition {
  product: string;
  isin: string;
  quantity: number;
  lastPrice: number;
  valueCurrency: string;
  value: number;
  valueEur: number;
}

export interface Transaction {
  date: Date;
  time: string;
  product: string;
  isin: string;
  referenceExchange: string;
  exchange: string;
  quantity: number;
  price: number;
  priceCurrency: string;
  localValue: number;
  localCurrency: string;
  valueEur: number;
  exchangeRate: number;
  autoFxFee: number;
  transactionFee: number;
  totalEur: number;
  orderId: string;
}

export interface PortfolioData {
  account: AccountEntry[];
  portfolio: PortfolioPosition[];
  transactions: Transaction[];
}

export interface DividendEntry {
  date: Date;
  product: string;
  isin: string;
  grossAmount: number;
  withholdingTax: number;
  netAmount: number;
  currency: string;
}

export interface FeeEntry {
  date: Date;
  description: string;
  amount: number;
  currency: string;
  type: 'transaction' | 'fx' | 'connection' | 'other';
}

export interface PerformanceMetrics {
  twr: number;           // Time-Weighted Return
  mwr: number;           // Money-Weighted Return (IRR)
  cagr: number;          // Compound Annual Growth Rate
  sharpeRatio: number;   // Sharpe Ratio
  sortinoRatio: number;  // Sortino Ratio
  maxDrawdown: number;   // Maximum Drawdown
  volatility: number;    // Standard Deviation
  alpha: number;         // Alpha vs benchmark
  beta: number;          // Beta vs benchmark
}

export interface AllocationData {
  bySector: { name: string; value: number; percentage: number }[];
  byGeography: { name: string; value: number; percentage: number }[];
  byAssetClass: { name: string; value: number; percentage: number }[];
  byCurrency: { name: string; value: number; percentage: number }[];
}

export interface TimeSeriesPoint {
  date: Date;
  portfolioValue: number;
  cashFlow: number;
  benchmark1: number; // S&P 500
  benchmark2: number; // MSCI World
}

export interface GainsData {
  totalUnrealizedGain: number;
  totalRealizedGain: number;
  positions: {
    product: string;
    isin: string;
    costBasis: number;
    currentValue: number;
    unrealizedGain: number;
    unrealizedGainPercent: number;
  }[];
}

export type TimePeriod = 'YTD' | '1Y' | '3Y' | '5Y' | 'ALL' | 'CUSTOM';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ISIN to sector/geography mapping
export interface IsinMapping {
  [isin: string]: {
    sector: string;
    geography: string;
    assetClass: string;
    name: string;
  };
}
