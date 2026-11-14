"""
Emergency Insights — ZIP code to county tables, one file per state.

Input:  Census 2020 ZCTA-to-county relationship file (tab20_zcta520_county20_natl.txt)
        Census county list (2024_Gaz_counties_national.txt), for state abbreviations
Output: zips/XX.json   {"32801": ["12095"], "32008": ["12067", "12121"], ...}
        Each ZIP lists the counties in that state it touches, the one with the most land first.

Run:  python build_zips.py <zcta_county_txt> <gazetteer_txt> <out_dir>
"""
import json
import sys
from pathlib import Path

import pandas as pd


def main(rel_path, gaz_path, out_dir):
    out = Path(out_dir) / "zips"
    out.mkdir(parents=True, exist_ok=True)
    g = pd.read_csv(gaz_path, sep="\t", dtype={"GEOID": str})
    g.columns = [c.strip() for c in g.columns]
    usps = dict(zip(g.GEOID.str[:2], g.USPS))
    d = pd.read_csv(rel_path, sep="|", dtype=str, encoding="utf-8-sig")
    d = d[d.GEOID_ZCTA5_20.notna() & d.GEOID_COUNTY_20.notna()].copy()
    d["land"] = d.AREALAND_PART.astype(float)
    d["st"] = d.GEOID_COUNTY_20.str[:2].map(usps)
    d = d[d.st.notna()]
    n = 0
    for st, grp in d.groupby("st"):
        z = {}
        for zip_, zg in grp.sort_values("land", ascending=False).groupby("GEOID_ZCTA5_20", sort=False):
            tot = zg.land.sum() or 1
            keep = [r.GEOID_COUNTY_20 for i, r in enumerate(zg.itertuples()) if i == 0 or r.land / tot >= 0.10]
            z[zip_] = keep
        (out / f"{st}.json").write_text(json.dumps(z, separators=(",", ":")), encoding="utf-8")
        n += len(z)
    print(f"Wrote ZIP tables for {d.st.nunique()} states ({n:,} state-ZIP pairs) to {out}")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    main(*sys.argv[1:4])
