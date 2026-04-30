from __future__ import annotations

import os
from datetime import UTC, datetime

import pandas as pd
from entsoe import EntsoePandasClient

from services.common.data import ENTSOE_CACHE


def fetch_greek_forecasts(
    start: str, end: str, token: str | None = None
) -> pd.DataFrame:
    api_key = token or os.environ.get("ENTSOE_API_TOKEN")
    if not api_key:
        raise RuntimeError("ENTSOE_API_TOKEN is required")
    client = EntsoePandasClient(api_key=api_key)
    start_ts = pd.Timestamp(start, tz="Europe/Athens")
    end_ts = pd.Timestamp(end, tz="Europe/Athens")
    load = _normalize_load(client.query_load_forecast("GR", start=start_ts, end=end_ts))
    res = client.query_wind_and_solar_forecast(
        "GR", start=start_ts, end=end_ts, psr_type=None
    )
    res = _normalize_res(res)
    frame = pd.concat([load, res], axis=1)
    frame["residual_load_mw"] = frame["load_forecast_mw"] - frame["res_forecast_mw"]
    frame["res_share"] = frame["res_forecast_mw"] / frame["load_forecast_mw"].where(
        frame["load_forecast_mw"] != 0
    )
    frame["fetched_at_utc"] = datetime.now(UTC).isoformat()
    frame = frame.reset_index(names="timestamp")
    frame["timestamp"] = pd.to_datetime(frame["timestamp"], utc=True)
    return frame


def fetch_greek_forecast_cache(
    start: str, end: str, token: str | None = None
) -> pd.DataFrame:
    start_ts = pd.Timestamp(start, tz="Europe/Athens")
    end_ts = pd.Timestamp(end, tz="Europe/Athens")
    frames: list[pd.DataFrame] = []
    cursor = start_ts
    while cursor < end_ts:
        chunk_end = min(cursor + pd.DateOffset(months=3), end_ts)
        print(f"fetching ENTSO-E {cursor.date()} -> {chunk_end.date()}")
        frames.append(
            fetch_greek_forecasts(
                cursor.date().isoformat(), chunk_end.date().isoformat(), token=token
            )
        )
        cursor = chunk_end
    cache = pd.concat(frames, ignore_index=True)
    cache = cache.sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    ENTSOE_CACHE.parent.mkdir(parents=True, exist_ok=True)
    cache.to_parquet(ENTSOE_CACHE, index=False)
    return cache


def _normalize_load(load: pd.Series | pd.DataFrame) -> pd.DataFrame:
    if isinstance(load, pd.Series):
        return load.rename("load_forecast_mw").to_frame()
    column = "Forecasted Load" if "Forecasted Load" in load.columns else load.columns[0]
    return load[[column]].rename(columns={column: "load_forecast_mw"})


def _normalize_res(res: pd.Series | pd.DataFrame) -> pd.DataFrame:
    if isinstance(res, pd.Series):
        frame = res.rename("res_forecast_mw").to_frame()
        frame["solar_forecast_mw"] = 0.0
        frame["wind_forecast_mw"] = frame["res_forecast_mw"]
        return frame
    frame = res.rename(
        columns={col: str(col).lower().replace(" ", "_") for col in res.columns}
    )
    frame["solar_forecast_mw"] = frame["solar"] if "solar" in frame.columns else 0.0
    wind_columns = [col for col in frame.columns if col.startswith("wind")]
    frame["wind_forecast_mw"] = frame[wind_columns].sum(axis=1) if wind_columns else 0.0
    frame["res_forecast_mw"] = frame["solar_forecast_mw"] + frame["wind_forecast_mw"]
    return frame[["solar_forecast_mw", "wind_forecast_mw", "res_forecast_mw"]]


if __name__ == "__main__":
    start = os.environ.get("ENTSOE_START", "2020-11-01")
    end = os.environ.get("ENTSOE_END", "2026-05-01")
    out = fetch_greek_forecast_cache(start, end)
    print(f"wrote {len(out):,} rows to {ENTSOE_CACHE}")
