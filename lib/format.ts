const eur = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurMwh = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const decimal = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 1,
});

const percent = new Intl.NumberFormat("en-GB", {
  style: "percent",
  maximumFractionDigits: 1,
});

export function formatEuro(value: number | null | undefined) {
  return Number.isFinite(value) ? eur.format(value as number) : "n/a";
}

export function formatEurPerMwh(value: number | null | undefined) {
  return Number.isFinite(value) ? `${eurMwh.format(value as number)}/MWh` : "n/a";
}

export function formatMwh(value: number | null | undefined) {
  return Number.isFinite(value) ? `${decimal.format(value as number)} MWh` : "n/a";
}

export function formatMw(value: number | null | undefined) {
  return Number.isFinite(value) ? `${decimal.format(value as number)} MW` : "n/a";
}

export function formatPercent(value: number | null | undefined) {
  return Number.isFinite(value) ? percent.format(value as number) : "n/a";
}
