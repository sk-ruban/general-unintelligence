type DateRange = {
  from: string;
  to: string;
  dates: string[];
};

export type PricePoint = {
  marketDate: string;
  timestamp: string;
  mtu: number;
  mcpEurPerMwh: number;
  buyVolume: number;
  sellVolume: number;
  totalTrades: number;
  sourceRowCount: number;
};

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function priceSeriesFromMarketResults(rows: any[], limit = 10_000) {
  const grouped = new Map<string, PricePoint>();
  for (const row of rows) {
    const price = numberValue(row.mcpEurPerMwh);
    if (price === undefined) {
      continue;
    }
    const key = `${row.marketDate}|${row.mtu}|${row.timestamp}`;
    const existing =
      grouped.get(key) ??
      ({
        marketDate: row.marketDate,
        timestamp: row.timestamp,
        mtu: row.mtu,
        mcpEurPerMwh: price,
        buyVolume: 0,
        sellVolume: 0,
        totalTrades: 0,
        sourceRowCount: 0,
      } satisfies PricePoint);
    const volume = numberValue(row.totalTrades) ?? 0;
    if (row.side === "Buy") {
      existing.buyVolume += volume;
    } else if (row.side === "Sell") {
      existing.sellVolume += volume;
    }
    existing.totalTrades = existing.buyVolume + existing.sellVolume;
    existing.sourceRowCount += 1;
    grouped.set(key, existing);
  }
  return Array.from(grouped.values())
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.mtu - right.mtu)
    .slice(0, limit);
}

export function summarizePrices(priceSeries: PricePoint[]) {
  const prices = priceSeries.map((point) => point.mcpEurPerMwh).filter((value) => Number.isFinite(value));
  if (prices.length === 0) {
    return null;
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const variance = prices.reduce((sum, value) => sum + (value - averagePrice) ** 2, 0) / prices.length;
  return {
    minPrice: Number(minPrice.toFixed(3)),
    maxPrice: Number(maxPrice.toFixed(3)),
    averagePrice: Number(averagePrice.toFixed(3)),
    dailySpread: Number((maxPrice - minPrice).toFixed(3)),
    volatility: Number(Math.sqrt(variance).toFixed(3)),
  };
}

export function coverageFromFiles(files: any[]) {
  const sources: Record<string, { files: number; firstDate: string | null; lastDate: string | null; rows: number }> = {};
  const dates = new Set<string>();
  for (const file of files) {
    dates.add(file.marketDate);
    const current =
      sources[file.sourceCode] ??
      ({
        files: 0,
        firstDate: null,
        lastDate: null,
        rows: 0,
      } satisfies { files: number; firstDate: string | null; lastDate: string | null; rows: number });
    current.files += 1;
    current.rows += file.rowCount ?? 0;
    current.firstDate = current.firstDate === null || file.marketDate < current.firstDate ? file.marketDate : current.firstDate;
    current.lastDate = current.lastDate === null || file.marketDate > current.lastDate ? file.marketDate : current.lastDate;
    sources[file.sourceCode] = current;
  }
  const sortedDates = Array.from(dates).sort();
  return {
    marketDates: sortedDates.length,
    firstDate: sortedDates[0] ?? null,
    lastDate: sortedDates.at(-1) ?? null,
    sources,
  };
}

export function curveFragility(curveRows: any[], priceSeries: PricePoint[], limit = 96) {
  const priceByKey = new Map(priceSeries.map((point) => [`${point.marketDate}|${point.mtu}`, point.mcpEurPerMwh]));
  const grouped = new Map<string, any[]>();
  for (const row of curveRows) {
    if (numberValue(row.quantity) === undefined || numberValue(row.unitPriceEurPerMwh) === undefined) {
      continue;
    }
    const key = `${row.marketDate}|${row.mtu}|${row.timestamp}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, limit)
    .map(([key, rows]) => {
      const [marketDate, rawMtu, timestamp] = key.split("|");
      const mtu = Number(rawMtu);
      const mcp = priceByKey.get(`${marketDate}|${mtu}`);
      const relevant = mcp === undefined ? rows : rows.filter((row) => Math.abs(row.unitPriceEurPerMwh - mcp) <= 25);
      const selected = relevant.length >= 4 ? relevant : rows;
      const quantities = selected.map((row) => numberValue(row.quantity)).filter((value): value is number => value !== undefined);
      const prices = selected.map((row) => numberValue(row.unitPriceEurPerMwh)).filter((value): value is number => value !== undefined);
      const quantityRange = quantities.length ? Math.max(...quantities) - Math.min(...quantities) : 0;
      const priceRange = prices.length ? Math.max(...prices) - Math.min(...prices) : 0;
      const slope = quantityRange <= 0 ? 1 : priceRange / quantityRange;
      const score = Number(clamp(slope / 0.05).toFixed(3));
      return {
        marketDate,
        timestamp,
        mtu,
        score,
        quantityRange: Number(quantityRange.toFixed(3)),
        priceRange: Number(priceRange.toFixed(3)),
        reason:
          score >= 0.75
            ? "Steep aggregated curve near the clearing price; small volume shifts may move price materially."
            : score >= 0.4
              ? "Moderate curve sensitivity around the clearing price."
              : "Broad curve depth around the clearing price.",
      };
    });
}

function mergeSpreadSummaries(summaries: any[]) {
  const prices = summaries.flatMap((summary) =>
    (summary.priceSeries ?? []).map((point: any) => point.mcpEurPerMwh).filter((value: unknown) => Number.isFinite(value)),
  );
  if (prices.length === 0) {
    return null;
  }
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  const variance = prices.reduce((sum, value) => sum + (value - averagePrice) ** 2, 0) / prices.length;
  return {
    minPrice: Number(minPrice.toFixed(3)),
    maxPrice: Number(maxPrice.toFixed(3)),
    averagePrice: Number(averagePrice.toFixed(3)),
    dailySpread: Number((maxPrice - minPrice).toFixed(3)),
    volatility: Number(Math.sqrt(variance).toFixed(3)),
  };
}

export function dashboardFromSummaries(range: DateRange, summaries: any[], source: string, timezone: string) {
  const priceSeries = summaries.flatMap((summary) => summary.priceSeries ?? []).slice(0, 2_000);
  return {
    source,
    timezone,
    range: { from: range.from, to: range.to },
    coverage: coverageFromFiles(
      summaries.flatMap((summary) =>
        Object.entries(summary.coverage?.sources ?? {}).map(([sourceCode, sourceCoverage]: [string, any]) => ({
          sourceCode,
          marketDate: summary.marketDate,
          rowCount: sourceCoverage.rows,
        })),
      ),
    ),
    priceSeries,
    spreadSummary: mergeSpreadSummaries(summaries),
    volumeSeries: summaries.flatMap((summary) => summary.volumeSeries ?? []).slice(0, 2_000),
    curveFragility: summaries.flatMap((summary) => summary.curveFragility ?? []).slice(0, 96),
    summaryMode: "precomputed",
    caveats: [
      "Phase 1 DAM dashboard data is seeded from local ENEX XLSX files, not a live Convex remote sync.",
      "Curve fragility is an MVP signal derived from aggregated curve steepness near the market clearing price.",
      "Battery dispatch signals and frontend composition are reserved for the next implementation stage.",
    ],
  };
}
