from __future__ import annotations

import math
from dataclasses import dataclass

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error

from services.common.data import (
    load_dam_prices,
    load_entsoe_forecasts,
    write_json_artifact,
)

BASE_FEATURES = [
    "mtu",
    "duration_minutes",
    "dow",
    "month",
    "is_weekend",
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "lag_1d",
    "lag_7d",
    "lag_14d",
    "roll_7d_mean",
    "roll_7d_std",
]

ENTSOE_FEATURES = [
    "load_forecast_mw",
    "solar_forecast_mw",
    "wind_forecast_mw",
    "res_forecast_mw",
    "residual_load_mw",
    "res_share",
]

DEPTH_SOURCE_COLUMNS = ["buyVolumeMw", "sellVolumeMw", "totalVolumeMw"]

DEPTH_FEATURES = [
    "lag_1d_buy_volume_mw",
    "lag_1d_sell_volume_mw",
    "lag_1d_total_volume_mw",
    "lag_7d_total_volume_mw",
    "roll_7d_total_volume_mw",
    "roll_7d_total_volume_std",
    "lag_1d_volume_imbalance_mw",
]

SUPPORTING_CONTEXT = [
    {
        "name": "ICE TTF gas",
        "role": "Thermal marginal-cost and scarcity context",
        "status": "context_only",
        "history": "Recent cached strip, not full 5.5-year walk-forward feature history",
    },
    {
        "name": "EEX EUA carbon",
        "role": "Carbon-cost context for thermal price pressure",
        "status": "context_only",
        "history": "Recent cached ticker/context, not full 5.5-year walk-forward feature history",
    },
    {
        "name": "Open-Meteo weather",
        "role": "Near-term solar, wind, and demand-stress context",
        "status": "context_only",
        "history": "Forecast/current cache, not full historical-forecast backfill",
    },
]


@dataclass
class ForecastArtifacts:
    frame: pd.DataFrame
    metrics: dict
    predictions: pd.DataFrame


def build_feature_frame(prices: pd.DataFrame, use_entsoe: bool = True) -> pd.DataFrame:
    frame = prices.copy()
    frame["date"] = pd.to_datetime(frame["marketDate"])
    frame["dow"] = frame["date"].dt.dayofweek
    frame["month"] = frame["date"].dt.month
    frame["is_weekend"] = (frame["dow"] >= 5).astype(int)
    interval_hours = frame["duration_minutes"] / 60.0
    frame["hour"] = (frame["mtu"] - 1) * interval_hours
    frame["hour_sin"] = np.sin(2 * np.pi * frame["hour"] / 24)
    frame["hour_cos"] = np.cos(2 * np.pi * frame["hour"] / 24)
    frame["dow_sin"] = np.sin(2 * np.pi * frame["dow"] / 7)
    frame["dow_cos"] = np.cos(2 * np.pi * frame["dow"] / 7)
    group_cols = ["duration_minutes", "mtu"]
    frame["lag_1d"] = _grouped_lag(frame, group_cols, "price", 1)
    frame["lag_7d"] = _grouped_lag(frame, group_cols, "price", 7)
    frame["lag_14d"] = _grouped_lag(frame, group_cols, "price", 14)
    frame["roll_7d_mean"] = _grouped_rolling_lag(
        frame, group_cols, "price", window=7, min_periods=2, method="mean"
    )
    frame["roll_7d_std"] = _grouped_rolling_lag(
        frame, group_cols, "price", window=7, min_periods=2, method="std"
    )
    frame = attach_market_depth_features(frame, group_cols)
    if use_entsoe:
        frame = attach_entsoe_features(frame)
    features = available_features(frame)
    return frame.dropna(subset=features + ["price"]).reset_index(drop=True)


def walk_forward_cv(frame: pd.DataFrame) -> ForecastArtifacts:
    features = available_features(frame)
    dates = sorted(frame["marketDate"].unique())
    first = pd.Timestamp(dates[0])
    last = pd.Timestamp(dates[-1])
    train_days = 180
    test_days = 30
    step_days = 30
    cursor = first + pd.Timedelta(days=train_days)
    fold_metrics = []
    predictions = []
    feature_gain = pd.Series(0.0, index=features)

    while cursor + pd.Timedelta(days=test_days) <= last:
        train_start = cursor - pd.Timedelta(days=train_days)
        train_end = cursor
        test_end = cursor + pd.Timedelta(days=test_days)
        train = frame[(frame["date"] >= train_start) & (frame["date"] < train_end)]
        test = frame[(frame["date"] >= train_end) & (frame["date"] < test_end)]
        if len(train) < 500 or len(test) == 0:
            cursor += pd.Timedelta(days=step_days)
            continue

        params = {
            "n_estimators": 80,
            "learning_rate": 0.07,
            "num_leaves": 31,
            "min_child_samples": 25,
            "random_state": 42,
            "verbosity": -1,
        }
        point = lgb.LGBMRegressor(objective="regression_l1", **params).fit(
            train[features], train["price"]
        )
        q10 = lgb.LGBMRegressor(objective="quantile", alpha=0.1, **params).fit(
            train[features], train["price"]
        )
        q90 = lgb.LGBMRegressor(objective="quantile", alpha=0.9, **params).fit(
            train[features], train["price"]
        )

        pred = point.predict(test[features])
        p10 = q10.predict(test[features])
        p90 = q90.predict(test[features])
        feature_gain += pd.Series(point.feature_importances_, index=features)

        fold = test[["marketDate", "mtu", "duration_minutes", "price"]].copy()
        fold["pred"] = pred
        fold["p10"] = np.minimum.reduce([p10, pred, p90])
        fold["p50"] = pred
        fold["p90"] = np.maximum.reduce([p10, pred, p90])
        predictions.append(fold)

        rmse = math.sqrt(mean_squared_error(test["price"], pred))
        realized_direction = np.sign(np.diff(test["price"].to_numpy()))
        predicted_direction = np.sign(np.diff(pred))
        directional_accuracy = (
            float(np.mean(realized_direction == predicted_direction))
            if len(realized_direction)
            else 0.0
        )
        fold_metrics.append(
            {
                "train_start": train_start.date().isoformat(),
                "train_end": (train_end - pd.Timedelta(days=1)).date().isoformat(),
                "test_start": train_end.date().isoformat(),
                "test_end": (test_end - pd.Timedelta(days=1)).date().isoformat(),
                "mae_eur_per_mwh": round(
                    float(mean_absolute_error(test["price"], pred)), 3
                ),
                "rmse_eur_per_mwh": round(float(rmse), 3),
                "p10_p90_coverage": round(
                    float(
                        (
                            (test["price"] >= fold["p10"])
                            & (test["price"] <= fold["p90"])
                        ).mean()
                    ),
                    3,
                ),
                "directional_accuracy": round(directional_accuracy, 3),
                "rows": int(len(test)),
            }
        )
        cursor += pd.Timedelta(days=step_days)

    pred_frame = (
        pd.concat(predictions, ignore_index=True) if predictions else pd.DataFrame()
    )
    metrics = {
        "model_id": "lightgbm_quantile_walk_forward_v1",
        "feature_set": feature_set_label(features),
        "features": features,
        "entsoe_rows": (
            int(frame["has_entsoe"].sum()) if "has_entsoe" in frame.columns else 0
        ),
        "market_depth_rows": (
            int(frame["has_market_depth"].sum())
            if "has_market_depth" in frame.columns
            else 0
        ),
        "supporting_context": SUPPORTING_CONTEXT,
        "fold_count": len(fold_metrics),
        "folds": fold_metrics,
        "overall": _aggregate_metrics(fold_metrics),
        "by_year": _metrics_by_year(pred_frame),
        "feature_importance": _feature_importance(feature_gain),
    }
    write_json_artifact("model_lab.json", metrics)
    return ForecastArtifacts(frame=frame, metrics=metrics, predictions=pred_frame)


def attach_entsoe_features(frame: pd.DataFrame) -> pd.DataFrame:
    entsoe = load_entsoe_forecasts()
    if entsoe.empty:
        frame["has_entsoe"] = False
        return frame
    feature_cols = ["timestamp", *ENTSOE_FEATURES]
    merged = frame.merge(entsoe[feature_cols], on="timestamp", how="left")
    merged["has_entsoe"] = merged["load_forecast_mw"].notna()
    return merged


def attach_market_depth_features(
    frame: pd.DataFrame, group_cols: list[str]
) -> pd.DataFrame:
    if not all(col in frame.columns for col in DEPTH_SOURCE_COLUMNS):
        frame["has_market_depth"] = False
        return frame

    frame["buyVolumeMw"] = pd.to_numeric(frame["buyVolumeMw"], errors="coerce")
    frame["sellVolumeMw"] = pd.to_numeric(frame["sellVolumeMw"], errors="coerce")
    frame["totalVolumeMw"] = pd.to_numeric(frame["totalVolumeMw"], errors="coerce")
    frame["volume_imbalance_mw"] = frame["buyVolumeMw"] - frame["sellVolumeMw"]

    frame["lag_1d_buy_volume_mw"] = _grouped_lag(
        frame, group_cols, "buyVolumeMw", periods=1
    )
    frame["lag_1d_sell_volume_mw"] = _grouped_lag(
        frame, group_cols, "sellVolumeMw", periods=1
    )
    frame["lag_1d_total_volume_mw"] = _grouped_lag(
        frame, group_cols, "totalVolumeMw", periods=1
    )
    frame["lag_7d_total_volume_mw"] = _grouped_lag(
        frame, group_cols, "totalVolumeMw", periods=7
    )
    frame["roll_7d_total_volume_mw"] = _grouped_rolling_lag(
        frame, group_cols, "totalVolumeMw", window=7, min_periods=2, method="mean"
    )
    frame["roll_7d_total_volume_std"] = _grouped_rolling_lag(
        frame, group_cols, "totalVolumeMw", window=7, min_periods=2, method="std"
    )
    frame["lag_1d_volume_imbalance_mw"] = _grouped_lag(
        frame, group_cols, "volume_imbalance_mw", periods=1
    )
    frame["has_market_depth"] = frame[DEPTH_FEATURES].notna().all(axis=1)
    return frame


def available_features(frame: pd.DataFrame) -> list[str]:
    features = [*BASE_FEATURES]
    entsoe_present = all(col in frame.columns for col in ENTSOE_FEATURES)
    if entsoe_present and frame[ENTSOE_FEATURES].notna().all(axis=1).sum() >= 1000:
        features.extend(ENTSOE_FEATURES)
    depth_present = all(col in frame.columns for col in DEPTH_FEATURES)
    if depth_present and frame[DEPTH_FEATURES].notna().all(axis=1).sum() >= 1000:
        features.extend(DEPTH_FEATURES)
    return features


def feature_set_label(features: list[str]) -> str:
    labels = ["DAM price lags", "calendar", "realized volatility"]
    if all(feature in features for feature in DEPTH_FEATURES):
        labels.append("lagged DAM market depth")
    if all(feature in features for feature in ENTSOE_FEATURES):
        labels.append("ENTSO-E load + RES forecasts + residual load")
    else:
        labels.append("ENTSO-E cache missing or too sparse")
    return " + ".join(labels)


def _grouped_lag(
    frame: pd.DataFrame, group_cols: list[str], value_col: str, periods: int
) -> pd.Series:
    ordered = frame.sort_values([*group_cols, "date"])
    lagged = ordered.groupby(group_cols, sort=False)[value_col].shift(periods)
    return lagged.reindex(frame.index)


def _grouped_rolling_lag(
    frame: pd.DataFrame,
    group_cols: list[str],
    value_col: str,
    window: int,
    min_periods: int,
    method: str,
) -> pd.Series:
    ordered = frame.sort_values([*group_cols, "date"])
    shifted = ordered.groupby(group_cols, sort=False)[value_col].shift(1)
    if method == "mean":
        rolled = shifted.groupby([ordered[col] for col in group_cols]).rolling(
            window, min_periods=min_periods
        ).mean()
    elif method == "std":
        rolled = shifted.groupby([ordered[col] for col in group_cols]).rolling(
            window, min_periods=min_periods
        ).std()
    else:
        raise ValueError(f"Unsupported rolling method: {method}")
    return rolled.reset_index(level=list(range(len(group_cols))), drop=True).reindex(
        frame.index
    )


def _aggregate_metrics(folds: list[dict]) -> dict:
    if not folds:
        return {}
    return {
        "mae_eur_per_mwh": round(
            float(np.mean([fold["mae_eur_per_mwh"] for fold in folds])), 3
        ),
        "rmse_eur_per_mwh": round(
            float(np.mean([fold["rmse_eur_per_mwh"] for fold in folds])), 3
        ),
        "p10_p90_coverage": round(
            float(np.mean([fold["p10_p90_coverage"] for fold in folds])), 3
        ),
        "directional_accuracy": round(
            float(np.mean([fold["directional_accuracy"] for fold in folds])), 3
        ),
    }


def _metrics_by_year(predictions: pd.DataFrame) -> dict[str, dict]:
    if predictions.empty:
        return {}
    out: dict[str, dict] = {}
    for year, group in predictions.groupby(predictions["marketDate"].str.slice(0, 4)):
        out[str(year)] = {
            "mae_eur_per_mwh": round(
                float(mean_absolute_error(group["price"], group["pred"])), 3
            ),
            "rows": int(len(group)),
        }
    return out


def _feature_importance(feature_gain: pd.Series) -> dict[str, float]:
    total = feature_gain.sum()
    if total <= 0:
        return {}
    return {
        key: round(float(value / total), 4)
        for key, value in feature_gain.sort_values(ascending=False).items()
    }


if __name__ == "__main__":
    artifacts = walk_forward_cv(build_feature_frame(load_dam_prices()))
    print(artifacts.metrics["overall"])
