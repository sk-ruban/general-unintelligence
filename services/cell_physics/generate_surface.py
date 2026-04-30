from __future__ import annotations

from datetime import datetime, timezone

import numpy as np

from services.common.data import write_json_artifact


def generate_lfp_surface() -> dict:
    dod = [round(x, 2) for x in np.linspace(0.05, 0.95, 19)]
    c_rate = [round(x, 2) for x in np.linspace(0.1, 1.0, 10)]
    temp_c = list(range(-10, 51, 5))
    cube: list[list[list[float]]] = []
    for d in dod:
        by_c = []
        for c in c_rate:
            by_t = []
            for temp in temp_c:
                dod_stress = 1.0 + 2.2 * d**1.7
                c_stress = 1.0 + 0.7 * c**1.4
                temp_stress = 1.0 + max(0.0, temp - 25) * 0.035 + max(0.0, 10 - temp) * 0.012
                by_t.append(round(1.35 * dod_stress * c_stress * temp_stress, 4))
            by_c.append(by_t)
        cube.append(by_c)
    return {
        "archetype": "LFP_generic",
        "parameter_set": "Prada2013-prior-shaped",
        "grid": {"dod": dod, "c_rate": c_rate, "temp_c": temp_c},
        "c_deg_eur_per_mwh": cube,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "note": "Fast local prior for hackathon integration. Full Modal/PyBaMM sweep can replace this JSON without changing optimizer I/O.",
    }


if __name__ == "__main__":
    path = write_json_artifact("deg_surface_lfp.json", generate_lfp_surface())
    print(path)

