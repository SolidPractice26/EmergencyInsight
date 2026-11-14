"""
Emergency Insights — yearly data preparation (prototype)

Turns raw public records into one small table of ratings for every U.S. county.

Inputs (downloaded files):
  noaa_all.parquet               NOAA Storm Events details (all years combined; only START_YEAR on are used)
  ibtracs_NA.csv                 NOAA hurricane tracks (IBTrACS, North Atlantic)
  2024_Gaz_counties_national.txt Census county list with land area and center point

Outputs:
  county_ratings.csv   one row per county per hazard (whole U.S.)
  florida_db.json      the Florida slice, in the shape the report needs
  states/XX.json       the same, one file per state (used by the website)

Run:  python prepare.py <noaa_parquet> <ibtracs_csv> <gazetteer_txt> <out_dir>
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

# One record window for every hazard: from START_YEAR to LAST_YEAR.
# START_YEAR stays fixed, so the window grows by one year with each yearly update.
START_YEAR = 2016
LAST_YEAR = 2025
WINDOW = LAST_YEAR - START_YEAR + 1

# ---------------------------------------------------------------------------
# RULE 1: which NOAA event types count toward which FEMA hazard
# ---------------------------------------------------------------------------
HAZARD_OF = {
    "Avalanche": "avalanche",
    "Coastal Flood": "coastal_flooding", "Storm Surge/Tide": "coastal_flooding", "Lakeshore Flood": "coastal_flooding",
    "Cold/Wind Chill": "cold_wave", "Extreme Cold/Wind Chill": "cold_wave", "Frost/Freeze": "cold_wave",
    "Drought": "drought",
    "Hail": "hail",
    "Heat": "heat_wave", "Excessive Heat": "heat_wave",
    "Hurricane (Typhoon)": "hurricane", "Hurricane": "hurricane", "Tropical Storm": "hurricane", "Tropical Depression": "hurricane",
    "Ice Storm": "ice_storm",
    "Debris Flow": "landslide",
    "Lightning": "lightning",
    "Flood": "riverine_flooding", "Flash Flood": "riverine_flooding",
    "Thunderstorm Wind": "strong_wind", "High Wind": "strong_wind", "Strong Wind": "strong_wind",
    "Tornado": "tornado",
    "Tsunami": "tsunami",
    "Volcanic Ash": "volcanic_activity", "Volcanic Ashfall": "volcanic_activity",
    "Wildfire": "wildfire",
    "Winter Storm": "winter_weather", "Winter Weather": "winter_weather", "Heavy Snow": "winter_weather",
    "Blizzard": "winter_weather", "Sleet": "winter_weather", "Lake-Effect Snow": "winter_weather",
}
# Not counted: Heavy Rain (rain without recorded flooding), Dense Fog, Rip Current, Funnel Cloud,
# Waterspout, High Surf, Dust Storm, marine events and similar.

HAZARDS = ["avalanche", "coastal_flooding", "cold_wave", "drought", "earthquake", "hail", "heat_wave",
           "hurricane", "ice_storm", "landslide", "lightning", "riverine_flooding", "strong_wind",
           "tornado", "tsunami", "volcanic_activity", "wildfire", "winter_weather"]

# RULE 2: hazards reported at points (a hailstone, a strike) are compared per square mile;
# area-wide hazards (heat, drought, hurricanes) cover the whole county and are not.
PER_AREA = {"hail", "tornado", "lightning", "strong_wind", "riverine_flooding"}
# Very small counties (e.g. Virginia's independent cities) would jump to the top with a single event,
# so area is never taken as smaller than this.
AREA_FLOOR_SQMI = 400

# RULE 2b: NOAA rarely records a damage amount for these, so every record counts, not only damaging ones.
COUNT_ALL_RECORDS = {"heat_wave", "cold_wave", "drought", "coastal_flooding", "winter_weather"}

# RULE 2c: zone names that don't contain the county's current name
ZONE_ALIASES = {"12": {"DADE": "MIAMIDADE", "PUTNUM": "PUTNAM"}}

# RULE 3: during a named storm, these records count as the hurricane, not as their usual hazard.
STORM_ABSORBS = {"Thunderstorm Wind", "High Wind", "Strong Wind", "Tropical Storm",
                 "Hurricane (Typhoon)", "Hurricane", "Tropical Depression", "Heavy Rain"}
# Floods and storm surge during a storm keep their own hazard AND add to the storm's damage.
STORM_CONTRIBUTES = STORM_ABSORBS | {"Flood", "Flash Flood", "Storm Surge/Tide", "Coastal Flood", "Tornado"}

STORM_NEAR_MILES = 150     # storm center within this distance of the county center (big storms like Harvey reach this far)...
STORM_MIN_WIND_KT = 34     # ...at tropical-storm strength or more
STORM_DAYS_BEFORE = 3      # records from 3 days before...
STORM_DAYS_AFTER = 3       # ...to 3 days after the closest pass belong to the storm (outer bands arrive early)

# RULE 4: severity from the typical damage of a damaging event
def severity(median_damage):
    if median_damage >= 1_000_000:
        return "major"
    if median_damage >= 50_000:
        return "moderate"
    return "minor"


def money(s):
    if not isinstance(s, str) or not s.strip():
        return 0.0
    s = s.strip().upper()
    mult = {"K": 1e3, "M": 1e6, "B": 1e9}
    try:
        return float(s[:-1]) * mult[s[-1]] if s[-1] in mult else float(s)
    except ValueError:
        return 0.0


def key(name):
    return re.sub(r"[^A-Z]", "", name.upper().replace(" COUNTY", "").replace(" PARISH", "").replace(" BOROUGH", "")
                  .replace(" CENSUS AREA", "").replace(" MUNICIPALITY", "").replace(" CITY AND", ""))


def load_counties(path):
    g = pd.read_csv(path, sep="\t", dtype={"GEOID": str})
    g.columns = [c.strip() for c in g.columns]
    g = g[~g.USPS.isin(["PR"])]
    # RULE 2d: Connecticut replaced its 8 counties with 9 planning regions in 2022, but NOAA and the
    # Census ZIP table still use the old counties, so Connecticut uses the 2020 county list.
    old = Path(path).with_name("2020_Gaz_counties_national.txt")
    if old.exists():
        o = pd.read_csv(old, sep="\t", dtype={"GEOID": str})
        o.columns = [c.strip() for c in o.columns]
        g = pd.concat([g[g.USPS != "CT"], o[o.USPS == "CT"]], ignore_index=True)
    else:
        print("Warning: 2020_Gaz_counties_national.txt not found next to the county list; Connecticut will have no records.")
    g["state_fips"] = g.GEOID.str[:2]
    g["key"] = g.NAME.map(key)
    return g[["GEOID", "USPS", "NAME", "ALAND_SQMI", "INTPTLAT", "INTPTLONG", "state_fips", "key"]].reset_index(drop=True)


def assign_counties(ev, counties):
    """Give every NOAA record a county GEOID. County records match directly; zone records match by name."""
    ev = ev[ev.CZ_TYPE.isin(["C", "Z"])].copy()
    ev["state_fips"] = ev.STATE_FIPS.astype(int).map("{:02d}".format)
    c = ev[ev.CZ_TYPE == "C"].copy()
    c["GEOID"] = c.state_fips + c.CZ_FIPS.astype(int).map("{:03d}".format)
    z = ev[ev.CZ_TYPE == "Z"].copy()
    by_state = {s: grp for s, grp in counties.groupby("state_fips")}
    cache = {}

    def zone_to_geoid(state, name):
        k = (state, name)
        if k not in cache:
            zkey = key(name) if isinstance(name, str) else ""
            for old, new in ZONE_ALIASES.get(state, {}).items():
                if old in zkey and new not in zkey:
                    zkey = zkey.replace(old, new)
            best = None
            for _, row in by_state.get(state, pd.DataFrame()).iterrows():
                if row.key and row.key in zkey and (best is None or len(row.key) > len(best.key)):
                    best = row
            cache[k] = best.GEOID if best is not None else None
        return cache[k]

    z["GEOID"] = [zone_to_geoid(s, n) for s, n in zip(z.state_fips, z.CZ_NAME)]
    unmatched = z.GEOID.isna().mean()
    out = pd.concat([c, z[z.GEOID.notna()]], ignore_index=True)
    out = out[out.GEOID.isin(set(counties.GEOID))]
    return out, unmatched


def storm_passes(ibtracs_path, counties):
    """Every (storm, county) pair where a named storm's center passed near the county at TS strength or more."""
    t = pd.read_csv(ibtracs_path, skiprows=[1], low_memory=False,
                    usecols=["SID", "SEASON", "NAME", "ISO_TIME", "USA_LAT", "USA_LON", "USA_WIND"])
    for col in ["SEASON", "USA_LAT", "USA_LON", "USA_WIND"]:
        t[col] = pd.to_numeric(t[col], errors="coerce")
    t = t[(t.SEASON >= START_YEAR) & (t.SEASON <= LAST_YEAR) & (t.USA_WIND >= STORM_MIN_WIND_KT)]
    t = t.dropna(subset=["USA_LAT", "USA_LON"])
    t["time"] = pd.to_datetime(t.ISO_TIME)
    clat = np.radians(counties.INTPTLAT.values)[:, None]
    clon = np.radians(counties.INTPTLONG.values)[:, None]
    rows = []
    for sid, s in t.groupby("SID"):
        lat, lon = np.radians(s.USA_LAT.values)[None, :], np.radians(s.USA_LON.values)[None, :]
        d = 3958.8 * 2 * np.arcsin(np.sqrt(np.sin((lat - clat) / 2) ** 2 +
                                           np.cos(clat) * np.cos(lat) * np.sin((lon - clon) / 2) ** 2))
        dmin = d.min(axis=1)
        near = np.where(dmin <= STORM_NEAR_MILES)[0]
        for i in near:
            j = d[i].argmin()
            rows.append({"SID": sid, "GEOID": counties.GEOID.iat[i], "storm": s.NAME.iat[0].title(),
                         "season": int(s.SEASON.iat[0]), "closest": s.time.iat[j],
                         "miles": round(float(dmin[i])), "max_wind_kt_near": float(s.USA_WIND.values[d[i] <= STORM_NEAR_MILES].max())})
    return pd.DataFrame(rows)


def main(noaa_path, ib_path, gaz_path, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    counties = load_counties(gaz_path)

    ev = pd.read_parquet(noaa_path)
    ev, unmatched = assign_counties(ev, counties)
    ev["damage"] = ev.DAMAGE_PROPERTY.map(money) + ev.DAMAGE_CROPS.map(money)
    ev["hurt"] = pd.to_numeric(ev.INJURIES_DIRECT, errors="coerce").fillna(0) + pd.to_numeric(ev.DEATHS_DIRECT, errors="coerce").fillna(0)
    ev["damaging"] = (ev.damage > 0) | (ev.hurt > 0)
    ev["year"] = ev.BEGIN_YEARMONTH.str[:4].astype(int)
    ev["month"] = ev.BEGIN_YEARMONTH.str[4:6].astype(int)
    ev = ev[(ev.year >= START_YEAR) & (ev.year <= LAST_YEAR)].copy()
    ev["date"] = pd.to_datetime(ev.BEGIN_YEARMONTH + ev.BEGIN_DAY.astype(str).str.zfill(2), format="%Y%m%d")
    ev["hazard"] = ev.EVENT_TYPE.map(HAZARD_OF)

    # --- Hurricanes from tracks ---
    passes = storm_passes(ib_path, counties)
    ev["storm_sid"] = None
    if len(passes):
        p = passes[["SID", "GEOID", "closest"]]
        m = ev.reset_index().merge(p, on="GEOID")
        dt = (m.date - m.closest.dt.tz_localize(None).dt.normalize()).dt.days
        # a record belongs to a storm if it began within STORM_DAYS_BEFORE/AFTER days of the closest pass;
        # when two storms qualify (e.g. Frances and Jeanne, Sept. 2004), the closer date wins
        same = (dt >= -STORM_DAYS_BEFORE) & (dt <= STORM_DAYS_AFTER) & m.EVENT_TYPE.isin(STORM_CONTRIBUTES)
        m = m[same].assign(gap=dt[same].abs()).sort_values(["index", "gap"]).drop_duplicates("index")
        ev.loc[m["index"].values, "storm_sid"] = m.SID.values

    in_storm = ev.storm_sid.notna()
    absorbed = in_storm & ev.EVENT_TYPE.isin(STORM_ABSORBS)
    ev.loc[absorbed, "hazard"] = "hurricane"

    # Hurricane "events" = storms that passed near the county and left at least one damaging record there
    storm_dmg = ev[in_storm].groupby(["GEOID", "storm_sid"]).agg(damage=("damage", "sum"), any_damaging=("damaging", "max")).reset_index()
    hur = passes.merge(storm_dmg, left_on=["GEOID", "SID"], right_on=["GEOID", "storm_sid"], how="inner")
    hur = hur[hur.any_damaging]
    hur_events = pd.DataFrame({"GEOID": hur.GEOID, "hazard": "hurricane", "episode": hur.SID,
                               "year": hur.season, "month": hur.closest.dt.month, "damage": hur.damage,
                               "storm": hur.storm})

    # Other hazards: one event = one NOAA episode in that county
    counts = ev.damaging | ev.hazard.isin(COUNT_ALL_RECORDS)
    other = ev[counts & ev.hazard.notna() & (ev.hazard != "hurricane")]
    other_events = (other.groupby(["GEOID", "hazard", "EPISODE_ID"])
                    .agg(year=("year", "min"), month=("month", "min"), damage=("damage", "sum")).reset_index()
                    .rename(columns={"EPISODE_ID": "episode"}))
    # NOAA records labeled as tropical but not matched to a track (rare) still count
    lone = ev[ev.damaging & (ev.hazard == "hurricane") & ev.storm_sid.isna()]
    lone_events = (lone.groupby(["GEOID", "EPISODE_ID"]).agg(year=("year", "min"), month=("month", "min"), damage=("damage", "sum"))
                   .reset_index().rename(columns={"EPISODE_ID": "episode"}).assign(hazard="hurricane", storm=None))

    events = pd.concat([hur_events, other_events, lone_events], ignore_index=True)

    # --- Count, rank, rate ---
    rows = []
    area = counties.set_index("GEOID").ALAND_SQMI
    for hz in HAZARDS:
        win, first = WINDOW, START_YEAR
        e = events[(events.hazard == hz) & (events.year >= first) & (events.year <= LAST_YEAR)]
        cnt = e.groupby("GEOID").size().reindex(counties.GEOID, fill_value=0)
        years = e.groupby("GEOID").year.nunique().reindex(counties.GEOID, fill_value=0)
        med = e.groupby("GEOID").damage.median().reindex(counties.GEOID)
        sqmi = area.reindex(counties.GEOID).clip(lower=AREA_FLOOR_SQMI)
        measure = cnt / (sqmi / 1000) if hz in PER_AREA else cnt.astype(float)
        vals = measure.values
        order = np.sort(vals)
        pct = np.searchsorted(order, vals, side="left") / len(vals) * 100  # share of counties with fewer
        for i, g in enumerate(counties.GEOID):
            rows.append({"GEOID": g, "hazard": hz, "window_years": win, "events": int(cnt.iat[i]),
                         "measure": round(float(vals[i]), 4), "national_percentile": int(pct[i]),
                         "years_with_event": int(years.iat[i]),
                         "severity": "none" if cnt.iat[i] == 0 else severity(float(med.iat[i]))})
    ratings = pd.DataFrame(rows).merge(counties[["GEOID", "USPS", "NAME"]], on="GEOID")
    ratings.to_csv(out_dir / "county_ratings.csv", index=False)

    # --- National facts per hazard, for the website's hazard guide ---
    names = counties.set_index("GEOID")[["NAME", "USPS"]]
    types_of = {}
    for t, hz in HAZARD_OF.items():
        types_of.setdefault(hz, []).append(t)
    rec = ev[counts & ev.hazard.notna()]
    meta = {"first_year": START_YEAR, "last_year": LAST_YEAR, "counties_total": len(counties),
            "data_through": str(ev.date.max().date()), "updated": pd.Timestamp.today().strftime("%Y-%m-%d"), "hazards": {}}
    for hz in HAZARDS:
        e = events[events.hazard == hz]
        m = {"counties": int(e.GEOID.nunique()), "events": int(len(e)), "noaa_types": sorted(types_of.get(hz, [])),
             "counts": "all records" if hz in COUNT_ALL_RECORDS else "damaging records",
             "per_area": hz in PER_AREA, "by_month": [int((e.month == k).sum()) for k in range(1, 13)]}
        if hz == "hurricane" and len(hur):
            last = hur.sort_values("closest").iloc[-1]
            m["latest"] = {"date": str(last.closest.date()), "place": f"{names.at[last.GEOID, 'NAME']}, {names.at[last.GEOID, 'USPS']}", "name": last.storm}
        else:
            r = rec[rec.hazard == hz]
            if len(r):
                last = r.sort_values("date").iloc[-1]
                m["latest"] = {"date": str(last.date.date()), "place": f"{names.at[last.GEOID, 'NAME']}, {names.at[last.GEOID, 'USPS']}"}
        top = e.groupby("GEOID").size().rename("n").to_frame().join(names).groupby("USPS").n.sum().sort_values(ascending=False)
        m["top_states"] = [st for st in top.index[:3]]
        meta["hazards"][hz] = m
    (out_dir / "hazards_meta.json").write_text(json.dumps(meta, separators=(",", ":")), encoding="utf-8")

    # --- Florida slice for the report ---
    fl = counties[counties.USPS == "FL"]
    db = {"_note": "Real NOAA Storm Events and IBTrACS hurricane tracks, prepared by prepare.py. Flood claims and earthquakes not yet included.",
          "first_year": START_YEAR, "last_year": LAST_YEAR, "counties": {}}
    for _, c in fl.iterrows():
        r = ratings[ratings.GEOID == c.GEOID].set_index("hazard")
        h = {}
        for hz in HAZARDS:
            first = START_YEAR
            e = events[(events.GEOID == c.GEOID) & (events.hazard == hz) & (events.year >= first)]
            by_year = {str(y): int((e.year == y).sum()) for y in range(first, LAST_YEAR + 1)}
            by_month = [int((e.month == m).sum()) for m in range(1, 13)]
            h[hz] = [int(r.at[hz, "national_percentile"]), int(r.at[hz, "years_with_event"]), r.at[hz, "severity"], by_year, by_month]
        storms = (hur_events[hur_events.GEOID == c.GEOID].sort_values("damage", ascending=False).head(6)
                  .sort_values(["year", "month"], ascending=False))
        db["counties"][c.GEOID] = {
            "name": c.NAME, "lat": round(float(c.INTPTLAT), 4), "lon": round(float(c.INTPTLONG), 4),
            "h": h,
            "storms": [{"name": s.storm, "year": int(s.year), "month": int(s.month), "damage": float(s.damage)} for s in storms.itertuples()],
        }
    (out_dir / "florida_db.json").write_text(json.dumps(db, separators=(",", ":")), encoding="utf-8")

    # --- One file per state, same shape, for the website's state + ZIP search ---
    # earthquake and volcanic activity are not in NOAA's records; the report marks them "not yet included"
    states_dir = out_dir / "states"
    states_dir.mkdir(exist_ok=True)
    rt = ratings.set_index(["GEOID", "hazard"])
    ev_by = {k: g for k, g in events.groupby("GEOID")}
    hur_by = {k: g for k, g in hur_events.groupby("GEOID")}
    for st, grp in counties.groupby("USPS"):
        sdb = {"first_year": START_YEAR, "last_year": LAST_YEAR, "state": st, "counties": {}}
        for _, c in grp.iterrows():
            ce = ev_by.get(c.GEOID, events.iloc[0:0])
            h = {}
            for hz in HAZARDS:
                r = rt.loc[(c.GEOID, hz)]
                e = ce[ce.hazard == hz]
                by_year = {str(y): int((e.year == y).sum()) for y in range(START_YEAR, LAST_YEAR + 1)}
                by_month = [int((e.month == m).sum()) for m in range(1, 13)]
                h[hz] = [int(r.national_percentile), int(r.years_with_event), r.severity, by_year, by_month]
            hs = hur_by.get(c.GEOID)
            storms = [] if hs is None else [{"name": x.storm, "year": int(x.year), "month": int(x.month), "damage": float(x.damage)}
                       for x in hs.sort_values("damage", ascending=False).head(6).sort_values(["year", "month"], ascending=False).itertuples()]
            sdb["counties"][c.GEOID] = {"name": c.NAME, "lat": round(float(c.INTPTLAT), 4), "lon": round(float(c.INTPTLONG), 4), "h": h, "storms": storms}
        (states_dir / f"{st}.json").write_text(json.dumps(sdb, separators=(",", ":")), encoding="utf-8")

    print(f"Counties: {len(counties)}   NOAA records used: {len(ev):,}   zone records without a county match: {unmatched:.1%}")
    print(f"Storm passes found: {len(passes):,}   hurricane events (damaging): {len(hur_events):,}")
    print(f"Wrote {out_dir/'county_ratings.csv'} and {out_dir/'florida_db.json'} ({(out_dir/'florida_db.json').stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main(*sys.argv[1:5])
