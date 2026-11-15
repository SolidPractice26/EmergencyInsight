# Emergency Insights

Emergency Insights turns public weather and disaster records for an address into a plain-English hazard history report (PDF).
The report is for people buying, renting or already living in a home.

It shows **what has happened**, not what will happen, and leaves the interpretation to the reader. Each hazard gets two plain facts:
- how many years had damaging events since 2016 (for example "3 of 10 years"), with one square per year;
- how often it was recorded here compared with every U.S. county (for example "more often than in 89% of U.S. counties").

There are no scores. Every hazard uses the same window, starting in 2016; the start year stays fixed, so the window grows by one year with each yearly update.
A hazard is called "above the U.S. norm" only if it was recorded in at least 3 different years.

> Status: private prototype. The Florida data is real. Report generation runs on demand.
> See "Known limits" before trusting any single number.

---

## How the pieces fit

```
 ONCE A YEAR                                        PER REPORT
 ───────────                                        ──────────
 fetch_data.py   download public records            address
      │                                               │  geocode (Census)  → county + location
      ▼                                               │  flood zone (FEMA) → zone (AE, X, …)
 prepare.py      rank every U.S. county               ▼
      │                                          report data file (JSON)
      ▼                                               │
 data/processed/ county_ratings.csv ───────────────►  render.py + templates
                 florida_db.json                      │
                                                      ▼
                                                  report.pdf
```

The heavy work happens once a year and produces a small table.
After that, each report is a quick lookup plus filling in a fixed template, with no AI involved.

## Folders

| Folder | What it is |
|---|---|
| `data_pipeline/` | `fetch_data.py` downloads the raw records. `prepare.py` turns them into ratings. All the rules (which NOAA event counts as which hazard, how hurricanes are matched, and so on) are written at the top of `prepare.py` in plain language. |
| `data/processed/` | The output: ratings for every U.S. county (`county_ratings.csv`), the Florida slice (`florida_db.json`) and 10 Florida test addresses with flood zones (`fl_addresses.json`). The website's per-state files (`states/XX.json`, county data; `zips/XX.json`, ZIP code → county, from the Census ZIP-county table) are written here and copied to `deploy/ei/data/` (not stored twice in the repository). |
| `report_generator/` | *(Out of date: still uses the old 0–10 scores. The browser version in `deploy/ei/lab.js` is current.)*  `render.py` fills the HTML templates in `templates/` with a report data file and prints them to PDF. `data/hazards.json` holds the hazard wording, and `data/audiences.json` holds the buyer, renter and resident checklists. |
| `deploy/ei/` | **The website** (the one source for it), published at `javierarocha.me/ei`. `index.html` is the page, `site.js` runs the site, `lab.js` builds reports and PDFs in the browser from `data/florida_db.json`. The Test lab is at `#lab` (not in the menu). The earlier claude.ai artifact copy is frozen and no longer updated. |
| `docs/` | A sample report. |

## Running it

Requires Python 3.10+.

```bash
# 1. Yearly data refresh (downloads about 1 GB of raw files; takes a few minutes)
pip install -r data_pipeline/requirements.txt
python data_pipeline/fetch_data.py raw
python data_pipeline/prepare.py raw/noaa_all.parquet raw/ibtracs_NA.csv raw/2024_Gaz_counties_national.txt data/processed
python data_pipeline/build_zips.py raw/zcta_county.txt raw/2024_Gaz_counties_national.txt data/processed
python data_pipeline/build_declarations.py raw/fema_declarations.csv data/processed
cp -r data/processed/states data/processed/zips deploy/ei/data/

# 2. Build the sample report
pip install -r report_generator/requirements.txt
playwright install chromium
cd report_generator && python render.py      # writes output/report.pdf
```

Raw downloads (`raw/`) are not stored in the repository. They can always be downloaded again.

## Data sources (all U.S. public domain)

- **NOAA Storm Events Database.** Downloaded from 1996; the report uses 2016–2025.
- **NOAA IBTrACS.** Hurricane and tropical storm tracks, used to tell which storm caused which records.
- **U.S. Census Gazetteer.** County land area and center points.
- **OpenFEMA Disaster Declarations.** Every federal disaster, emergency and fire declaration by county (natural hazards only, 2016–2025), shown on page 3.
- **U.S. Census Geocoder.** Address → county.
- **U.S. Census ZCTA–county relationship file (2020).** ZIP code → county.
- **FEMA National Flood Hazard Layer.** Address → flood zone.

## Known limits (to fix later)

- **Tornadoes:** counts favor places with more spotters. Weighting by EF scale would help.
- **Rare hazards:** one or two events can rank a county high; the 3-year rule keeps these out of the headline, but the comparison still shows them.
- **Connecticut:** NOAA and the Census ZIP table still use the 8 old counties, so Connecticut uses the 2020 county list.
- **Alaska:** about half the boroughs have no matched records (zone names don't match borough names).
- **Zone records:** about 17.5% of NOAA "zone" records are not yet matched to a county nationally. The NWS zone–county file fixes this.
- **Severity:** the flag is rough (median damage per event).
- **Not yet included:** FEMA flood insurance claims and USGS earthquakes.
