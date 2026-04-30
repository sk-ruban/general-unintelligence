export type RiskMode = "conservative" | "balanced" | "aggressive";

export type SystemTwinSpec = {
  name: string;
  power_mw: number;
  contracted_energy_mwh: number;
  nameplate_energy_mwh?: number | null;
  duration_hours: number;
  rte_pct: number;
  soc_min_pct: number;
  soc_max_pct: number;
  reserve_soc_pct: number;
  max_cycles_per_day: number;
  warranty_throughput_mwh?: number | null;
  aux_load_kw: { active: number; standby: number };
  thermal_derating?: { temp_c: number; derate_pu: number }[];
  confidence: Record<string, "high" | "medium" | "low" | "unknown">;
};

export type DegSurface = {
  archetype: string;
  parameter_set: string;
  grid: {
    dod: number[];
    c_rate: number[];
    temp_c: number[];
  };
  c_deg_eur_per_mwh: number[][][];
  generated_at: string;
};

export type LpInput = {
  prices_eur_per_mwh: number[];
  resolution_minutes: 60 | 15;
  twin: SystemTwinSpec;
  cell_degradation_surface?: DegSurface;
  forecast_uncertainty_sigma?: number[];
  initial_soc_mwh: number;
  terminal_soc_mwh?: number;
  risk_mode: RiskMode;
};

export type LpOutput = {
  charge_mw: number[];
  discharge_mw: number[];
  soc_mwh: number[];
  cycle_count: number;
  expected_revenue_eur: number;
  degradation_cost_eur: number;
  feasibility_violations: string[];
  solve_status: "optimal" | "infeasible" | "timeout";
  solve_time_ms: number;
};

export type FeatureBundle = Record<string, number[] | number | string | boolean | null>;

export type ForecastInput = {
  target_date: string;
  resolution_minutes: 60 | 15;
  features: FeatureBundle;
};

export type ForecastOutput = {
  point_forecast: number[];
  quantiles: { p10: number[]; p50: number[]; p90: number[] };
  feature_importance?: Record<string, number>;
  model_id: string;
};

export type BacktestRun = {
  start_date: string;
  end_date: string;
  asset: SystemTwinSpec;
  forecast_model: string;
  results: {
    daily: {
      date: string;
      realized_eur: number;
      perfect_eur: number;
      feasibility_violations: number;
      cycles: number;
    }[];
    annualized_eur_per_mw_per_year: Record<string, number>;
    capture_rate: number;
    sharpe: number;
    max_drawdown_eur: number;
  };
};
