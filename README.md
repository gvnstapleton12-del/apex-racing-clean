# APEX Racing Intelligence

Live racing intelligence platform for UK & Ireland horse racing. Provides real-time racecards, AI-powered runner analysis, confidence scoring, betting intelligence, pace mapping, and race replay tracking.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| Language | TypeScript (`.tsx`) / JavaScript (`.jsx`) |
| Styling | Tailwind CSS + custom CSS |
| State | React Query (`@tanstack/react-query`) |
| Backend | Express.js (Node) |
| Scraping | Playwright (headless Chromium) |
| Deploy | Static build (dist/) served by Express |

## Project Structure

```
src/
├── lib/
│   ├── types.ts              # Domain interfaces (Race, Runner, HorseQuality, etc.)
│   ├── engine.ts             # Intelligence engine (scoring, filtering, grading)
│   ├── apexEngine.js         # Full scoring pipeline (processRace)
│   ├── paceEngine.js         # Early pace score, running style, race shape detection
│   ├── energyModel.js        # Energy distribution (early/late/mid) per runner
│   ├── horseTags.js          # Pace compatibility, ground suitability tags
│   ├── trackProfile.js       # Track bias, surface, draw bias per course
│   ├── classModel.js         # Class level classification, OR/RPR fit
│   ├── trainerFreshness.js   # Layoff bands, Bayesian regression toward mean
│   ├── schemas.ts            # Zod validation schemas for API data
│   ├── racingApi.ts          # API client (fetchRacecards, fetchResults)
│   ├── validate.ts           # Lightweight data validation layer
│   ├── formatTime.ts         # 24hr time formatter
│   ├── horseLinks.ts         # ATR horse form URL builder
│   └── parseOdds.ts          # Fractional → decimal odds parser
│   ├── scrapers/
│   │   ├── sportingLifeScraper.js  # SL results scraper (Playwright)
│   │   ├── atrScraper.js          # ATR racecard scraper
│   │   └── browserPool.js         # Shared browser instance pool
├── components/
│   ├── RunnerDetailCard.tsx   # Shared runner detail (RacePage + RaceModal)
│   ├── RacePressureGraph.jsx  # Pace map visualisation
│   ├── ErrorBoundary.tsx      # Error boundary wrapper
│   └── (21+ dashboard widgets)
├── pages/
│   ├── RacePage.tsx           # Full race detail (uses RunnerDetailCard)
│   ├── Racecards.tsx          # Live racecard listing
│   ├── Results.tsx            # Results upload + display
│   ├── IntelligenceDashboard.tsx  # Multi-board hub
│   ├── Replays.jsx            # Replay note management
│   └── Analytics.tsx          # Analytics views
├── main.tsx                   # App entry, routing, home page PickCards
└── styles.css                 # Global styles + utility classes
```

## Architecture

Three-layer separation:

1. **Data Layer** (`src/lib/`) — API clients, type definitions, scrapers, validation
2. **Intelligence Engine** (`src/lib/`) — Pure functions for scoring, pace mapping, energy, track profiles
3. **Presentation Layer** (`src/pages/`, `src/components/`) — React components with typed props

## Getting Started

```bash
npm install
npm run dev

# Frontend at http://localhost:5173
# Backend at http://localhost:3000
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start frontend (Vite) + backend (Express) |
| `npm run build` | Production build (Vite) |
| `npm run server` | Start backend only |


## Intelligence Engine

### Scoring Pipeline

Each runner is scored by multiple engines, combined into a final APEX score:

- **Energy Model** — Early/late energy distribution based on running style, pace score, form
- **Pace Map** — Early pace score (0-100) per horse, race shape detection (lone leader, no clear leader, collapse risk)
- **Horse Tags** — Pace compatibility, ground suitability, class level indicators
- **Value Detection** — AI confidence vs market odds comparison
- **Trainer Freshness** — Layoff impact with Bayesian regression toward mean
- **Uncertainty Model** — Confidence interval estimation

### Pace Mapping

- `computeEarlyPaceScore(runner)` — Continuous 0-100 score based on form, draw, odds, comments
- `detectRaceShape(runners)` — Classifies race as: Lone Leader, No Clear Leader, Controlled Pace, Strong Pace, Pace Collapse
- `classifyRunningStyle(runner)` — Front Runner (≥72), Prominent (≥56), Midfield, Hold Up (≤35)
- Identifies **beneficiaries** and **disadvantaged** runners based on race shape

### Track Profiles

- 83 UK/IRE courses with handedness, surface type, draw bias, pace profiles
- Surface suitability scoring for each runner
- Draw bias adjustments per track and distance

### Trainer Freshness

- 6 layoff bands (1-7d, 8-14d, 15-30d, 31-60d, 61-90d, 90d+)
- Bayesian regression toward league average for small samples (min 20 runs)
- Fresh factor multiplier: 0.5 (very stale) to 2.0 (very fresh)

## Data Pipeline

### Results Scraping

- Sporting Life scraper uses Playwright (headless Chromium)
- Auto-dismisses cookie consent, navigates to each race page
- Extracts: horse, position, jockey, trainer, SP odds, run comments
- Filters to UK/IRE courses only
- Re-scrapes past dates if data is incomplete (<10 races)

### Learning Engine

- Results matched against predictions for calibration
- SP odds replace pre-race odds when results arrive
- Anti-overfit protection with protected weight adjustment
- 2,602 calibration records, 275 wins (10.6%), 550 placed (31.7%), Brier 0.0901 — NEEDS CALIBRATION

### Scheduled Tasks

- Racecard refresh every 60 seconds
- Results re-scrape every 30 minutes
- 8am daily racecard fetch
- Learning engine runs after each results batch

## Features

- **Live Racecards** — Real-time GB/IRE race listings with runner scores
- **Pace Map** — Visual race shape with beneficiaries/disadvantaged lists
- **APEX Scoring** — Multi-component confidence scoring (6 engines)
- **Intelligence Dashboard** — 15+ boards: Value Index, Volatility, Top Rated, Smart Money, etc.
- **Race Detail** — Per-runner breakdown of all engines
- **Results Scraping** — Automated SL results with SP odds extraction
- **Learning System** — Self-improving calibration from historical results
- **Trainer Freshness** — Layoff impact on runner fitness
- **Track Profiles** — Course-specific biases and surface data
- **Replay Notes** — Structured flag system for race replay analysis
- **Home PickCards** — Daily selections with W/P/L results

