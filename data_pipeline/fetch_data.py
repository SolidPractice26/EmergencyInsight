"""
Emergency Insights — download the raw public data that prepare.py needs.

Downloads (into <raw_dir>):
  NOAA Storm Events "details" files, one per year      -> noaa_raw/*.csv.gz
  NOAA IBTrACS hurricane tracks, North Atlantic          -> ibtracs_NA.csv
  Census Gazetteer county list (land area, center point) -> 2024_Gaz_counties_national.txt
Then combines the yearly NOAA files into one table      -> noaa_all.parquet

Run:  python fetch_data.py <raw_dir> [first_year] [last_year]
      (defaults: 1996 to 2025)

All sources are U.S. federal public-domain data.
"""

import io
import re
import sys
import zipfile
from pathlib import Path
from urllib.request import urlopen

import pandas as pd

NOAA_DIR = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
IBTRACS = ("https://www.ncei.noaa.gov/data/international-best-track-archive-for-climate-stewardship-ibtracs/"
           "v04r01/access/csv/ibtracs.NA.list.v04r01.csv")
GAZETTEER = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip"

# Only the columns prepare.py uses, kept as text so nothing is silently converted.
NOAA_COLUMNS = ["BEGIN_YEARMONTH", "EPISODE_ID", "EVENT_ID", "STATE", "STATE_FIPS", "YEAR",
                "MONTH_NAME", "EVENT_TYPE", "CZ_TYPE", "CZ_FIPS", "CZ_NAME",
                "INJURIES_DIRECT", "DEATHS_DIRECT", "DAMAGE_PROPERTY", "DAMAGE_CROPS"]


def get(url):
    print("  downloading", url)
    with urlopen(url, timeout=300) as r:
        return r.read()


def main(raw_dir, first_year=1996, last_year=2025):
    raw = Path(raw_dir)
    (raw / "noaa_raw").mkdir(parents=True, exist_ok=True)

    # 1. NOAA Storm Events: the folder lists one "details" file per year; take the newest version of each.
    listing = get(NOAA_DIR).decode("utf-8", "replace")
    newest = {}
    for name in set(re.findall(r"StormEvents_details-ftp_v1\.0_d(\d{4})_c(\d{8})\.csv\.gz", listing)):
        year, made = int(name[0]), name[1]
        if first_year <= year <= last_year and made > newest.get(year, ""):
            newest[year] = made
    missing = [y for y in range(first_year, last_year + 1) if y not in newest]
    if missing:
        sys.exit(f"NOAA has no details file for: {missing}")
    frames = []
    for year in sorted(newest):
        fname = f"StormEvents_details-ftp_v1.0_d{year}_c{newest[year]}.csv.gz"
        path = raw / "noaa_raw" / fname
        if not path.exists():
            path.write_bytes(get(NOAA_DIR + fname))
        frames.append(pd.read_csv(path, usecols=NOAA_COLUMNS, dtype=str, low_memory=False))
    noaa = pd.concat(frames, ignore_index=True)
    noaa.to_parquet(raw / "noaa_all.parquet", index=False)
    print(f"  NOAA: {len(noaa):,} records, {first_year}-{last_year}")

    # 2. Hurricane tracks
    path = raw / "ibtracs_NA.csv"
    if not path.exists():
        path.write_bytes(get(IBTRACS))

    # 3. County list
    path = raw / "2024_Gaz_counties_national.txt"
    if not path.exists():
        with zipfile.ZipFile(io.BytesIO(get(GAZETTEER))) as z:
            txt = [n for n in z.namelist() if n.endswith(".txt")][0]
            path.write_bytes(z.read(txt))

    print("Done. Next:  python prepare.py", raw / "noaa_all.parquet", raw / "ibtracs_NA.csv",
          raw / "2024_Gaz_counties_national.txt", "<out_dir>")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    args = sys.argv[1:]
    main(args[0], *(int(a) for a in args[1:3]))
