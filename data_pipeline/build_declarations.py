"""
Emergency Insights — add FEMA disaster declarations to the per-state files.

Input:  OpenFEMA DisasterDeclarationsSummaries (CSV, all declarations since 1953)
        https://www.fema.gov/api/open/v2/DisasterDeclarationsSummaries.csv
        states/XX.json written by prepare.py
Output: the same states/XX.json, each county with "decl": a list of
        [declaration, "YYYY-MM-DD" declared, title, incident type, statewide 0/1, "YYYY-MM-DD" incident began], newest first.

Rules:
  - Only incidents that began from START_YEAR to LAST_YEAR (same window as the rest of the report).
  - Only natural hazards: COVID-19 and other biological, chemical, terrorist and "other" incidents are left out.
  - A declaration for a whole state ("Statewide") is listed for every county in that state.
  - Each declaration appears once per county, even when FEMA lists the county more than once.
  - Declarations requested by tribal nations are left out (they cover tribal lands, not the county).
  - DR = Major Disaster, EM = Emergency, FM = Fire Management Assistance.

Run:  python build_declarations.py <declarations_csv> <out_dir>
"""
import json
import sys
from pathlib import Path

import pandas as pd

START_YEAR, LAST_YEAR = 2016, 2025
NATURAL = {"Hurricane", "Severe Storm", "Flood", "Tropical Storm", "Severe Ice Storm", "Fire", "Tornado",
           "Snowstorm", "Coastal Storm", "Winter Storm", "Earthquake", "Straight-Line Winds", "Mud/Landslide",
           "Typhoon", "Dam/Levee Break", "Tropical Depression", "Volcanic Eruption", "Drought", "Tsunami",
           "Freezing", "Severe Storm(s)"}
SMALL = {"and", "of", "the", "in", "on", "for", "to", "a", "an"}


def title_case(t):
    words = str(t).lower().split()
    return " ".join(w if (i and w in SMALL) else (w.upper() if w in {"ii", "iii", "ne", "nw", "se", "sw"} else w.capitalize())
                    for i, w in enumerate(words))


def main(csv_path, out_dir):
    d = pd.read_csv(csv_path, dtype=str)
    d = d[d.incidentType.isin(NATURAL) & (d.tribalRequest.str.lower() != "true")].copy()
    d = d[~d.declarationTitle.str.contains(r"\b(?:TRIBE|TRIBAL|NATION|BAND OF|PUEBLO|INDIAN|RANCHERIA)\b", case=False, regex=True, na=False)]
    yr = d.incidentBeginDate.str[:4].astype(int)
    d = d[(yr >= START_YEAR) & (yr <= LAST_YEAR)]
    d["code"] = d.femaDeclarationString.str.rsplit("-", n=1).str[0]   # "DR-4834"
    d["date"] = d.declarationDate.str[:10]
    d["fips"] = d.fipsStateCode.str.zfill(2) + d.fipsCountyCode.str.zfill(3)
    states_dir = Path(out_dir) / "states"
    total = 0
    for f in sorted(states_dir.glob("*.json")):
        sdb = json.loads(f.read_text(encoding="utf-8"))
        st_fips = next(iter(sdb["counties"]))[:2]
        sd = d[d.fipsStateCode.str.zfill(2) == st_fips]
        statewide = sd[sd.fipsCountyCode == "000"]
        for g, c in sdb["counties"].items():
            rows = pd.concat([sd[sd.fips == g].assign(sw=0), statewide.assign(sw=1)])
            rows = rows.sort_values(["sw"]).drop_duplicates("code").sort_values("date", ascending=False)
            c["decl"] = [[r.code, r.date, title_case(r.declarationTitle), r.incidentType, int(r.sw), r.incidentBeginDate[:10]] for r in rows.itertuples()]
            total += len(c["decl"])
        f.write_text(json.dumps(sdb, separators=(",", ":")), encoding="utf-8")
    print(f"Added {total:,} county declarations ({START_YEAR}-{LAST_YEAR}, natural hazards) to {states_dir}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(*sys.argv[1:3])
