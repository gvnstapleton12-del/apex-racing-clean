# APEX Racing Insight

A proprietary full-stack predictive analytics platform engineered to model, simulate, and identify structural pricing inefficiencies in UK and Irish horse racing markets. By treating horse racing as an algorithmic asset-pricing challenge, the system isolates high-probability value selections where the public market price significantly underrepresents a runner's true mathematical probability of winning.

## Core Engine Architecture

Rather than relying on static, arbitrary weights, the platform evaluates live race cards using a multi-layered, point-in-time quantitative pipeline.

```
Live Race Card ──> [ Personal Affinity Gate ] ──> [ Pure Physics Engine ] ──> [ Platt Scaling & Calibration ] ──> [ Dynamic Value Gate ] ──> System Pick
```

### 1. Personal Affinity (PA) Signal Gate

A predictive filter that evaluates historical affinity trends. The engine strips out raw historical data and processes a localized profile across four vectors using a Bayesian posterior distribution (k=15 effective samples):

- **Track Geometry & Handedness** (35%)
- **Distance Adaptability** (30%)
- **Going/Surface Affinity** (25%)
- **Draw Bias & Pace Dynamics** (10%)

Runners with a negative or neutral PA rating are heavily filtered, acting as the system's primary defensive mechanism against low-margin volatility.

### 2. Multi-Dimensional Proven Zone Delta Model

The core physical profiling system does not score horses on rigid categories; instead, it anchors a runner's profile against its historical peak performance markers ("Winning Anchor") and measures the exact deviation (Delta) to today's conditions:

- **Official Rating (OR) & Weight Buffers** (35%)
- **Going-Distance Intersect Stability** (20%)
- **Distance Specialization** (20%)
- **Field Size Comfort Zones** (15%)
- **Class Constraints** (10%)

This scoring framework is dynamically smoothed via Bayesian shrinkage (k=5) against its trainer and track-cohort baseline to eliminate sample size anomalies.

### 3. Machine Learning Calibration & Dampening Pipeline

Raw winning probabilities are mapped via Monte Carlo simulations and scaled using an empirical Platt Scaling model derived from thousands of historical racing records.

To resolve the systemic over-prediction common in sports analytics modeling, the engine routes probabilities through a strict, piecewise Calibration Dampener (Brier Score = 0.0734). This flattens variance in the 5-40% probability ranges and guarantees that the system's expected value (EV) calculations mirror real-world outcomes.

### 4. Dynamic Value Gate Filtering

The platform rejects the concept of a flat value edge. A selection is only generated if its model-derived probability clears a Dynamic Value Gate tailored to market odds bands:

- **The Sweet Spot (4/1 to 10/1):** Operates on a highly optimized, relaxed 12% edge requirement where the model's calibration curve is tightest.
- **Longshots & Outsiders (10/1+):** Employs a strict 25% base underbet margin to account for long-tail variance.
- **Odds Floor:** A hard-coded filter blocks all selections under 2.0 (Evens), systematically eliminating dead money with low absolute returns.
- **Dynamic Quality Gate:** Replaces flat rating floors with a race-median + absolute minimum check, ensuring selections are both mathematically undervalued and fundamentally superior to their specific field.

## Validated Performance

| Metric | Value |
|--------|-------|
| Brier Score | 0.0734 |
| Top Pick Win Rate | 35.5% |
| Value Selection Win Rate | 16.0% |
| Value ROI (level stakes) | +78.4% |
| Kelly ROI | +0.8% |
| Calibration Error (0-20%) | <0.5pp |

## Project Structure

```
src/
├── lib/
│   ├── types.ts              # Domain interfaces (Race, Runner, HorseQuality, etc.)
│   ├── apexEngine.js         # Full scoring pipeline (calibration, dampener, value gate)
│   ├── engine.ts             # Intelligence engine (scoring, filtering, grading, formatting)
│   ├── personalAffinity.js   # Bayesian PA signal (4-vector posterior)
│   ├── horseMemoryEngine.js  # Proven Zone delta model, winning anchor, cohort baseline
│   ├── horseMemoryDb.js      # SQLite storage (horse_runs, jockey_runs, WAL mode)
│   ├── backtestContextBuilder.js  # Point-in-time context reconstruction
│   ├── componentScores.js    # Jockey/trainer form, class model, pace compatibility
│   ├── trackProfile.js       # Track bias, surface, draw bias per course (83 tracks)
│   ├── saveHorseRun.js       # Horse run persistence + previous_results ingestion
│   ├── racingApi.ts          # API client (typed return values)
│   ├── horseLinks.ts         # ATR/SL horse form URL builder with fallback chain
│   └── parseOdds.ts          # Fractional to decimal odds
├── components/
│   ├── RunnerDetailCard.tsx  # Shared runner detail (RacePage + RaceModal)
│   ├── ErrorBoundary.tsx     # Error boundary wrapper
│   └── (21+ dashboard widgets)
├── pages/
│   ├── RacePage.tsx          # Full race detail (uses RunnerDetailCard)
│   ├── Racecards.tsx         # Live racecard listing
│   ├── Results.tsx           # Results upload + display
│   ├── IntelligenceDashboard.tsx  # Multi-board hub
│   ├── Analytics.tsx         # Analytics views
│   ├── Proof.tsx             # Performance evidence dashboard
│   └── TrackDirectory.tsx    # 83 UK/IRE course profiles
├── main.tsx                  # App entry, routing, home page PickCards
└── styles.css                # Global styles + utility classes
```

## Technical Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, SQLite (WAL mode) |
| Data Ingestion | Headless Playwright with anti-detection, structured scraping |
| Intelligence Engine | Pure-function pipeline (no React dependencies) |
| Deployment | Docker (system Chromium), Railway-compatible |

## Getting Started

```bash
pnpm install
pnpm run dev

# Frontend at http://localhost:5173
# Backend at http://localhost:3000
```

## Scripts

| Command | Description |
|---|---|
| `pnpm run dev` | Start frontend (Vite) + backend (Express) concurrently |
| `pnpm run build` | Production build to dist/ |
| `pnpm run start` | Start backend only (production) |
| `pnpm run apk` | Build + sync Capacitor + open Android Studio |
| `pnpm run desktop` | Build Windows portable .exe via Electron |

## Data Pipeline

### Learning Engine

- Results matched against predictions for calibration
- SP odds replace pre-race odds when results arrive
- 5,134+ calibration records with point-in-time validation
- Historical backtest cache (30+ days, 14,000+ selections)

### Backtest Infrastructure

| Script | Purpose |
|---|---|
| `backtestPointInTime.mjs` | Chronological backtest with full context reconstruction |
| `backfillSweep.mjs` | Batch backfill of results from SL API |
| `backfillPreviousResults.mjs` | Patch previous_results into cache files from SL racecard API |
| `patchMissingCacheOdds.mjs` | Cross-reference SP odds from predictions.json |
| `mergeBacktestResults.mjs` | Merge multiple backtest runs with deduplication |
| `rebuildDailyPicks.mjs` | Rebuild daily picks from predictions.json |

### Scheduled Tasks

- Racecard refresh every 60 seconds
- Results scraper runs continuously during live racing
- 30-minute retry for past dates with pending picks
- Concurrent backfill protection via in-progress guard

## Architecture Principles

1. **Three-layer separation** -- Data layer, intelligence engine, presentation. No React in scoring logic.
2. **Point-in-time correctness** -- Backtest context rebuilt chronologically. No future data leakage.
3. **Model frozen** -- Weights locked. Any change judged against validated baseline (52.4% Top Pick WR, Brier 0.0854).
4. **Every metric shows sample size** -- n<30 flagged as insufficient. No false precision.
