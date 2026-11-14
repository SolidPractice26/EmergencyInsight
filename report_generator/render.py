"""
Emergency Insights — report renderer

What it does:
  1. Reads the property's data file (JSON) and the master hazard list.
  2. Works out the summary: score bands, top hazards, the headline sentence,
     and one detail page for each hazard above the U.S. norm.
  3. Fills every page template in /templates (Jinja2 placeholders like {{ city }}).
  4. Saves each filled page as HTML and PDF, then joins the PDFs into one report.

How to run (from this folder, in a terminal):
  pip install jinja2 playwright pypdf     (first time only)
  python -m playwright install chromium   (first time only)
  python render.py data/sample_orlando.json
"""

import json
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, StrictUndefined

HERE = Path(__file__).parent
TEMPLATES = HERE / "templates"
OUTPUT = HERE / "output"

# ── HOW THE SCORE WORKS (one place, used by every page) ──────────────────
# Each hazard is ranked only against itself: this county vs. every U.S. county,
# by recorded events per square mile over the hazard's record window.
#   national_percentile 94 = more events than 94% of U.S. counties.
# The HEADLINE is a word tier from that rank. The SUPPORT NUMBER is the same
# rank on a 0–10 scale. History only, never a forecast.

TIERS = [  # checked top to bottom; first match wins
    {"key": "very_high", "label": "Very high", "min_pct": 90, "group": "above",   "scores": "9–10"},
    {"key": "high",      "label": "High",      "min_pct": 70, "group": "above",   "scores": "7–8"},
    {"key": "moderate",  "label": "Moderate",  "min_pct": 40, "group": "average", "scores": "4–6"},
    {"key": "low",       "label": "Low",       "min_pct": 20, "group": "below",   "scores": "2–3"},
    {"key": "very_low",  "label": "Very low",  "min_pct": 0,  "group": "below",   "scores": "1"},
]
NOT_RECORDED = {"key": "none", "label": "Not recorded", "min_pct": 0, "group": "below", "scores": "0"}

GROUPS = [
    {"key": "above",   "label": "Above the U.S. norm", "meaning": "Recorded more often than in most counties"},
    {"key": "average", "label": "Around average",      "meaning": "Similar to much of the country"},
    {"key": "below",   "label": "Below or none",       "meaning": "Rare here, or never recorded"},
]

SEVERITY = {
    "major":    "Usually causes major damage",
    "moderate": "Damage varies by event",
    "minor":    "Usually minor damage",
    "none":     "",
}


# FEMA flood zone meanings (FEMA's own definitions, in plain words)
FLOOD_ZONES = {
    "A":  ("high",     "High-risk flood area",     "FEMA's Special Flood Hazard Area: a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages."),
    "AE": ("high",     "High-risk flood area",     "FEMA's Special Flood Hazard Area: a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages."),
    "AH": ("high",     "High-risk flood area",     "Shallow flooding (ponding) area with a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages."),
    "AO": ("high",     "High-risk flood area",     "Shallow sheet-flow flooding area with a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages."),
    "VE": ("high",     "High-risk coastal area",   "Coastal area with a 1% chance of flooding in any year plus storm waves. Flood insurance is required for federally backed mortgages."),
    "X500": ("moderate", "Moderate flood area",    "Between FEMA's high-risk area and the 0.2%-chance (500-year) flood line. Insurance is optional but often recommended."),
    "X":  ("low",      "Minimal flood area",       "Outside FEMA's mapped flood areas. Insurance is optional, but over 20% of flood claims come from outside high-risk zones."),
}


# Which hazards get their own detail page (by group from GROUPS above)
DETAIL_GROUPS = ["above"]
FIRST_DETAIL_PAGE = 4   # cover = 1, summary = 2, property = 3

# Data sources listed on the closing page
SOURCES = [
    {"name": "NOAA Storm Events Database", "owner": "NOAA NCEI",
     "use": "Damaging weather events by type, date and county", "level": "County / forecast zone"},
    {"name": "OpenFEMA NFIP Claims", "owner": "FEMA",
     "use": "Flood insurance claims by year", "level": "Census tract"},
    {"name": "National Flood Hazard Layer", "owner": "FEMA",
     "use": "Official flood zone for the property", "level": "Parcel"},
    {"name": "National Risk Index", "owner": "FEMA",
     "use": "The list of 18 hazards and a cross-check of results", "level": "County / census tract"},
    {"name": "Earthquake Catalog", "owner": "U.S. Geological Survey",
     "use": "Recorded earthquakes", "level": "Point location"},
    {"name": "Census Geocoder", "owner": "U.S. Census Bureau",
     "use": "Address to coordinates, county and tract", "level": "Address"},
]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def bar_chart(labels, values, width=600, height=72, gap=4, tick=lambda i, label: True,
              label_min=None) -> dict:
    """Geometry for a simple bar chart (SVG units). Used by every chart in the report."""
    top = max(values) or 1
    if label_min is None:
        label_min = max(1, top * 0.15)
    bar_w = (width - gap * (len(values) - 1)) / len(values)
    bars = []
    for i, (lab, v) in enumerate(zip(labels, values)):
        h = 0 if v == 0 else max(2, v / top * height)
        bars.append({"label": lab, "value": v, "x": round(i * (bar_w + gap), 2),
                     "y": round(height - h, 2), "w": round(bar_w, 2), "h": round(h, 2),
                     "show_value": v > 0 and v >= label_min, "tick": tick(i, lab), "peak": v == top and v > 0})
    return {"bars": bars, "width": width, "height": height, "total": sum(values),
            "peak": max(zip(values, labels)), "first": labels[0], "last": labels[-1],
            "nonzero": sum(1 for v in values if v > 0)}


def flood_bars(by_year: dict) -> dict:
    years = sorted(by_year)
    chart = bar_chart(years, [int(by_year[y]) for y in years], label_min=None,
                      tick=lambda i, y: int(y) % 5 == 0 or i in (0, len(years) - 1))
    chart["years_with_claims"] = chart["nonzero"]
    return chart


def peak_season(by_month: list) -> str:
    """The 3 calendar months in a row with the most events, e.g. 'Aug–Oct'."""
    if sum(by_month) == 0:
        return "No clear season"
    best = max(range(12), key=lambda i: sum(by_month[(i + k) % 12] for k in range(3)))
    share = round(100 * sum(by_month[(best + k) % 12] for k in range(3)) / sum(by_month))
    return f"{MONTHS[best]}–{MONTHS[(best + 2) % 12]} ({share}% of events)"


def tier_for(percentile: int, years_with_event: int) -> dict:
    if years_with_event == 0:
        return NOT_RECORDED
    for tier in TIERS:
        if percentile >= tier["min_pct"]:
            return tier
    raise ValueError(f"Percentile {percentile} is outside 0–100")


def history_line(years: int, window: int) -> str:
    if years == 0:
        return f"No damaging events in {window} years"
    if years == window:
        return f"Recorded every year for {window} years"
    return f"Recorded in {years} of the last {window} years"


def rank_line(percentile: int, years: int) -> str:
    if years == 0:
        return "No events on record here"
    if percentile >= 50:
        return f"More events than {percentile}% of U.S. counties"
    return f"Fewer events than {100 - percentile}% of U.S. counties"


def join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def prepare(data: dict, library: dict) -> dict:
    """Add everything the pages need that is calculated, not typed."""
    hazards = []
    for h in library["hazards"]:
        if h["id"] not in data["history"]:
            raise KeyError(f"No history for hazard '{h['id']}' in the data file")
        rec = data["history"][h["id"]]
        pct, years, window = int(rec["national_percentile"]), int(rec["years_with_event"]), h["window_years"]
        hazards.append({
            **h,
            "percentile": pct,
            "years_with_event": years,
            "score": 0 if years == 0 else max(1, pct // 10),  # support number, 0–10 (whole tens, so it always matches the word)
            "tier": tier_for(pct, years),                     # headline word
            "history_line": history_line(years, window),
            "rank_line": rank_line(pct, years),
            "severity_line": SEVERITY[rec["severity"]],
            "severity": rec["severity"],
        })

    # Highest national rank first; ties in alphabetical order
    hazards.sort(key=lambda h: (-h["percentile"], -h["years_with_event"], h["name"]))

    counts = {g["key"]: sum(1 for h in hazards if h["tier"]["group"] == g["key"]) for g in GROUPS}
    above = [h for h in hazards if h["tier"]["group"] == "above"]

    if above:
        names = join_names([h["name"] for h in above])
        verb = "has" if len(above) == 1 else "have"
        headline = f"{names} {verb} been recorded here more often than in most of the U.S."
    else:
        headline = "No hazard has been recorded here more often than in most of the U.S."

    zone_code = data["property"]["flood_zone"]
    level, zone_title, zone_text = FLOOD_ZONES[zone_code]

    # Page 3 wording depends on who the report is for
    audiences = json.loads((HERE / "data" / "audiences.json").read_text(encoding="utf-8"))["audiences"]
    if data["audience"] not in audiences:
        raise KeyError(f"audience must be one of {list(audiences)}, not '{data['audience']}'")
    aud = audiences[data["audience"]]
    in_high = level == "high"
    checklist = [
        {"bold": c["bold"].replace("{zone}", zone_code), "text": c["text"].replace("{zone}", zone_code)}
        for c in aud["checklist"]
        if c.get("zone") is None or (c["zone"] == "high") == in_high
    ]
    claims = flood_bars(data["flood_claims"]["by_year"])
    lead = (f"This property sits in FEMA flood zone {zone_code} ({zone_title.lower()}). "
            f"Homes in {data['flood_claims']['area_label']} filed {claims['total']} flood insurance claims "
            f"from {claims['first']} to {claims['last']}, the most in {claims['peak'][1]} ({claims['peak'][0]}).")

    details = []
    for h in hazards:
        if h["tier"]["group"] not in DETAIL_GROUPS:
            continue
        if "detail" not in h:
            raise KeyError(f"'{h['name']}' needs a detail page but has no 'detail' text in hazards.json")
        dd = data["detail_data"][h["id"]]
        years = sorted(dd["by_year"])
        values = [int(dd["by_year"][y]) for y in years]
        if sum(values) != sum(dd["by_month"]):
            raise ValueError(f"{h['name']}: events by year ({sum(values)}) and by month ({sum(dd['by_month'])}) must add up to the same total")
        if len(years) != h["window_years"]:
            raise ValueError(f"{h['name']}: expected {h['window_years']} years of data, got {len(years)}")
        step = 5 if len(years) > 12 else 1
        details.append({
            **h,
            "page_num": FIRST_DETAIL_PAGE + len(details),
            "yearly": bar_chart(years, values, width=300, height=95, gap=2 if len(years) > 12 else 4,
                                label_min=max(values) if len(years) > 12 else None,
                                tick=lambda i, y, n=len(years), st=step: (int(y) % st == 0) or i in (0, n - 1)),
            "monthly": bar_chart(MONTHS, [int(v) for v in dd["by_month"]], width=300, height=95, gap=4,
                                 tick=lambda i, m: True),
            "events": [e for e in data.get("events", []) if h["name"] in e["hazards"]],
            "season": peak_season(dd["by_month"]),
            "event_total": sum(values),
            "window_first": years[0], "window_last": years[-1],
        })

    return {
        **data,
        "details": details,
        "closing_page_num": FIRST_DETAIL_PAGE + len(details),
        "sources": SOURCES,
        "tier_table": [
            {**t, "pct_range": f"{t['min_pct']}–{(TIERS[i - 1]['min_pct'] - 1) if i else 100}%"}
            for i, t in enumerate(TIERS)
        ] + [{**NOT_RECORDED, "pct_range": "No events on record"}],
        "flood_zone": {"code": zone_code, "level": level, "title": zone_title, "text": zone_text},
        "audience_info": {**aud, "checklist": checklist},
        "claims": claims,
        "property_lead": lead,
        "hazards": hazards,
        "recorded": [h for h in hazards if h["years_with_event"] > 0],
        "not_recorded": [h for h in hazards if h["years_with_event"] == 0],
        "join_names": join_names,
        "top_hazards": above[:3] if above else hazards[:3],
        "group_counts": counts,
        "groups": GROUPS,
        "tiers": TIERS + [NOT_RECORDED],
        "headline": headline,
        "assets_path": data.get("assets_path", "../assets"),
    }


def main():
    data_file = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "data" / "sample_orlando.json"
    data = json.loads(data_file.read_text(encoding="utf-8"))
    library = json.loads((HERE / "data" / "hazards.json").read_text(encoding="utf-8"))
    context = prepare(data, library)

    env = Environment(loader=FileSystemLoader(TEMPLATES), undefined=StrictUndefined, autoescape=True)
    OUTPUT.mkdir(exist_ok=True)

    html_files = []
    for template in sorted(TEMPLATES.glob("*.html")):
        out = OUTPUT / template.name
        out.write_text(env.get_template(template.name).render(**context), encoding="utf-8")
        html_files.append(out)
        print(f"Wrote {out.relative_to(HERE)}")

    make_pdfs(html_files)


def make_pdfs(html_files):
    """Print each page to PDF with a headless browser, then join them."""
    try:
        from playwright.sync_api import sync_playwright
        from pypdf import PdfWriter
    except ImportError:
        print("Skipping PDF: run 'pip install playwright pypdf' to enable it.")
        return

    pdf_files = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        for html in html_files:
            page.goto(html.resolve().as_uri())
            page.wait_for_load_state("networkidle")
            pdf = html.with_suffix(".pdf")
            page.pdf(path=str(pdf), format="A4", print_background=True)
            pdf_files.append(pdf)
        browser.close()

    writer = PdfWriter()
    for pdf in pdf_files:
        writer.append(str(pdf))
    report = OUTPUT / "report.pdf"
    with open(report, "wb") as f:
        writer.write(f)
    print(f"Wrote {report.relative_to(HERE)} ({len(writer.pages)} pages)")


if __name__ == "__main__":
    main()
