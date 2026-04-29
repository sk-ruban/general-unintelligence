import type { DamPricePoint, DataHealth } from "@/lib/types";

export type DayRange = {
  from?: string;
  to?: string;
};

export type MarketDataApi = {
  initializeMarketDb: () => Promise<DataHealth>;
  getAvailableMarketDays: () => Promise<string[]>;
  getDamPriceSeries: (dayRange?: DayRange) => Promise<DamPricePoint[]>;
  getDataHealth: () => Promise<DataHealth>;
};

export type RawPriceRow = {
  market_date: string;
  delivery_mtu_local: string;
  timestamp_utc: string;
  mtu: number;
  duration_minutes: number;
  published_at_local: string;
  version: number | null;
  source_file: string;
  mcp_eur_per_mwh: number;
  total_trades: number | null;
};

export type RawCurveRow = {
  market_date: string;
  delivery_mtu_local: string;
  timestamp_utc: string;
  mtu: number;
  side: "Buy" | "Sell";
  curve_order: number;
  quantity_mwh: number;
  unit_price_eur_per_mwh: number;
  published_at_local: string;
  version: number | null;
  source_file: string;
};

export type StaticManifest = {
  generated_at_utc: string;
  price_files: number;
  curve_files: number;
  price_rows: number;
  curve_rows: number;
  first_market_date: string | null;
  last_market_date: string | null;
  curve_market_dates: string[];
};
