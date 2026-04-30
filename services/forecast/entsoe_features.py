from __future__ import annotations

import os
from datetime import datetime

import pandas as pd
from entsoe import EntsoePandasClient


def fetch_greek_forecasts(start: str, end: str, token: str | None = None) -> pd.DataFrame:
    api_key = token or os.environ.get("ENTSOE_API_TOKEN")
    if not api_key:
        raise RuntimeError("ENTSOE_API_TOKEN is required")
    client = EntsoePandasClient(api_key=api_key)
    start_ts = pd.Timestamp(start, tz="Europe/Athens")
    end_ts = pd.Timestamp(end, tz="Europe/Athens")
    load = client.query_load_forecast("GR", start=start_ts, end=end_ts).rename("load_forecast_mw")
    res = client.query_wind_and_solar_forecast("GR", start=start_ts, end=end_ts, psr_type=None)
    if isinstance(res, pd.Series):
        res = res.to_frame("res_forecast_mw")
    else:
        res = res.rename(columns={col: str(col).lower().replace(" ", "_") for col in res.columns})
        res["res_forecast_mw"] = res.sum(axis=1)
    frame = pd.concat([load, res], axis=1)
    frame["residual_load_mw"] = frame["load_forecast_mw"] - frame["res_forecast_mw"]
    frame["fetched_at_utc"] = datetime.utcnow().isoformat()
    return frame.reset_index(names="timestamp")

