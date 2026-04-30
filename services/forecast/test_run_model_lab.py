from __future__ import annotations

import unittest

import pandas as pd

from services.forecast.run_model_lab import build_feature_frame


class ForecastFeatureTests(unittest.TestCase):
    def test_lagged_market_depth_uses_prior_same_mtu_values(self) -> None:
        rows = []
        for day in range(20):
            market_date = (pd.Timestamp("2025-01-01") + pd.Timedelta(days=day)).date()
            for mtu in [1, 2]:
                total_volume = 1000 + day * 100 + mtu
                rows.append(
                    {
                        "marketDate": market_date.isoformat(),
                        "mtu": mtu,
                        "duration_minutes": 60,
                        "price": 50 + day * 2 + mtu,
                        "buyVolumeMw": total_volume + 5,
                        "sellVolumeMw": total_volume - 5,
                        "totalVolumeMw": total_volume,
                    }
                )

        features = build_feature_frame(pd.DataFrame(rows), use_entsoe=False)
        target = features[
            (features["marketDate"] == "2025-01-16") & (features["mtu"] == 2)
        ].iloc[0]

        self.assertEqual(target["lag_1d_total_volume_mw"], 2402)
        self.assertEqual(target["lag_7d_total_volume_mw"], 1802)
        self.assertEqual(target["lag_1d_volume_imbalance_mw"], 10)
        self.assertAlmostEqual(
            target["roll_7d_total_volume_mw"],
            sum(1802 + offset * 100 for offset in range(7)) / 7,
        )

    def test_price_lags_do_not_cross_resolution_boundary(self) -> None:
        rows = []
        for day in range(18):
            market_date = (pd.Timestamp("2025-09-01") + pd.Timedelta(days=day)).date()
            rows.append(
                {
                    "marketDate": market_date.isoformat(),
                    "mtu": 1,
                    "duration_minutes": 60,
                    "price": 100 + day,
                    "buyVolumeMw": 1000 + day,
                    "sellVolumeMw": 1000 + day,
                    "totalVolumeMw": 1000 + day,
                }
            )
        for day in range(18):
            market_date = (pd.Timestamp("2025-10-01") + pd.Timedelta(days=day)).date()
            rows.append(
                {
                    "marketDate": market_date.isoformat(),
                    "mtu": 1,
                    "duration_minutes": 15,
                    "price": 500 + day,
                    "buyVolumeMw": 5000 + day,
                    "sellVolumeMw": 5000 + day,
                    "totalVolumeMw": 5000 + day,
                }
            )

        features = build_feature_frame(pd.DataFrame(rows), use_entsoe=False)
        target = features[features["marketDate"] == "2025-10-16"].iloc[0]

        self.assertEqual(target["lag_14d"], 501)
        self.assertEqual(target["lag_14d"], target["price"] - 14)


if __name__ == "__main__":
    unittest.main()
