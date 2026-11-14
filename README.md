# Emergency Insights

Emergency Insights turns public weather and disaster records for an address into a plain-English hazard history report (PDF).
The report is for people buying, renting or already living in a home.

It shows **what has happened**, not what will happen. Each hazard gets:
- a rating word (Very high to Very low), with a supporting score from 0 to 10;
- a history line, such as "Recorded in 7 of the last 10 years";
- a severity flag, based on the typical damage per event.

Ratings compare the county with every U.S. county.

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
| `data/processed/` | The output: ratings for all 3,144 U.S. counties (`county_ratings.csv`), the Florida slice the website uses (`florida_db.json`), 10 test addresses with their real flood zones (`fl_addresses.json`), and a Florida ZIP code → county table (`fl_zips.json`, from the Census ZIP-county relationship file; a ZIP that spans counties uses the one with the most land). |
| `report_generator/` | `render.py` fills the HTML templates in `templates/` with a report data file and prints them to PDF. `data/hazards.json` holds the hazard wording, and `data/audiences.json` holds the buyer, renter and resident checklists. |
| `website/` | The prototype website, including the Test lab that builds reports in the browser from `florida_db.json`. |
| `deploy/ei/` | The same website as a normal stand-alone page, ready to copy into the portfolio site as `javierarocha.me/ei`. |
| `docs/` | A sample report. |

## Running it

Requires Python 3.10+.

```bash
# 1. Yearly data refresh (downloads about 1 GB of raw files; takes a few minutes)
pip install -r data_pipeline/requirements.txt
python data_pipeline/fetch_data.py raw
python data_pipeline/prepare.py raw/noaa_all.parquet raw/ibtracs_NA.csv raw/2024_Gaz_counties_national.txt data/processed
cp data/processed/florida_db.json website/data/

# 2. Build the sample report
pip install -r report_generator/requirements.txt
playwright install chromium
cd report_generator && python render.py      # writes output/report.pdf
```

Raw downloads (`raw/`) are not stored in the repository. They can always be downloaded again.

## Data sources (all U.S. public domain)

- **NOAA Storm Events Database, 1996–2025.** About 1.8 million records of damaging and notable weather.
- **NOAA IBTrACS.** Hurricane and tropical storm tracks, used to tell which storm caused which records.
- **U.S. Census Gazetteer.** County land area and center points.
- **U.S. Census Geocoder.** Address → county.
- **U.S. Census ZCTA–county relationship file (2020).** ZIP code → county.
- **FEMA National Flood Hazard Layer.** Address → flood zone.

## Known limits (to fix later)

- **Same-month storms:** two storms in the same month are merged (for example, Jeanne 2004 is missing for some counties).
- **Tornadoes:** counts favor places with more spotters. Weighting by EF scale would help.
- **Rare hazards:** a single event can push a county high.
- **Zone records:** about 17.5% of NOAA "zone" records are not yet matched to a county nationally. The NWS zone–county file fixes this.
- **Severity:** the flag is rough (median damage per event).
- **Not yet included:** FEMA flood insurance claims and USGS earthquakes.
