# ISU World Sprint Championships 2026 — Live Dashboard

**Thialf · Heerenveen · 5–6 March 2026**

## Overview

Live dashboard for the ISU World Sprint Championships. Displays real-time results, standings, start lists, and pair comparisons using data from the ISU Results API.

## Features

### Overview Page (4-tile layout)
- **① Live Results** — Current distance results sorted by time, with TR/PB badges
- **② Live Standings** — Real-time overall sprint championship standings
- **③ Start List** — Start list with lane indicators (🔴 outer / ⚪ inner) and target time for P1
- **④ Frozen Standings** — Standings snapshot, manually updateable via button. Shows target times for next distance

### Interactions
- **Click athlete name** → Popup with all tournament results, records, and PB per distance
- **Click pair/rit number** → Pair comparison popup with head-to-head results, point difference, and time equivalent
- **Distance selector** → Controls which distance tile 1 & 3 show

### Additional Pages
- **Individual distance views** — Full results + sidebar standings with target times
- **Full Standings** — Complete klassement with all distance times and medals

## Sprint Format

Sprintvierkamp: 1st 500m → 1st 1000m → 2nd 500m → 2nd 1000m

**Points** = time(seconds) ÷ distance factor (500m=1, 1000m=2)

## Data Source

- Primary: `api.isuresults.eu` (JSON API)
- Fallback 1: allorigins proxy
- Fallback 2: Jina Reader (text parsing)
- Poll interval: 3 seconds

## Configuration

In `app.js`, line 5:
```js
const EVENT_ID = "2024_GER_0001";  // Change to "2026_NED_0002" for live event
```

## Competition IDs (within event)

| # | Distance |
|---|----------|
| 1 | 1st 500m Women |
| 2 | 1st 500m Men |
| 3 | 1st 1000m Women |
| 4 | 1st 1000m Men |
| 5 | 2nd 500m Women |
| 6 | 2nd 500m Men |
| 7 | 2nd 1000m Women |
| 8 | 2nd 1000m Men |

## Deployment

Static files — deploy to any web server or open `index.html` directly. No build step required.

## Files

- `index.html` — Page structure
- `app.js` — Application logic, data fetching, rendering
- `styles.css` — ISU-styled dark theme
