import unittest

from services.optimizer.lp_dispatch import LpInput, SystemTwinSpec, solve_dispatch


def twin(**overrides):
    base = {
        "name": "test",
        "power_mw": 50,
        "contracted_energy_mwh": 100,
        "duration_hours": 2,
        "rte_pct": 88,
        "soc_min_pct": 10,
        "soc_max_pct": 90,
        "reserve_soc_pct": 0,
        "max_cycles_per_day": 1.5,
        "aux_load_kw": {"active": 0, "standby": 0},
        "confidence": {},
    }
    base.update(overrides)
    return SystemTwinSpec(**base)


class DispatchMilpTest(unittest.TestCase):
    def test_flat_prices_idle(self):
        out = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=[100] * 24,
                resolution_minutes=60,
                twin=twin(),
                initial_soc_mwh=50,
                terminal_soc_mwh=50,
                risk_mode="balanced",
            )
        )
        self.assertEqual(out.solve_status, "optimal")
        self.assertEqual(max(out.charge_mw), 0)
        self.assertEqual(max(out.discharge_mw), 0)
        self.assertEqual(out.feasibility_violations, [])

    def test_bimodal_prices_charge_then_discharge(self):
        prices = [30] * 8 + [80] * 8 + [180] * 8
        out = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=prices,
                resolution_minutes=60,
                twin=twin(),
                initial_soc_mwh=50,
                terminal_soc_mwh=50,
                risk_mode="balanced",
            )
        )
        self.assertEqual(out.solve_status, "optimal")
        self.assertGreater(sum(out.charge_mw[:8]), 0)
        self.assertGreater(sum(out.discharge_mw[16:]), 0)
        self.assertGreater(out.expected_revenue_eur, 0)
        self.assertEqual(out.feasibility_violations, [])

    def test_zero_energy_twin_idles(self):
        out = solve_dispatch(
            LpInput(
                prices_eur_per_mwh=[10, 200, 10, 200],
                resolution_minutes=60,
                twin=twin(contracted_energy_mwh=0),
                initial_soc_mwh=0,
                terminal_soc_mwh=0,
                risk_mode="balanced",
            )
        )
        self.assertEqual(out.solve_status, "optimal")
        self.assertEqual(sum(out.charge_mw), 0)
        self.assertEqual(sum(out.discharge_mw), 0)


if __name__ == "__main__":
    unittest.main()
