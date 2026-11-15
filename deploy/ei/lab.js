/* ================= TEST LAB =================
   Everything below is made-up data, shaped like the real system:
   ADDRESSES stands in for the Census geocoder and FEMA flood maps,
   COUNTIES stands in for the yearly database, and buildDataFile + the page
   functions mirror render.py and its templates. */
(() => {
  const END_YEAR = 2025, FIRST_YEAR = 2016;  // one record window for every hazard; it grows each year
  const WIN = END_YEAR - FIRST_YEAR + 1;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // ---- Master hazard list (id, name; the third number is no longer used: every hazard uses WIN years) ----
  const HAZARDS = [
    ['avalanche','Avalanche',30],['coastal_flooding','Coastal Flooding',30],['cold_wave','Cold Wave',10],
    ['drought','Drought',10],['earthquake','Earthquake',30],['hail','Hail',10],['heat_wave','Heat Wave',10],
    ['hurricane','Hurricane',30],['ice_storm','Ice Storm',10],['landslide','Landslide',30],['lightning','Lightning',10],
    ['riverine_flooding','Riverine Flooding',10],['strong_wind','Strong Wind',10],['tornado','Tornado',30],
    ['tsunami','Tsunami',30],['volcanic_activity','Volcanic Activity',30],['wildfire','Wildfire',30],['winter_weather','Winter Weather',10]
  ].map(([id, name]) => ({ id, name, win: WIN }));

  // ---- Detail-page text for hazards that can get their own page ----
  const DETAIL = {
    hurricane: { what: 'A tropical storm with sustained winds of 74 mph or more, bringing damaging wind, spin-off tornadoes and heavy rain.', ins: 'Homeowners policies in hurricane-prone states usually carry a separate hurricane deductible, often a percentage of the insured value. Flood damage needs a separate flood policy.' },
    riverine_flooding: { what: 'Flooding from heavy rain when rivers, lakes, canals and storm drains overflow. In flat, low areas water can sit for days.', ins: 'Homeowners and renters insurance do not cover flood. National Flood Insurance Program policies usually take 30 days to start.' },
    coastal_flooding: { what: 'Seawater pushed onto land by storm surge, high tides or onshore winds, often during hurricanes and tropical storms.', ins: 'Storm surge is flood damage: it needs a separate flood policy. Homes in zones starting with V face the highest flood insurance rates.' },
    strong_wind: { what: 'Damaging straight-line winds from thunderstorms, separate from hurricanes and tornadoes. They bring down trees and power lines with little warning.', ins: 'Thunderstorm wind damage is usually covered by standard homeowners insurance under the regular deductible.' },
    tornado: { what: 'A rotating column of air reaching from a thunderstorm to the ground.', ins: 'Tornado damage is usually covered by standard homeowners insurance as wind damage.' },
    lightning: { what: 'Strikes from thunderstorms that can start fires and damage roofs, wiring and electronics.', ins: 'Fire and lightning damage are usually covered by homeowners insurance; check limits for electronics.' },
    heat_wave: { what: 'A stretch of unusually hot weather, often with high humidity, that strains people, pets and air conditioning.', ins: 'Heat itself is rarely an insurance event; power outages and A/C failures are the usual costs.' },
    wildfire: { what: 'Uncontrolled fires in brush, grass, pine flatwoods or wetlands, most common in dry spring months.', ins: 'Fire damage is usually covered by homeowners insurance; check that coverage limits match rebuilding costs.' },
    hail: { what: 'Balls of ice that fall during strong thunderstorms, damaging roofs, windows, cars and crops.', ins: 'Hail damage is usually covered by homeowners insurance; some policies have a separate wind and hail deductible.' },
    drought: { what: 'A long stretch of below-normal rain that dries out soil, lawns and water supplies, and raises wildfire danger.', ins: 'Drought itself is rarely an insurance event; foundation movement from dry soil is often excluded.' },
    cold_wave: { what: 'A stretch of unusually cold temperatures, with hard freezes that can burst pipes and damage plants.', ins: 'Burst pipes from a freeze are often covered if the home was heated; damage to plants and outdoor items usually is not.' },
    winter_weather: { what: 'Snow, sleet and freezing rain that make roads dangerous and can bring down power lines.', ins: 'Weight of snow and ice is usually covered by homeowners insurance.' },
    ice_storm: { what: 'Freezing rain that coats trees, roads and power lines in ice, often causing long outages.', ins: 'Damage from falling ice-laden trees is usually covered by homeowners insurance.' },
    landslide: { what: 'Soil or rock sliding down a slope or collapsing, often after very heavy rain.', ins: 'Standard homeowners policies usually exclude earth movement; separate coverage may be needed.' },
    tsunami: { what: 'Ocean waves set off by undersea earthquakes or landslides.', ins: 'Tsunami damage is generally treated as flood and needs a flood policy.' },
    avalanche: { what: 'A mass of snow sliding down a mountain slope.', ins: 'Check with an agent; coverage varies.' },
    earthquake: { what: 'Sudden shaking of the ground from movement along a fault.', ins: 'Standard homeowners policies usually exclude earthquakes; separate coverage is needed.' },
    volcanic_activity: { what: 'Eruptions, ash and lava from active volcanoes.', ins: 'Check with an agent; coverage varies.' }
  };

  // Month weights for when each hazard tends to happen (Jan..Dec)
  const SEASON = {
    hurricane: [0,0,0,0,0,1,1,4,8,4,1,0], coastal_flooding: [1,1,1,1,1,2,2,4,7,5,2,1],
    riverine_flooding: [1,1,1,1,2,5,5,5,6,2,1,1], strong_wind: [1,2,4,5,5,7,7,6,3,2,2,2],
    tornado: [2,3,4,4,3,3,2,2,3,2,2,2], lightning: [0,0,1,2,4,8,9,8,4,1,0,0], heat_wave: [0,0,0,1,4,8,9,8,4,1,0,0],
    hail: [1,2,4,5,4,2,1,1,1,1,1,1], cold_wave: [5,4,1,0,0,0,0,0,0,0,2,4], winter_weather: [5,4,1,0,0,0,0,0,0,0,1,4],
    ice_storm: [5,4,1,0,0,0,0,0,0,0,1,4], drought: [2,3,4,5,5,2,1,1,1,2,2,2], wildfire: [2,3,5,5,4,2,1,1,1,1,1,1]
  };

  // ---- The made-up database: one row per county per hazard [percentile, years with events, severity] ----
  const COUNTIES = {
    '12095': { name: 'Orange County', code: 'ORA', h: { hurricane: [94,14,'major'], riverine_flooding: [86,9,'moderate'], strong_wind: [78,10,'moderate'], lightning: [65,10,'minor'], heat_wave: [55,7,'minor'], wildfire: [45,6,'moderate'], tornado: [30,9,'major'], hail: [25,4,'minor'], cold_wave: [20,2,'minor'], drought: [15,3,'minor'], ice_storm: [8,1,'minor'], winter_weather: [5,1,'minor'] },
      storms: [['Oct 2024','Hurricane Milton',['Hurricane'],'Strong winds, tornadoes and widespread power outages.'],['Sep 2022','Hurricane Ian',['Hurricane','Riverine Flooding'],'Record rainfall flooded neighborhoods across the county.'],['Sep 2017','Hurricane Irma',['Hurricane'],'Hurricane-force gusts, downed trees and long outages.'],['Aug 2008','Tropical Storm Fay',['Riverine Flooding'],'Days of rain flooded low-lying streets and ponds.'],['Aug 2004','Hurricane Charley',['Hurricane'],'Hurricane-force winds and roof damage across the area.']] },
    '12086': { name: 'Miami-Dade County', code: 'MIA', h: { hurricane: [97,12,'major'], coastal_flooding: [92,8,'major'], riverine_flooding: [88,9,'moderate'], heat_wave: [74,8,'moderate'], lightning: [68,10,'minor'], strong_wind: [62,9,'moderate'], tornado: [35,7,'moderate'], wildfire: [30,4,'moderate'], drought: [25,3,'minor'], hail: [10,2,'minor'], cold_wave: [5,1,'minor'] },
      storms: [['Nov 2020','Tropical Storm Eta',['Riverine Flooding'],'Heavy rain flooded streets and neighborhoods for days.'],['Sep 2017','Hurricane Irma',['Hurricane','Coastal Flooding'],'Storm surge flooded coastal streets; long power outages.'],['Oct 2005','Hurricane Wilma',['Hurricane'],'Widespread wind damage and power outages.'],['Aug 2005','Hurricane Katrina',['Hurricane'],'Made landfall nearby; flooding rain and wind damage.']] },
    '12103': { name: 'Pinellas County', code: 'PIN', h: { coastal_flooding: [96,9,'major'], hurricane: [91,11,'major'], lightning: [84,10,'minor'], riverine_flooding: [72,8,'moderate'], strong_wind: [60,9,'moderate'], heat_wave: [45,6,'minor'], tornado: [40,8,'moderate'], hail: [20,3,'minor'], drought: [18,3,'minor'], wildfire: [15,2,'minor'], cold_wave: [10,1,'minor'] },
      storms: [['Oct 2024','Hurricane Milton',['Hurricane'],'Damaging winds, tornadoes and widespread outages.'],['Sep 2024','Hurricane Helene',['Coastal Flooding','Hurricane'],'Record storm surge flooded coastal neighborhoods.'],['Aug 2023','Hurricane Idalia',['Coastal Flooding'],'Storm surge flooded low-lying coastal streets.'],['Sep 2017','Hurricane Irma',['Hurricane'],'Wind damage, downed trees and long outages.']] },
    '12073': { name: 'Leon County', code: 'LEO', h: { tornado: [81,10,'major'], strong_wind: [76,10,'moderate'], hurricane: [71,9,'major'], lightning: [58,9,'minor'], hail: [55,6,'minor'], riverine_flooding: [52,7,'moderate'], heat_wave: [48,6,'minor'], cold_wave: [44,4,'minor'], drought: [40,4,'minor'], wildfire: [35,4,'moderate'], winter_weather: [25,2,'minor'], ice_storm: [22,2,'moderate'] },
      storms: [['Aug 2023','Hurricane Idalia',['Hurricane'],'Passed just east of the county with wind damage.'],['Oct 2018','Hurricane Michael',['Hurricane','Strong Wind'],'Widespread tree damage and long power outages.'],['Sep 2016','Hurricane Hermine',['Hurricane'],'Downed trees and outages across Tallahassee.']] }
  };

  // ---- Stand-in for the geocoder + flood map lookup ----
  const ADDRESSES = [
    { id: 'a1', line1: '1250 Example Lane', city: 'Orlando', zip: '32817', fips: '12095', tract: '167.31', zone: 'AE', lat: 28.5600, lon: -81.2300 },
    { id: 'a2', line1: '410 Sample Court', city: 'Winter Park', zip: '32789', fips: '12095', tract: '157.02', zone: 'X', lat: 28.6000, lon: -81.3390 },
    { id: 'a3', line1: '88 Demo Avenue', city: 'Miami', zip: '33133', fips: '12086', tract: '68.01', zone: 'AE', lat: 25.7280, lon: -80.2380 },
    { id: 'a4', line1: '2200 Test Boulevard', city: 'St. Petersburg', zip: '33705', fips: '12103', tract: '218.00', zone: 'VE', lat: 27.7400, lon: -82.6400 },
    { id: 'a5', line1: '900 Placeholder Road', city: 'Clearwater', zip: '33755', fips: '12103', tract: '263.03', zone: 'X500', lat: 27.9800, lon: -82.7800 },
    { id: 'a6', line1: '15 Mock Street', city: 'Tallahassee', zip: '32301', fips: '12073', tract: '10.02', zone: 'X', lat: 30.4380, lon: -84.2800 }
  ];

  // ---- Rules (same as render.py) ----
  const TIERS = [
    { key: 'very_high', label: 'Very high', min: 90, group: 'above', scores: '9–10', color: '#B03A2E' },
    { key: 'high', label: 'High', min: 70, group: 'above', scores: '7–8', color: '#DB6B3C' },
    { key: 'moderate', label: 'Moderate', min: 40, group: 'average', scores: '4–6', color: '#D9A02B' },
    { key: 'low', label: 'Low', min: 20, group: 'below', scores: '2–3', color: '#7BAFD4' },
    { key: 'very_low', label: 'Very low', min: 0, group: 'below', scores: '1', color: '#A9C8E0' }
  ];
  const NONE = { key: 'none', label: 'Not recorded', group: 'below', scores: '0', color: '#C5CDD5' };
  const GROUPS = [
    { key: 'above', label: 'Above the U.S. norm', meaning: 'Recorded more often than in most counties', color: '#B03A2E' },
    { key: 'average', label: 'Around average', meaning: 'Similar to much of the country, or recorded only once or twice', color: '#B7841C' },
    { key: 'below', label: 'Below or none', meaning: 'Rare here, or never recorded', color: '#003366' }
  ];
  const SEVERITY = { major: 'Usually causes major damage', moderate: 'Damage varies by event', minor: 'Usually minor damage', none: '' };
  const ZONES = {
    AE: ['high', 'High-risk flood area', "FEMA's Special Flood Hazard Area: a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages."],
    VE: ['high', 'High-risk coastal area', 'Coastal area with a 1% chance of flooding in any year plus storm waves. Flood insurance is required for federally backed mortgages.'],
    X500: ['moderate', 'Moderate flood area', "Between FEMA's high-risk area and the 0.2%-chance (500-year) flood line. Insurance is optional but often recommended."],
    A: ['high', 'High-risk flood area', "FEMA's Special Flood Hazard Area: a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages."],
    AH: ['high', 'High-risk flood area', 'Shallow ponding area with a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages.'],
    AO: ['high', 'High-risk flood area', 'Shallow sheet-flow area with a 1% chance of flooding in any year. Flood insurance is required for federally backed mortgages.'],
    V: ['high', 'High-risk coastal area', 'Coastal area with a 1% chance of flooding in any year plus storm waves. Flood insurance is required for federally backed mortgages.'],
    X: ['low', 'Minimal flood area', "Outside FEMA's mapped flood areas. Insurance is optional, but over 20% of flood claims come from outside high-risk zones."]
  };
  const AUD = {
    buying: { title: 'Know Before You Buy', checkTitle: 'Before you sign', checks: [
      ['high', 'Get a flood insurance quote now.', 'Required for most mortgages in zone {z}; it can change what you can afford.'],
      ['other', 'Get a flood insurance quote.', 'Optional here, but often inexpensive outside high-risk zones.'],
      [null, 'Ask for the elevation certificate.', 'It shows how high the home sits relative to expected flood levels.'],
      [null, 'Ask the seller about past flooding', 'and any insurance claims on the home.'],
      [null, 'Check roof age and storm protection', '(shutters, impact windows, roof straps).'],
      [null, 'Know your evacuation zone', 'and route from the county emergency office.']] },
    renting: { title: 'Know Before You Sign the Lease', checkTitle: 'Before you sign the lease', checks: [
      [null, "Renter's insurance does not cover flood.", 'Ask about a contents-only flood policy through the National Flood Insurance Program.'],
      [null, 'Ask the landlord about past flooding', 'in the unit, the building and the parking lot.'],
      ['high', 'This home is in high-risk zone {z}.', 'Ask whether the ground-floor units have flooded before.'],
      [null, 'Ask who handles storm prep', 'such as shutters, drains and generators.'],
      [null, 'Photograph your belongings', 'when you move in; it makes insurance claims easier.'],
      [null, 'Know your evacuation zone', 'and route from the county emergency office.']] },
    living: { title: 'What Your Home Has Been Through', checkTitle: 'Worth checking', checks: [
      [null, 'Review your insurance policy.', 'Check whether flood is covered and how your hurricane deductible works.'],
      ['high', 'You are in high-risk zone {z}.', "If you don't have flood insurance, it is worth getting a quote."],
      ['other', 'Flood insurance is optional here,', 'but often inexpensive outside high-risk zones.'],
      [null, 'Find your elevation certificate.', 'It is often in your closing documents or available from the county.'],
      [null, 'Clear gutters and storm drains', 'before the summer rainy season.'],
      [null, 'Know your evacuation zone', 'and route from the county emergency office.']] }
  };

  // ---- Helpers ----
  function rng(seed) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    let a = h >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const monthOf = d => MONTHS.indexOf(d.slice(0, 3));
  const yearOf = d => Number(d.slice(-4));
  function pickMonth(r, weights) {
    const w = weights || [1,1,1,1,1,1,1,1,1,1,1,1]; const tot = w.reduce((a, b) => a + b, 0);
    let x = r() * tot; for (let i = 0; i < 12; i++) { x -= w[i]; if (x < 0) return i; } return 11;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const join = a => a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

  // Made-up yearly and monthly events for one hazard in one county (yearly and monthly totals always match)
  function eventHistory(fips, hz, rec, storms) {
    const start = END_YEAR - hz.win + 1;
    const r = rng(fips + hz.id);
    const stormYears = storms.filter(s => s.hazards.includes(hz.name) && s.year >= start);
    const chosen = new Map();
    stormYears.slice(0, rec[1]).forEach(s => chosen.set(s.year, s.month));
    let guard = 0;
    while (chosen.size < rec[1] && guard++ < 500) { const y = start + Math.floor(r() * hz.win); if (!chosen.has(y)) chosen.set(y, null); }
    const byYear = {}, byMonth = new Array(12).fill(0);
    for (let y = start; y <= END_YEAR; y++) {
      if (!chosen.has(y)) { byYear[y] = 0; continue; }
      const n = 1 + Math.floor(r() * (hz.win === 10 ? 3 : 1.6));
      byYear[y] = n;
      for (let k = 0; k < n; k++) {
        const m = (k === 0 && chosen.get(y) !== null) ? chosen.get(y) : pickMonth(r, SEASON[hz.id]);
        byMonth[m] += 1;
      }
    }
    return { byYear, byMonth };
  }

  function tractClaims(addr, storms, level) {
    const r = rng('claims' + addr.id);
    const mult = level === 'high' ? 1 : level === 'moderate' ? 0.45 : 0.15;
    const out = {};
    for (let y = 1996; y <= END_YEAR; y++) {
      let v = r() < 0.12 ? 1 : 0;
      storms.filter(s => s.year === y && s.hazards.some(h => /Flood|Hurricane/.test(h)))
        .forEach(() => { v += Math.round((5 + r() * 18) * mult); });
      out[y] = v;
    }
    return out;
  }

  // ---- STEP 1: find the address ----
  function stepGeocode(addrId) {
    const a = ADDRESSES.find(x => x.id === addrId);
    const c = COUNTIES[a.fips];
    return { address: a.line1, city: a.city, state: 'FL', zip: a.zip, county: c.name, county_fips: a.fips, census_tract: a.tract, latitude: a.lat, longitude: a.lon, flood_zone: a.zone, _addrId: a.id };
  }

  // ---- STEP 2: look up the database ----
  function stepLookup(loc) {
    const c = COUNTIES[loc.county_fips];
    const storms = c.storms.map(([date, name, hazards, summary]) => ({ date, name, hazards, summary, year: yearOf(date), month: monthOf(date) }));
    const rows = HAZARDS.map(hz => {
      const rec = c.h[hz.id] || [0, 0, 'none'];
      const hist = eventHistory(loc.county_fips, hz, rec, storms);
      return { hazard: hz.id, national_percentile: rec[0], years_with_event: rec[1], severity: rec[2], events_by_year: hist.byYear, events_by_month: hist.byMonth };
    });
    const level = ZONES[loc.flood_zone][0];
    const addr = ADDRESSES.find(x => x.id === loc._addrId);
    return { county_rows: rows, tract_flood_claims: tractClaims(addr, storms, level), storms };
  }

  // ---- STEP 3: write the data file ----
  // A hazard counts as above the U.S. norm only if it was recorded in at least MIN_YEARS_ABOVE different years;
  // one or two events can rank a county high when most counties have none, which reads as misleading.
  const MIN_YEARS_ABOVE = 3;
  function tierFor(p, years) {
    if (years === 0) return NONE;
    const t = TIERS.find(t => p >= t.min);
    return t.group === 'above' && years < MIN_YEARS_ABOVE ? TIERS[2] : t;
  }
  const COUNT_ALL = ['heat_wave', 'cold_wave', 'drought', 'coastal_flooding', 'winter_weather'];
  const unitOf = (id, n) => id === 'hurricane' ? `storm${n === 1 ? '' : 's'}` : `event${n === 1 ? '' : 's'}`;
  function countRule(id, county) {
    if (id === 'hurricane') return `Each named storm counts once, when its path came within 150 miles and NOAA recorded damage from it in ${county}`;
    if (COUNT_ALL.includes(id)) return `Every NOAA record of this hazard in ${county} counts`;
    return `NOAA records in ${county} that caused damage, injury or death count`;
  }
  function historyLine(y, w) { return y === 0 ? `No recorded events in ${w} years` : y === w ? `Recorded every year for ${w} years` : `Recorded in ${y} of the last ${w} years`; }
  function rankLine(p, y) { return y === 0 ? 'No events on record here' : p >= 50 ? `More events than ${p}% of U.S. counties` : `Fewer events than ${100 - p}% of U.S. counties`; }
  function peakSeason(bm) {
    const tot = bm.reduce((a, b) => a + b, 0); if (!tot) return 'No clear season';
    let best = 0, bestSum = -1;
    for (let i = 0; i < 12; i++) { const s = bm[i] + bm[(i + 1) % 12] + bm[(i + 2) % 12]; if (s > bestSum) { bestSum = s; best = i; } }
    return `${MONTHS[best]}–${MONTHS[(best + 2) % 12]} (${Math.round(100 * bestSum / tot)}% of events)`;
  }

  // Not in NOAA's storm records; shown as "not yet included", never as "never recorded"
  const NOT_INCLUDED = { earthquake: 'USGS earthquake records', volcanic_activity: 'USGS volcano records' };
  function stepDataFile(loc, db, audience) {
    const zone = loc.flood_zone ? ZONES[loc.flood_zone] : null;
    const hazards = HAZARDS.map(hz => {
      const row = db.county_rows.find(r => r.hazard === hz.id);
      const p = row.national_percentile, y = row.years_with_event, tier = tierFor(p, y);
      const years = Object.keys(row.events_by_year);
      return { id: hz.id, name: hz.name, window_years: hz.win, percentile: p, years_with_event: y,
        tier: tier.label, tier_key: tier.key, group: tier.group,
        rank_line: rankLine(p, y), history_line: historyLine(y, hz.win), severity_line: SEVERITY[row.severity],
        events_total: years.reduce((s, k) => s + row.events_by_year[k], 0), events_by_year: row.events_by_year, events_by_month: row.events_by_month,
        season: peakSeason(row.events_by_month), not_included: !!NOT_INCLUDED[hz.id] };
    }).map(h => h.not_included ? Object.assign(h, { group: 'na', tier: 'Not yet included', tier_key: 'none', rank_line: 'Not yet included', history_line: 'Not yet included' }) : h).sort((a, b) => b.percentile - a.percentile || b.years_with_event - a.years_with_event || a.name.localeCompare(b.name));
    const above = hazards.filter(h => h.group === 'above');
    const counts = Object.fromEntries(GROUPS.map(g => [g.key, hazards.filter(h => h.group === g.key).length]));
    const claims = db.tract_flood_claims;
    let claimsInfo = null;
    if (claims) {
      const cy = Object.keys(claims), cv = cy.map(k => claims[k]);
      const total = cv.reduce((a, b) => a + b, 0), peakV = Math.max(...cv), peakY = cy[cv.indexOf(peakV)];
      claimsInfo = { area: 'this census tract', by_year: claims, total, peak_year: peakY, peak_value: peakV, years_with_claims: cv.filter(v => v > 0).length };
    }
    const aud = AUD[audience];
    let checklist = aud.checks.filter(([z]) => zone ? (z === null || (z === 'high') === (zone[0] === 'high')) : z === null)
      .map(([, b, t]) => ({ bold: b.replace('{z}', loc.flood_zone || ''), text: t.replace('{z}', loc.flood_zone || '') }));
    if (!zone) checklist = [{ bold: 'Look up the exact flood zone', text: "for the home on FEMA's Flood Map Service Center (msc.fema.gov)." }].concat(checklist);
    let lead;
    if (zone && claimsInfo) lead = `This property sits in FEMA flood zone ${loc.flood_zone} (${zone[1].toLowerCase()}). Homes in this census tract filed ${claimsInfo.total} flood insurance claims from 1996 to 2025, the most in ${claimsInfo.peak_year} (${claimsInfo.peak_value}).`;
    else if (zone) lead = `This property sits in FEMA flood zone ${loc.flood_zone} (${zone[1].toLowerCase()}).${db.storms.length ? ` Below are the named storms that caused the most recorded damage in ${loc.county}.` : ''}`;
    else if (loc.zip_area) lead = `This report covers ZIP code ${loc.zip_area}, using the records for ${loc.county}.${loc.zip_note} Flood zones are mapped for each property, so look up the home's zone on FEMA's flood map.`;
    else lead = `This report covers ${loc.county}. Flood zones are mapped for each property, so look up the home's zone on FEMA's flood map.`;
    const now = new Date();
    return {
      report: { title: 'Home Hazard History', id: `EI-${loc.state || 'US'}-${loc.county.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase()}-${String(Math.floor(rng(loc._addrId)() * 90000) + 10000)}`,
        date: now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), audience, watermark: WM, data_range: `${FIRST_YEAR}–${END_YEAR}`, real_data: !!loc._real },
      property: { address: loc.address, city: loc.city, state: loc.state, state_name: loc.state_name || 'Florida', zip: loc.zip, county: loc.county, census_tract: loc.census_tract, latitude: loc.latitude, longitude: loc.longitude, zip_area: loc.zip_area || null },
      headline: above.length ? `${join(above.map(h => h.name))} ${above.length === 1 ? 'has' : 'have'} been recorded here more often than in most of the U.S.` : 'No hazard has been recorded here more often than in most of the U.S.',
      group_counts: counts,
      hazards,
      detail_pages: above.map(h => h.id),
      flood_zone: zone ? { code: loc.flood_zone, level: zone[0], title: zone[1], text: zone[2] } : null,
      flood_claims: claimsInfo,
      property_lead: lead,
      page3: { title: aud.title, checklist_title: aud.checkTitle, checklist },
      storms: db.storms.map(s => ({ date: s.date, name: s.name, hazards: s.hazards, summary: s.summary })),
      declarations: db.declarations ? db.declarations.map(([code, date, title, type, sw, begin]) => ({ code, date, title, type, statewide: !!sw, begin: begin || date })) : null
    };
  }

  // ---- STEP 4: fill the templates ----
  function barChart(labels, values, w, h, opt = {}) {
    const top = Math.max(...values) || 1, gap = labels.length > 12 ? 2 : 4;
    const bw = (w - gap * (labels.length - 1)) / labels.length;
    const minLabel = opt.labelPeaksOnly ? top : Math.max(1, top * 0.15);
    let s = `<svg viewBox="-14 -14 ${w + 28} ${h + 36}"><line x1="0" x2="${w}" y1="${h}" y2="${h}" stroke="#B9C7D4" stroke-width="1"/>`;
    labels.forEach((lab, i) => {
      const v = values[i], x = i * (bw + gap), bh = v ? Math.max(2, v / top * h) : 0;
      if (v) s += `<rect x="${x.toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${v === top ? '#003366' : '#7BAFD4'}"/>`;
      if (v && v >= minLabel) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(h - bh - 4).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="#003366" font-family="Work Sans, Arial, sans-serif">${v}</text>`;
      if (opt.tick(i, lab)) s += `<text x="${(x + bw / 2).toFixed(1)}" y="${h + 13}" text-anchor="middle" font-size="9.5" fill="#707070" font-family="Work Sans, Arial, sans-serif">${lab}</text>`;
    });
    return s + '</svg>';
  }

  const tierColor = key => (TIERS.find(t => t.key === key) || NONE).color;
  const placeLine = d => d.property.zip ? `${d.property.address}, ${d.property.city}, ${d.property.state} ${d.property.zip}` : `${d.property.address}, ${d.property.state_name}`;
  const header = d => `<div class="rp-head"><img src="img/logo.png" alt=""><div><div class="t">${esc(d.report.title)}</div><div class="a">${esc(placeLine(d))}</div></div></div>`;
  const footer = (d, n) => `<div class="rp-foot"><span>© Emergency Insights · Report ${esc(d.report.id)}</span><b>${n}</b><span>${esc(d.report.date)}</span></div>`;
  let WM = 'SAMPLE';
  const shell = (inner) => `<div class="rp-page"><div class="rp-stripe"></div><div class="rp-wm">${WM}</div>${inner}</div>`;

  function pageCover(d) {
    return shell(`<div class="rp-cv-top"><img src="img/logo.png" alt=""><div class="rp-cv-title"><div class="e">Emergency Insights Report</div><div class="h">Home<br>Hazard<br>History</div><div class="s">What this address has been through, from public records</div><div class="r"></div></div></div>
      <div class="rp-cv-mid"><div class="lb">${d.property.zip ? 'Property' : 'Area'}</div><div class="a1">${esc(d.property.address)}</div><div class="a2">${d.property.zip ? `${esc(d.property.city)}, FL ${esc(d.property.zip)} · ${esc(d.property.county)}` : d.property.zip_area ? `${d.property.state_name} · area report by ZIP code` : `${d.property.state_name} · county-level report`}</div>
      <div class="rp-cv-meta"><div><div class="l">Report date</div><div class="v">${esc(d.report.date)}</div></div><div><div class="l">Report ID</div><div class="v">${esc(d.report.id)}</div></div><div><div class="l">Prepared for</div><div class="v">${{ buying: 'Home buyer', renting: 'Renter', living: 'Resident' }[d.report.audience]}</div></div></div></div>
      <div class="rp-cv-bot"><div class="rp-cv-facts"><div><div class="v">18</div><div class="l">Natural hazards reviewed</div></div><div><div class="v">${WIN}</div><div class="l">Years of records (${d.report.data_range})</div></div><div><div class="s">NOAA · FEMA · USGS</div><div class="l">Public data sources</div></div></div>
      <div class="rp-cv-foot"><span>This report describes how often hazards have been recorded here in the past. They are not a prediction, and this is not an inspection, appraisal or insurance determination.</span><span>1</span></div></div>`);
  }

  function pageSummary(d) {
    const rec = d.hazards.filter(h => h.years_with_event > 0 && !h.not_included), none = d.hazards.filter(h => h.years_with_event === 0 && !h.not_included), na = d.hazards.filter(h => h.not_included);
    const counts = GROUPS.map(g => `<div class="rp-count"><div class="n" style="color:${g.color}">${d.group_counts[g.key]}</div><div><div class="l" style="color:${g.color}">${g.label}</div><div class="m">${g.meaning}</div></div></div>`).join('');
    const last = Number(Object.keys(d.hazards[0].events_by_year).slice(-1)[0]);
    const rows = rec.map(h => {
      const c = tierColor(h.tier_key);
      const yrs = []; for (let y = last - h.window_years + 1; y <= last; y++) yrs.push(y);
      const hit = yrs.filter(y => (h.events_by_year[y] || 0) > 0);
      // one square per year, drawn as SVG so the PDF renderer places it exactly
      const sq = Math.max(3, Math.floor((150 - 2 * (yrs.length - 1)) / yrs.length));
      // squares are one neutral color: they count years; the colored dot shows the comparison with the U.S.
      const strip = `<svg width="${yrs.length * (sq + 2) - 2}" height="7" viewBox="0 0 ${yrs.length * (sq + 2) - 2} 7" style="display:block">` +
        yrs.map((y, k) => `<rect x="${k * (sq + 2)}" y="0" width="${sq}" height="7" rx="1" fill="${(h.events_by_year[y] || 0) > 0 ? '#3D6A93' : '#E6EDF3'}"/>`).join('') + `</svg>`;
      const cmp = h.percentile >= 50 ? `More often than in <b>${h.percentile}%</b> of U.S. counties` : `Less often than in <b>${100 - h.percentile}%</b> of U.S. counties`;
      return `<tr><td class="hz"><span class="dot" style="background:${c}"></span>${h.name}</td>
        <td class="yr"><div><b>${h.years_with_event}</b> of ${h.window_years} years <span class="ev">${h.events_total} ${unitOf(h.id, h.events_total)}</span></div><div class="strip">${strip}</div></td>
        <td class="ls">${hit.length ? hit[hit.length - 1] : '—'}</td>
        <td class="cm"><div class="bar"><span style="left:${Math.min(98, Math.max(2, h.percentile))}%;background:${c}"></span></div><div class="t">${cmp}</div></td></tr>`;
    }).join('');
    return shell(header(d) + `<div class="rp-body"><div class="rp-eyebrow">Section 1 · At a glance</div><h1 class="rp-h1">Hazard Summary</h1><p class="rp-lead" style="font-weight:600;color:#003366;">${esc(d.headline)}</p>
      <div class="rp-counts">${counts}</div>
      <div class="rp-label">What has been recorded in ${esc(d.property.county)}</div>
      <table class="rp-sum"><thead><tr><th>Hazard</th><th>Years with recorded events, ${FIRST_YEAR}–${END_YEAR}</th><th>Last recorded</th><th>Compared with the rest of the U.S.<div class="ends"><span>Less often</span><span>More often</span></div></th></tr></thead><tbody>${rows}</tbody></table>
      ${none.length || na.length ? `<div class="rp-never">${none.length ? `<div class="h">Never recorded in ${esc(d.property.county)} since ${FIRST_YEAR} <span>(${none.length} of ${d.hazards.length} hazards)</span></div><div class="chips">${none.map(h => h.name).join('<i>·</i>')}</div>` : ''}${na.length ? `<div class="na"><b>Not yet included:</b> ${join(na.map(h => h.name))}. These come from USGS records, which we are adding next.</div>` : ''}</div>` : ''}
      <div class="rp-legend">Each square is one year, ${FIRST_YEAR} on the left. A square is filled when NOAA recorded at least one event of that hazard in the county that year: for most hazards, one that caused damage, injury or death; for heat, cold, drought, winter weather and coastal flooding, any recorded event. A hurricane counts once per named storm, when its path came within 150 miles and it left recorded damage in the county. The colored dot shows the comparison. The comparison ranks ${esc(d.property.county)} among all 3,144 U.S. counties by how often each hazard has been recorded. Source: NOAA Storm Events Database. This is a record of the past, not a forecast.</div></div>` + footer(d, 2));
  }

  function pageProperty(d) {
    const fc = d.flood_claims;
    let claimsHtml;
    if (fc) {
      const ys = Object.keys(fc.by_year), vs = ys.map(y => fc.by_year[y]);
      const chart = barChart(ys, vs, 600, 72, { tick: (i, y) => Number(y) % 5 === 0 || i === 0 || i === ys.length - 1 });
      claimsHtml = `<div class="rp-chart"><div style="display:flex;justify-content:space-between;gap:10px;"><div class="rp-chart-t">${fc.total} claims in ${fc.years_with_claims} of ${ys.length} years</div><div class="rp-chart-s">Claims per year, this census tract</div></div>${chart}<div class="rp-note">Source: FEMA National Flood Insurance Program. Counts only insured homes.</div></div>`;
    } else {
      claimsHtml = '';
    }
    // Federal disaster declarations (OpenFEMA), natural hazards only
    const dc = d.declarations;
    const kind = c => ({ DR: 'Major disaster', EM: 'Emergency', FM: 'Fire management' }[c.slice(0, 2)] || c.slice(0, 2));
    const mon = x => { const [y, m] = x.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };
    const nDR = dc ? dc.filter(x => x.code.startsWith('DR')).length : 0;
    // one row per disaster: FEMA often issues an emergency and a major disaster declaration for the same storm
    const groups = [];
    (dc || []).forEach(x => {
      // same incident = same start date and type (e.g. "Tropical Storm Debby" emergency + "Hurricane Debby" major disaster)
      const storm = /hurricane|tropical|typhoon/i.test(x.type + ' ' + x.title);
      const name = x.title.toLowerCase().replace(/\b(remnants of|post-tropical cyclone|hurricane|tropical storms?|tropical depression|typhoon|and flooding)\b/g, '').replace(/[^a-z ]/g, '').trim();
      const key = storm && name ? `storm|${name}|${x.begin.slice(0, 4)}` : x.begin + '|' + x.type;
      let g = groups.find(g => g.key === key);
      if (!g) groups.push(g = { key, title: x.title, date: x.date, items: [] });
      g.items.push(x); if (x.date < g.date) g.date = x.date;
      if (x.code.startsWith('DR')) g.title = x.title;
    });
    const kinds = g => [...new Set(g.items.map(x => kind(x.code)))].join(' · ') + (g.items.every(x => x.statewide) ? ' · statewide' : '');
    const MAXD = 7;
    const declHtml = !dc ? '' : groups.length
      ? `<table class="rp-events rp-decl">${groups.slice(0, MAXD).map(g => `<tr><td>${mon(g.date)}</td><td class="n">${esc(g.title)}</td><td class="h">${kinds(g)}</td><td class="c">${g.items.map(x => x.code).join(', ')}</td></tr>`).join('')}</table>${groups.length > MAXD ? `<p class="rp-none" style="margin-top:4px">And ${groups.length - MAXD} more, ${mon(groups[groups.length - 1].date)} to ${mon(groups[MAXD].date)}.</p>` : ''}`
      : `<p class="rp-none" style="margin-top:0">No federal disaster declarations for natural hazards covered ${esc(d.property.county)} from ${FIRST_YEAR} to ${END_YEAR}.</p>`;
    const declTx = !dc ? '' : !dc.length ? 'None for natural hazards in this period.'
      : `${dc.length} declaration${dc.length === 1 ? '' : 's'} in all${nDR ? `, including ${nDR} major disaster declaration${nDR === 1 ? '' : 's'}` : ''}. Source: FEMA.`;
    const fz = d.flood_zone;
    const zoneColor = fz ? { high: '#F2A29A', moderate: '#F5C08A', low: '#7BAFD4' }[fz.level] : '#7BAFD4';
    const zoneHtml = fz
      ? `<div class="row"><div class="cd">${fz.code.replace('500', '')}</div><div class="tt" style="color:${zoneColor}">${fz.title}</div></div><div class="tx">${esc(fz.text)}</div>`
      : `<div class="row"><div class="tt" style="color:${zoneColor}">Looked up per address</div></div><div class="tx">This report covers the whole county. A report for a specific home shows its official FEMA flood zone here.</div>`;
    const rows = d.storms.map(s => `<tr><td>${s.date}</td><td class="n">${s.name}</td><td class="h">${s.hazards.join(' · ')}</td><td>${s.summary}</td></tr>`).join('');
    const checks = d.page3.checklist.map(c => `<div class="rp-check"><i></i><div><b>${esc(c.bold)}</b> ${esc(c.text)}</div></div>`).join('');
    return shell(header(d) + `<div class="rp-body"><div class="rp-eyebrow">Section 1 · This property</div><h1 class="rp-h1">${esc(d.page3.title)}</h1><p class="rp-lead">${esc(d.property_lead)}</p>
      ${!fz && dc ? `<div class="rp-duo"><div class="rp-stat"><div class="lb">Federally declared disasters, ${FIRST_YEAR}–${END_YEAR}</div><div class="big">${groups.length}</div><div class="tx">${declTx}</div></div>
      <div class="rp-zone"><div class="lb">FEMA flood zone</div><div class="row"><div class="tt" style="color:#7BAFD4">Mapped for each property</div></div><div class="tx">Flood zones change from street to street, so this area report doesn't show one. Look up the home's zone at msc.fema.gov.</div></div></div>` : `<div class="rp-duo"><div class="rp-map"><div><div class="pin"></div>Satellite view of the property<br>will appear here</div><div class="co">${d.property.latitude.toFixed(4)}, ${d.property.longitude.toFixed(4)}${d.property.census_tract ? ' · Tract ' + d.property.census_tract : ' · county center'}</div></div>
      <div class="rp-zone"><div class="lb">FEMA flood zone</div>${zoneHtml}</div></div>`}
      ${claimsHtml ? `<div class="rp-label">Flood insurance claims nearby</div>${claimsHtml}` : ''}
      ${dc ? `<div class="rp-label">Federal disaster declarations in ${esc(d.property.county)}</div>${declHtml}` : ''}
      <div class="rp-label">Major storms on record in ${esc(d.property.county)}</div>${rows ? `<table class="rp-events">${rows}</table>` : `<p class="rp-none" style="margin-top:0">No named tropical storm left recorded damage in the county since ${FIRST_YEAR}.</p>`}
      <div class="rp-label">${esc(d.page3.checklist_title)}</div><div class="rp-checks">${checks}</div></div>` + footer(d, 3));
  }

  function pageDetail(d, h, i, n, pageNum) {
    const ys = Object.keys(h.events_by_year), vs = ys.map(y => h.events_by_year[y]);
    const yearly = barChart(ys, vs, 300, 95, { labelPeaksOnly: ys.length > 12, tick: (k, y) => ys.length > 12 ? (Number(y) % 5 === 0 || k === 0 || k === ys.length - 1) : true });
    const monthly = barChart(MONTHS, h.events_by_month, 300, 95, { tick: () => true });
    const det = DETAIL[h.id] || { what: '[Detail text for this hazard is not written yet.]', ins: 'Confirm coverage for this hazard with a licensed agent.' };
    const storms = d.storms.filter(s => s.hazards.includes(h.name));
    const color = tierColor(h.tier_key);
    return shell(header(d) + `<div class="rp-body"><div class="rp-eyebrow">Section 2 · Hazard detail ${i} of ${n}</div>
      <div class="rp-titlerow"><h1 class="rp-h1" style="font-size:42px;">${h.name}</h1><div class="rp-rating"><div class="tr" style="color:${color}">${h.tier}</div><div class="sc">${h.rank_line}</div></div></div>
      <p class="rp-lead">${esc(det.what)}</p>
      <div class="rp-facts" style="--b:${color}"><div class="rp-fact"><div class="l">Compared with the U.S.</div><div class="v">${h.rank_line}</div></div><div class="rp-fact"><div class="l">History</div><div class="v">${h.history_line}</div></div><div class="rp-fact"><div class="l">Peak season</div><div class="v">${h.season}</div></div><div class="rp-fact"><div class="l">Severity</div><div class="v">${h.severity_line}</div></div></div>
      <div class="rp-label">What has happened in ${esc(d.property.county)}</div>
      <div class="rp-charts"><div class="rp-chart"><div class="rp-chart-t">${h.events_total} recorded ${unitOf(h.id, h.events_total)}, ${ys[0]}–${ys[ys.length - 1]}</div><div class="rp-chart-s">Events per year</div>${yearly}</div><div class="rp-chart"><div class="rp-chart-t">Most events fall in ${h.season.split(' (')[0]}</div><div class="rp-chart-s">Events by month, all years combined</div>${monthly}</div></div>
      ${storms.length ? `<div class="rp-label">Named storms on record</div><table class="rp-events">${storms.map(s => `<tr><td>${s.date}</td><td class="n">${s.name}</td><td>${s.summary}</td></tr>`).join('')}</table>` : ''}
      <div class="rp-ins"><div class="l">Insurance</div><div class="t">${esc(det.ins)}</div></div>
      <p class="rp-bottomnote">${d.report.real_data
        ? `Source: NOAA Storm Events Database, ${FIRST_YEAR}–${END_YEAR}${h.id === 'hurricane' ? ', matched to NOAA hurricane tracks' : ''}. ${countRule(h.id, esc(d.property.county))}. Prototype: methods are still being refined. This describes the past and is not a forecast.`
        : `Events are made-up sample data for testing the layout. In the real report they come from NOAA's Storm Events Database for ${esc(d.property.county)}, ${FIRST_YEAR}–${END_YEAR}. This describes the past and is not a forecast.`}</p></div>` + footer(d, pageNum));
  }

  function pageClosing(d, pageNum) {
    const tiers = TIERS.map((t, k) => `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${t.color};margin-right:6px;"></i>${t.label}</td><td>${k === 4 ? 'Recorded, but less often than in most counties' : `More often than in ${t.min}–${k ? TIERS[k - 1].min - 1 : 99}% of U.S. counties`}</td></tr>`).join('') + `<tr><td><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${NONE.color};margin-right:6px;"></i>Not recorded</td><td>No recorded events since ${FIRST_YEAR}</td></tr>`;
    return `<div class="rp-page"><div class="rp-stripe"></div><div class="rp-wm">${WM}</div>${header(d)}<div class="rp-body"><div class="rp-eyebrow">Section 3 · About this report</div><h1 class="rp-h1">How This Report Works</h1>
      <p class="rp-lead">Every number comes from public government records of events that have already happened. Nothing here is a forecast.</p>
      <div class="rp-label">How each hazard is compared</div><ul class="rp-ul"><li>Count the events of each hazard NOAA recorded in the county since ${FIRST_YEAR} (for most hazards, those that caused damage, injury or death; a hurricane counts once per storm) (per square mile for local hazards such as hail and tornadoes).</li><li>Compare the county with every U.S. county, for that hazard only.</li><li>Show two plain facts side by side: how many years had events, and where the county falls among all U.S. counties. A hazard is called above the U.S. norm only if it was recorded in at least ${MIN_YEARS_ABOVE} different years. No scores, no forecasts.</li></ul>
      <div class="rp-label">What the colors mean</div><table class="rp-tbl"><tr><th style="text-align:left">COLOR</th><th style="text-align:left">MEANING</th></tr>${tiers}</table>
      <div class="rp-label">Data sources</div><ul class="rp-ul"><li><b>NOAA Storm Events Database</b>: damaging weather events by type, date and county</li><li><b>OpenFEMA Disaster Declarations</b>: federal disaster and emergency declarations by county</li><li><b>OpenFEMA NFIP claims</b>: flood insurance claims by census tract</li><li><b>FEMA National Flood Hazard Layer</b>: the property's flood zone</li><li><b>FEMA National Risk Index</b>: the 18 hazards and a cross-check</li><li><b>USGS Earthquake Catalog</b> and <b>Census Geocoder</b></li></ul>
      <div class="rp-label">Limits</div><ul class="rp-ul"><li>Records depend on reporting, and most weather records are by county.</li><li>Flood claims count only insured homes. The past is a guide, not a guarantee.</li></ul></div>
      <div class="rp-closing"><div class="lb">Disclaimer</div><p>This report summarizes public historical records for general information only. Comparisons describe how often hazards have been recorded in the past relative to other U.S. counties; they are not predictions or guarantees. It is not an inspection, appraisal, survey or insurance quote. Emergency Insights is not affiliated with or endorsed by NOAA, FEMA, USGS or the U.S. Census Bureau.</p>
      <div class="ft"><img src="img/logo.png" alt=""><span>Report ${esc(d.report.id)} · Generated ${esc(d.report.date)}</span><span>${pageNum}</span></div></div></div>`;
  }

  function stepTemplates(d) {
    const pages = [pageCover(d), pageSummary(d), pageProperty(d)];
    const det = d.hazards.filter(h => d.detail_pages.includes(h.id));
    det.forEach((h, i) => pages.push(pageDetail(d, h, i + 1, det.length, 4 + i)));
    pages.push(pageClosing(d, 4 + det.length));
    return pages;
  }

  // ---- Real Florida data (prepared by prepare.py from NOAA records and hurricane tracks) ----
  const REAL_ADDRESSES = [{"label": "Orlando City Hall", "line1": "400 S Orange Ave", "city": "Orlando", "zip": "32801", "fips": "12095", "tract": "189.02", "lat": 28.5383, "lon": -81.379, "zone": "X"}, {"label": "Miami City Hall", "line1": "3500 Pan American Dr", "city": "Miami", "zip": "33133", "fips": "12086", "tract": "68.01", "lat": 25.7287, "lon": -80.235, "zone": "AE"}, {"label": "St. Petersburg City Hall", "line1": "175 5th St N", "city": "St. Petersburg", "zip": "33701", "fips": "12103", "tract": "215.02", "lat": 27.7731, "lon": -82.6401, "zone": "X"}, {"label": "Tallahassee City Hall", "line1": "300 S Adams St", "city": "Tallahassee", "zip": "32301", "fips": "12073", "tract": "2", "lat": 30.4395, "lon": -84.282, "zone": "X"}, {"label": "Tampa City Hall", "line1": "315 E Kennedy Blvd", "city": "Tampa", "zip": "33602", "fips": "12057", "tract": "51.01", "lat": 27.9477, "lon": -82.4578, "zone": "X"}, {"label": "Jacksonville City Hall", "line1": "117 W Duval St", "city": "Jacksonville", "zip": "32202", "fips": "12031", "tract": "172", "lat": 30.3297, "lon": -81.6588, "zone": "X"}, {"label": "Monroe County Courthouse", "line1": "500 Whitehead St", "city": "Key West", "zip": "33040", "fips": "12087", "tract": "9724", "lat": 24.5552, "lon": -81.804, "zone": "X"}, {"label": "Fort Myers City Hall", "line1": "2200 Second St", "city": "Fort Myers", "zip": "33901", "fips": "12071", "tract": "803", "lat": 26.642, "lon": -81.8694, "zone": "X500"}, {"label": "Gainesville City Hall", "line1": "200 E University Ave", "city": "Gainesville", "zip": "32601", "fips": "12001", "tract": "5", "lat": 29.652, "lon": -82.3232, "zone": "X"}, {"label": "Pensacola City Hall", "line1": "222 W Main St", "city": "Pensacola", "zip": "32502", "fips": "12033", "tract": "1", "lat": 30.4069, "lon": -87.218, "zone": "AE"}];
  // States: [abbreviation, name, FIPS]
  const STATES = [['AL','Alabama','01'],['AK','Alaska','02'],['AZ','Arizona','04'],['AR','Arkansas','05'],['CA','California','06'],['CO','Colorado','08'],['CT','Connecticut','09'],['DE','Delaware','10'],['DC','District of Columbia','11'],['FL','Florida','12'],['GA','Georgia','13'],['HI','Hawaii','15'],['ID','Idaho','16'],['IL','Illinois','17'],['IN','Indiana','18'],['IA','Iowa','19'],['KS','Kansas','20'],['KY','Kentucky','21'],['LA','Louisiana','22'],['ME','Maine','23'],['MD','Maryland','24'],['MA','Massachusetts','25'],['MI','Michigan','26'],['MN','Minnesota','27'],['MS','Mississippi','28'],['MO','Missouri','29'],['MT','Montana','30'],['NE','Nebraska','31'],['NV','Nevada','32'],['NH','New Hampshire','33'],['NJ','New Jersey','34'],['NM','New Mexico','35'],['NY','New York','36'],['NC','North Carolina','37'],['ND','North Dakota','38'],['OH','Ohio','39'],['OK','Oklahoma','40'],['OR','Oregon','41'],['PA','Pennsylvania','42'],['RI','Rhode Island','44'],['SC','South Carolina','45'],['SD','South Dakota','46'],['TN','Tennessee','47'],['TX','Texas','48'],['UT','Utah','49'],['VT','Vermont','50'],['VA','Virginia','51'],['WA','Washington','53'],['WV','West Virginia','54'],['WI','Wisconsin','55'],['WY','Wyoming','56']];
  const ST_NAME = Object.fromEntries(STATES.map(([a, n]) => [a, n]));
  const ST_OF_FIPS = Object.fromEntries(STATES.map(([a, , f]) => [f, a]));
  const SDB = {};   // loaded states: { XX: { counties, zips } }
  function loadState(st) {
    if (!SDB[st]) SDB[st] = Promise.all([
      fetch(`data/states/${st}.json`).then(r => { if (!r.ok) throw new Error('state'); return r.json(); }),
      fetch(`data/zips/${st}.json`).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    ]).then(([d, z]) => ({ counties: d.counties, zips: z })).catch(e => { delete SDB[st]; throw e; });
    return SDB[st];
  }
  const loaded = {};   // resolved state data, for synchronous lookups while building a report
  const countyOf = f => (loaded[ST_OF_FIPS[f.slice(0, 2)]] || {}).counties?.[f] || (REAL && REAL.counties[f]);

  let REAL = null;
  const realReady = loadState('FL').then(d => { loaded.FL = d; REAL = d; return d; }).catch(() => null);

  // A place to report on: { state, zip } or { state, county }. Returns { val } or { error }.
  async function resolvePlace({ state, zip, county }) {
    if (!state || !ST_NAME[state]) return { error: 'Choose a state.' };
    let d;
    try { d = await loadState(state); } catch (e) { return { error: 'The data for this state did not load. Check your connection and try again.' }; }
    loaded[state] = d;
    if (county) return d.counties[county] ? { val: 'cty:' + county } : { error: 'Choose a county from the list.' };
    const z = (zip || '').trim();
    if (!/^\d{5}$/.test(z)) return { error: 'Enter a 5-digit ZIP code, or choose a county.' };
    if (!d.zips[z]) return { error: `${z} isn't a ZIP code in ${ST_NAME[state]}. Check the state, or choose a county instead.` };
    return { val: `zip:${state}:${z}` };
  }
  async function countiesOf(state) {
    const d = await loadState(state); loaded[state] = d;
    return Object.entries(d.counties).map(([f, c]) => ({ fips: f, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  const money = v => v >= 1e9 ? `$${(v / 1e9).toFixed(1)} billion` : v >= 1e6 ? `$${Math.round(v / 1e6)} million` : v >= 1e3 ? `$${Math.round(v / 1e3)} thousand` : v > 0 ? `$${Math.round(v)}` : 'no dollar amount';

  function realGeocode(val) {
    if (val.startsWith('addr:')) {
      const a = REAL_ADDRESSES[Number(val.slice(5))], c = countyOf(a.fips);
      return { address: a.line1, city: a.city, state: 'FL', state_name: 'Florida', zip: a.zip, county: c.name, county_fips: a.fips, census_tract: a.tract,
        latitude: a.lat, longitude: a.lon, flood_zone: a.zone, place: a.label,
        source: 'Census geocoder and FEMA National Flood Hazard Layer, looked up in advance', _addrId: val, _real: true };
    }
    if (val.startsWith('zip:')) {
      const [, st, zip] = val.split(':'), fl = loaded[st].zips[zip], c = countyOf(fl[0]);
      const others = fl.slice(1).map(f => countyOf(f).name);
      return { address: `ZIP ${zip} · ${c.name}`, city: '', state: st, state_name: ST_NAME[st], zip: '', county: c.name, county_fips: fl[0], census_tract: null,
        latitude: c.lat, longitude: c.lon, flood_zone: null, place: `ZIP code ${zip}`, zip_area: zip,
        zip_note: others.length ? ` Part of this ZIP code is in ${join(others)}; this report uses ${c.name}, where most of it lies.` : '',
        source: 'Census ZIP code to county table, then the county center from the Census county file', _addrId: val, _real: true };
    }
    const f = val.startsWith('cty:') ? val.slice(4) : val.slice(7), c = countyOf(f), st = ST_OF_FIPS[f.slice(0, 2)];
    return { address: c.name, city: '', state: st, state_name: ST_NAME[st], zip: '', county: c.name, county_fips: f, census_tract: null,
      latitude: c.lat, longitude: c.lon, flood_zone: null, place: 'County-level report',
      source: 'County center from the Census county file', _addrId: val, _real: true };
  }
  function realLookup(loc) {
    const c = countyOf(loc.county_fips);
    const rows = HAZARDS.map(hz => { const v = c.h[hz.id]; return { hazard: hz.id, national_percentile: v[0], years_with_event: v[1], severity: v[2], events_by_year: v[3], events_by_month: v[4] }; });
    const storms = c.storms.map(st => ({ date: `${MONTHS[st.month - 1]} ${st.year}`, name: st.name, hazards: ['Hurricane'],
      summary: `NOAA recorded ${money(st.damage)} in damage in the county.`, year: st.year, month: st.month - 1 }));
    return { source: 'states/XX.json: real NOAA Storm Events and hurricane tracks, ranked against every U.S. county', county_rows: rows, tract_flood_claims: null, storms, declarations: c.decl || [] };
  }

  // ---- UI ----
  const sel = document.getElementById('lab-addr');
  const modeOf = () => (document.querySelector('input[name="lab-mode"]:checked') || {}).value || 'real';
  const SHORT = { coastal_flooding: 'Coastal', riverine_flooding: 'River flood', strong_wind: 'Wind', volcanic_activity: 'Volcanic', winter_weather: 'Winter', heat_wave: 'Heat', cold_wave: 'Cold', ice_storm: 'Ice' };
  const stageText = {
    real: ['Turns the address into a county, census tract, coordinates and flood zone. The public addresses were looked up in advance with the Census geocoder and FEMA flood maps.',
           "Reads the county's 18 hazard rows and its most damaging named storms from the Florida database, built from real NOAA records."],
    fake: ['Turns the address into a county, a census tract, coordinates and a flood zone. Made-up addresses stand in for the Census geocoder and FEMA flood maps.',
           "Reads the county's 18 hazard rows, the tract's flood claims and the storms on record from a small made-up database."]
  };

  function fillPlaces() {
    const mode = modeOf();
    sel.innerHTML = '';
    document.getElementById('lab-addr-label').textContent = mode === 'real' ? 'Or pick a test place' : 'Address (fictional)';
    document.getElementById('lab-zip-field').hidden = mode !== 'real';
    if (mode === 'real') {
      const g1 = document.createElement('optgroup'); g1.label = 'Public buildings: address-level report';
      REAL_ADDRESSES.forEach((a, i) => { const o = document.createElement('option'); o.value = 'addr:' + i; o.textContent = `${a.label}, ${a.line1}, ${a.city} · ${REAL.counties[a.fips].name}`; g1.appendChild(o); });
      const g2 = document.createElement('optgroup'); g2.label = 'Any Florida county: county-level report';
      Object.entries(REAL.counties).sort((x, y) => x[1].name.localeCompare(y[1].name)).forEach(([f, c]) => { const o = document.createElement('option'); o.value = 'county:' + f; o.textContent = c.name; g2.appendChild(o); });
      sel.append(g1, g2);
    } else {
      ADDRESSES.forEach(a => { const o = document.createElement('option'); o.value = a.id; o.textContent = `${a.line1}, ${a.city}, FL ${a.zip} · ${COUNTIES[a.fips].name}`; sel.appendChild(o); });
    }
    ['st-1', 'st-2'].forEach((id, i) => { document.querySelector('#' + id + ' p').textContent = stageText[mode][i]; });
    document.getElementById('lab-mode-note').textContent = mode === 'real'
      ? 'Real NOAA storm records (1996–2025) and NOAA hurricane tracks for all 67 Florida counties, ranked against every U.S. county. Flood insurance claims and earthquakes are not connected yet.'
      : 'Invented numbers for four counties, for testing the layout and the steps.';
    fillDatabase();
  }

  function fillDatabase() {
    const dbT = document.getElementById('lab-db');
    if (modeOf() === 'real') {
      document.getElementById('lab-db-title').textContent = 'See the Florida database';
      document.getElementById('lab-db-note').textContent = 'National percentile for every Florida county and hazard: the share of U.S. counties with fewer recorded events. The whole file, with yearly and monthly counts and storms, is about 300 KB for 67 counties.';
      dbT.innerHTML = `<thead><tr><th>County</th>${HAZARDS.map(hz => `<th>${SHORT[hz.id] || hz.name}</th>`).join('')}</tr></thead><tbody>` +
        Object.values(REAL.counties).sort((x, y) => x.name.localeCompare(y.name)).map(c =>
          `<tr><td>${c.name}</td>${HAZARDS.map(hz => { const v = c.h[hz.id]; return `<td>${v[1] ? v[0] : '—'}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
    } else {
      document.getElementById('lab-db-title').textContent = 'See the whole made-up database';
      document.getElementById('lab-db-note').textContent = 'Everything the made-up database stores for four counties: national rank (percentile), years with events, and severity for each hazard.';
      const fipsList = Object.keys(COUNTIES);
      dbT.innerHTML = `<thead><tr><th>Hazard</th>${fipsList.map(f => `<th>${COUNTIES[f].name}</th>`).join('')}</tr></thead><tbody>` +
        HAZARDS.map(hz => `<tr><td>${hz.name}</td>${fipsList.map(f => { const r = COUNTIES[f].h[hz.id]; return `<td>${r ? `${r[0]}% · ${r[1]}/${hz.win} yrs · ${r[2]}` : '—'}</td>`; }).join('')}</tr>`).join('') + '</tbody>';
    }
  }

  function setStage(n, out, time, json) {
    const st = document.getElementById('st-' + n);
    st.classList.add('done');
    st.querySelector('.stage-out').textContent = out;
    st.querySelector('.stage-time').textContent = time.toFixed(1) + ' ms';
    const det = st.querySelector('details');
    if (det && json !== undefined) { det.hidden = false; det.querySelector('pre').textContent = JSON.stringify(json, null, 2); }
  }

  let lastPages = [], lastData = null;
  const SCALE = 0.36;

  function renderPreview(pv, pages, scale) {
    pv.innerHTML = '';
    pages.forEach(html => {
      const box = document.createElement('div'); box.className = 'rp-scale';
      box.style.width = (794 * scale) + 'px'; box.style.height = (1123 * scale) + 'px';
      box.innerHTML = html; box.firstElementChild.style.transform = `scale(${scale})`;
      pv.appendChild(box);
    });
  }

  const zipIn = document.getElementById('lab-zip'), zipMsg = document.getElementById('lab-zip-msg');
  zipIn.addEventListener('input', () => { zipMsg.textContent = ''; });
  sel.addEventListener('change', () => { zipIn.value = ''; zipMsg.textContent = ''; });

  function build() {
    const mode = modeOf();
    WM = mode === 'real' ? 'PROTOTYPE' : 'SAMPLE';
    let val = sel.value;
    if (mode === 'real' && zipIn.value.trim()) {
      const z = zipIn.value.trim();
      if (!loaded.FL || !loaded.FL.zips[z]) { zipMsg.textContent = `${z} isn't a Florida ZIP code we know.`; return; }
      val = `zip:FL:${z}`;
    }
    const audience = (document.querySelector('input[name="lab-aud"]:checked') || {}).value || 'buying';
    let t = performance.now();
    const loc = mode === 'real' ? realGeocode(val) : stepGeocode(val);
    const { _addrId, _real, ...locShown } = loc;
    setStage(1, loc.flood_zone ? `${loc.county}, tract ${loc.census_tract}, flood zone ${loc.flood_zone}` : loc.zip_area ? `ZIP ${loc.zip_area} → ${loc.county}, area-level (no flood zone)` : `${loc.county}, county-level (no address)`, performance.now() - t, locShown);
    t = performance.now();
    const db = mode === 'real' ? realLookup(loc) : stepLookup(loc);
    setStage(2, `18 hazard rows, ${db.tract_flood_claims ? Object.keys(db.tract_flood_claims).length + ' years of claims' : 'flood claims not connected yet'}, ${db.storms.length} storms`, performance.now() - t, db);
    t = performance.now();
    const data = stepDataFile(loc, db, audience);
    setStage(3, `${data.detail_pages.length} hazard${data.detail_pages.length === 1 ? '' : 's'} above the U.S. norm`, performance.now() - t, data);
    t = performance.now();
    const pages = stepTemplates(data);
    setStage(4, `${pages.length} pages filled`, performance.now() - t);
    lastPages = pages; lastData = data;
    renderPreview(document.getElementById('lab-preview'), pages, SCALE);
    document.getElementById('lab-result').hidden = false;
    document.getElementById('lab-pdf-status').textContent = '';
  }

  document.querySelectorAll('input[name="lab-mode"]').forEach(r => r.addEventListener('change', () => { fillPlaces(); build(); }));

  document.getElementById('lab-form').addEventListener('submit', e => { e.preventDefault(); build(); });

  // ---- PDF ----
  function loadScript(src) {
    return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s); });
  }
  const pdfBtn = document.getElementById('lab-pdf');
  const pdfStatus = document.getElementById('lab-pdf-status');
  // Builds the PDF from finished pages and offers it as a download. Used by the lab and by "Get a report".
  async function savePdf(pages, data, btn, status) {
    if (!pages.length) return;
    btn.disabled = true; status.textContent = 'Building the PDF…';
    const off = document.getElementById('rp-offscreen');
    try {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      } catch (e) {
        status.textContent = 'The PDF tools could not load. Check your connection and try again.';
        return;
      }
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
      for (let i = 0; i < pages.length; i++) {
        status.textContent = `Building the PDF… page ${i + 1} of ${pages.length}`;
        off.innerHTML = pages[i];
        const el = off.firstElementChild;
        await Promise.all([...el.querySelectorAll('img')].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; })));
        const canvas = await window.html2canvas(el, { scale: 3, width: 794, height: 1123, windowWidth: 794, backgroundColor: '#ffffff', logging: false, scrollX: 0, scrollY: 0 });
        if (i > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }
      off.innerHTML = '';
      const blob = pdf.output('blob');
      const fname = `Emergency-Insights-${data.property.address.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
      const downloads = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (!downloads) {
        // Hosted on its own website: a normal browser download.
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        status.textContent = 'PDF downloaded.';
        return;
      }
      try {
        await downloads.save({ filename: fname, data: blob });
        status.textContent = 'PDF saved.';
      } catch (err) {
        status.textContent = err && err.code === 'declined' ? 'Download canceled.' : 'The PDF could not be saved here. Try again from the Claude app or website.';
      }
    } catch (err) {
      status.textContent = 'Something went wrong while building the PDF. Try again.';
      off.innerHTML = '';
    } finally {
      btn.disabled = false;
    }
  }
  pdfBtn.addEventListener('click', () => savePdf(lastPages, lastData, pdfBtn, pdfStatus));

  // ---- Hazard guide: built from data/hazards_meta.json (written by prepare.py) ----
  const HZ_GROUPS = [
    ['wind', 'Wind and storms', '#3d6f96', ['hurricane', 'tornado', 'strong_wind', 'hail', 'lightning']],
    ['water', 'Water', '#2a7ab0', ['riverine_flooding', 'coastal_flooding', 'tsunami']],
    ['temp', 'Heat, cold and dry', '#c98a1c', ['heat_wave', 'cold_wave', 'winter_weather', 'ice_storm', 'drought', 'wildfire']],
    ['ground', 'Ground', '#8a6a4b', ['earthquake', 'landslide', 'avalanche', 'volcanic_activity']]
  ];
  const HZ_ICON = {
    wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
    water: '<path d="M3 9c2 0 2-2 4.5-2S10 9 12 9s2.5-2 4.5-2S19 9 21 9M3 14c2 0 2-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2M3 19c2 0 2-2 4.5-2s2.5 2 4.5 2 2.5-2 4.5-2 2.5 2 4.5 2"/>',
    temp: '<path d="M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0Z"/><path d="M12 9v7"/>',
    ground: '<path d="M3 19l6-9 4 5 3-4 5 8H3Z"/>'
  };
  const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${HZ_ICON[k]}</svg>`;
  const nameOf = id => HAZARDS.find(h => h.id === id).name;
  const longDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let META = null;
  const metaReady = fetch('data/hazards_meta.json').then(r => (r.ok ? r.json() : null)).then(j => (META = j)).catch(() => null);

  function hazardCard(id) {
    const m = META.hazards[id], det = DETAIL[id] || {}, ni = NOT_INCLUDED[id];
    if (ni || !m || !m.events) return `<article class="hzc" id="hz-${id}" data-name="${nameOf(id).toLowerCase()}">
      <header><h3>${nameOf(id)}</h3><span class="hzc-tag soon">Not yet included</span></header>
      <p>${esc(det.what || '')}</p>
      <p class="hzc-note">Not part of NOAA's storm records. We are adding ${ni || 'USGS records'} next; until then, reports list it as not yet included rather than never recorded.</p></article>`;
    const pctC = Math.round(100 * m.counties / META.counties_total);
    const peak = peakSeason(m.by_month).replace(/ \(.*/, '');
    const bars = barChart(MONTHS.map(x => x[0]), m.by_month, 220, 34, { labelPeaksOnly: true, tick: () => true });
    return `<article class="hzc" id="hz-${id}" data-name="${nameOf(id).toLowerCase()}">
      <header><h3>${nameOf(id)}</h3><span class="hzc-tag">Tracked</span></header>
      <p>${esc(det.what || '')}</p>
      <dl class="hzc-stats">
        <div><dt>Counties with records</dt><dd>${m.counties.toLocaleString()} <small>of ${META.counties_total.toLocaleString()} (${pctC}%)</small></dd></div>
        <div><dt>${id === 'hurricane' ? 'Storm impacts' : 'Events'} since ${META.first_year}</dt><dd>${m.events.toLocaleString()}</dd></div>
        <div><dt>Most recorded in</dt><dd>${m.top_states.join(', ')}</dd></div>
        <div><dt>Peak season</dt><dd>${peak}</dd></div>
      </dl>
      <div class="hzc-season" aria-hidden="true">${bars}</div>
      ${m.latest ? `<p class="hzc-latest"><span class="live"></span>Most recent: ${longDate(m.latest.date)}${m.latest.name ? ` · ${esc(m.latest.name)}` : ''} · ${esc(m.latest.place)}</p>` : ''}
      <details><summary>What we count</summary><p>NOAA record types: ${m.noaa_types.join(', ')}. ${countRule(id, 'the county')}.${m.per_area ? ' Counties are compared per square mile, because these events are reported at points.' : ''}</p></details>
    </article>`;
  }
  async function renderHazardGuide(el, compact) {
    await metaReady;
    if (!META) { el.innerHTML = '<p class="small">The hazard data did not load. Reload the page to try again.</p>'; return; }
    const upd = `NOAA records through ${longDate(META.data_through)} · Updated ${longDate(META.updated)}`;
    if (compact) {
      el.innerHTML = `<div class="hz-groups">${HZ_GROUPS.map(([k, t, c, ids]) => `<div class="hz-group" style="--g:${c}"><div class="hz-head"><span class="hz-ic">${icon(k)}</span><div><h3>${t}</h3><p>${ids.length} hazards</p></div></div><ul>${ids.map(id => {
        const m = META.hazards[id];
        return `<li><a href="#hazards" data-hz="${id}"><b>${nameOf(id)}</b></a><small>${NOT_INCLUDED[id] || !m.events ? '<em>USGS data coming</em>' : `${m.counties.toLocaleString()} counties`}</small></li>`; }).join('')}</ul></div>`).join('')}</div><p class="small hz-upd">${upd}</p>`;
      return;
    }
    el.innerHTML = `<div class="hzg-top">
        <div class="hzg-stats"><div><b>${HAZARDS.length}</b><span>hazards in every report</span></div><div><b>${HAZARDS.filter(h => !NOT_INCLUDED[h.id]).length}</b><span>tracked from NOAA records today</span></div><div><b>${META.counties_total.toLocaleString()}</b><span>counties compared</span></div><div><b>${longDate(META.data_through)}</b><span>latest records included</span></div></div>
        <div class="hzg-tools"><label class="sr" for="hz-filter">Find a hazard</label><input id="hz-filter" type="search" placeholder="Find a hazard, e.g. hail">
        <nav class="hzg-jump" aria-label="Hazard groups">${HZ_GROUPS.map(([k, t, c]) => `<a href="#hazards" data-jump="${k}" style="--g:${c}">${t}</a>`).join('')}</nav></div>
      </div>
      ${HZ_GROUPS.map(([k, t, c, ids]) => `<section class="hzg" id="hzg-${k}" style="--g:${c}"><div class="hzg-head"><span class="hz-ic">${icon(k)}</span><h2 class="h3">${t}</h2><span class="small">${ids.length} hazards</span></div><div class="hzg-grid">${ids.map(hazardCard).join('')}</div></section>`).join('')}
      <p class="small hz-upd">${upd}. Source: NOAA Storm Events Database and NOAA hurricane tracks (IBTrACS); counties from the U.S. Census.</p>`;
    const f = el.querySelector('#hz-filter');
    f.addEventListener('input', () => {
      const q = f.value.trim().toLowerCase();
      el.querySelectorAll('.hzc').forEach(c => { c.hidden = q && !c.dataset.name.includes(q); });
      el.querySelectorAll('.hzg').forEach(g => { g.hidden = ![...g.querySelectorAll('.hzc')].some(c => !c.hidden); });
    });
    el.querySelectorAll('[data-jump]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); document.getElementById('hzg-' + a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
  }
  const gEl = document.getElementById('hz-guide'), hEl = document.getElementById('hz-home');
  if (gEl) renderHazardGuide(gEl, false);
  if (hEl) renderHazardGuide(hEl, true).then(() => hEl.querySelectorAll('[data-hz]').forEach(a => a.addEventListener('click', () => {
    setTimeout(() => { const c = document.getElementById('hz-' + a.dataset.hz); if (c) { c.scrollIntoView({ block: 'center' }); c.classList.add('flash'); setTimeout(() => c.classList.remove('flash'), 1600); } }, 120);
  })));

  // Shared with the "Get a report" flow
  window.EI_LAB = {
    ready: realReady,
    STATES, resolvePlace, countiesOf,
    makeReport(val, audience) {
      WM = 'PROTOTYPE';
      const loc = realGeocode(val), data = stepDataFile(loc, realLookup(loc), audience);
      return { loc, data, pages: stepTemplates(data) };
    },
    renderPreview, savePdf
  };

  // Open in a working state: real data when it loads, made-up data otherwise
  realReady.then(j => {
    if (!j) { document.getElementById('lab-mode-fake').checked = true; document.getElementById('lab-mode-real').disabled = true; }
    fillPlaces(); build();
  });
})();
