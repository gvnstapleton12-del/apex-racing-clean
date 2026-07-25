# APEX Racing Intelligence — Agent Context

## Project Structure

```
src/
├── lib/
│   ├── types.ts          # Domain interfaces (Race, Runner, HorseQuality, etc.)
│   ├── engine.ts         # Intelligence engine (scoring, filtering, grading, formatting)
│   ├── validate.ts       # Lightweight data validation layer
│   ├── racingApi.ts      # API client (typed return values)
│   ├── formatTime.ts     # 24hr time formatter
│   ├── horseLinks.ts     # ATR horse form URL builder
│   └── parseOdds.ts      # Fractional → decimal odds
├── components/
│   ├── RunnerDetailCard.tsx  # Shared runner detail (used by RacePage + RaceModal)
│   ├── ErrorBoundary.tsx     # Error boundary wrapper
│   └── (21+ dashboard widgets, all typed with Race[]/Runner)
├── pages/
│   ├── RacePage.tsx      # Full race detail (uses RunnerDetailCard)
│   ├── Racecards.tsx      # Live racecard listing
│   ├── Results.tsx        # Results upload + display
│   ├── IntelligenceDashboard.tsx  # Multi-board hub (error-boundary-wrapped)
│   ├── Replays.jsx
│   └── Analytics.tsx
└── main.tsx              # App entry + home page PickCard
```

## Architecture

Three-layer separation:
1. **Data layer** — `racingApi.ts`, `types.ts`, `formatTime.ts`, `validate.ts`
2. **Intelligence engine** — `engine.ts` (pure functions, no React)
3. **Presentation** — `pages/` + `components/` (typed props, no inline scoring logic)

## Current State

### Completed
- ✅ Domain types defined (`Race`, `Runner`, `HorseQuality`, etc.)
- ✅ Engine extracted (scoring, filtering, grading, home selections)
- ✅ Data validation between API and components
- ✅ Error boundaries on all 15+ dashboard widgets
- ✅ RaceModal duplication eliminated via shared `RunnerDetailCard`
- ✅ All widget components typed (`any[]` → `Race[]`)
- ✅ RacePage inline styles → Tailwind classes
- ✅ Home page score ring visible (flex layout, no absolute positioning)
- ✅ Race times in 24hr format
- ✅ README updated with full architecture
- ✅ Sporting Life results scraper fixed — correctly extracts finish positions, SP odds, jockey/trainer
- ✅ Code-match penalty — horses penalised when form is from different race code (Flat vs Hurdle/Chase)
- ✅ Horse Profiles database (`6981 profiles from 1056 races`) — career/course/distance/going/CD win rates with deltas vs career WR
- ✅ Horse profile cards displayed in RunnerDetailCard (compact 4-column grid with ▲▼ delta indicators)
- ✅ 23 insight/handedness mismatches fixed in trackProfiles.json (Gowran Park: left→right)
- ✅ 36 missing jumping ratings added for jumps tracks in trackProfiles.json
- ✅ Promotion Source Audit — decomposed 99.4% "Other" bucket into trainerForm 26%, personalAffinity 24%, ground 22%, rprORGap 12%, distance 9%
- ✅ A/B test (power×0.667, ground×2.667) — null result, engine multi-pathway architecture absorbs single-component scaling
- ✅ Component Delta Audit — re-ran engine on 339 close misses to extract actual component deltas
- ✅ Promotion Source Audit — decomposed 99.4% "Other" bucket into trainerForm 26%, personalAffinity 24%, ground 22%, rprORGap 12%, distance 9%
- ✅ specialistIndex tested — 25% winner better, zero median delta, adds nothing beyond personalAffinity
- ✅ Interaction Trace — personalAffinity + trainerForm co-occur in 31% of promotions; PA present in 89% of trainerForm-driven and 99% of ground-driven promotions
- ✅ PersonalAffinity Decomposition v2 — PA is 86% a course-win-rate signal (trackAdj 90% winner better, 291/339 primary driver); distanceAdj 3%, goingAdj/drawStyleAdj 0%
- ✅ **PA > 0 value gate shipped** — `betQuality` set to `'NO BET'` for any runner with `personalAffinity <= 0` (apexEngine.js:748). Ranking/Top Pick WR unaffected.
- ✅ **PA > 0 gate confirmed by A/B backtest** — `--pa-gate` flag on `backtest_historical.mjs`. Value WR 30.3%→37.9%, Value ROI +138%→+198%, Kelly ROI +551%→+706%. Top Pick WR unchanged.
- ✅ **No temporal leakage** — Persisted store had 0 blendable horses. All PA from `previous_results` (racecard form history). Debutant bias negligible.
- ✅ **Value Pick Audit** — `analysis/valuePickAudit.mjs` analyzes why value picks changed between baseline and current. Confirmed personalAffinity is the dominant separator (+7.07 delta between added winners and removed losers).
- ✅ **Calibration audit added to backtest** — Fine-grained 5% probability buckets, MACE metric, saved to `data/calibration-audit.json`.
- ✅ **PA Gate Monitor API** — `GET /api/pa-gate-monitor` tracks passed vs PA-rejected vs other-rejected performance across live predictions.
- ✅ **PA visual indicator in RunnerDetailCard** — Color-coded badge: ✓ PA Strong/Positive/Weak or ✗ PA Negative.
- ✅ **Three permanent benchmarks saved** — `backtest-baseline-pa25.json` (orig), `backtest-results-current.json` (current), `backtest-baseline-pa-gate.json` (PA gate shipped).
- ✅ **Oracle Cloud server shutdown** — pm2 stop+delete apex; instance left parked (not terminated). Was never stable enough to be useful (stale dist, data format issues).
- ✅ **Evidence tab API routes fixed** — Removed broken duplicate route block (lines 68-119) from server.js that imported non-existent modules. Real working routes at ~lines 1441+ serve 5438 historical records, 4237 learning bets.
- ✅ **express.static re-added** — Static serving line had been accidentally deleted with broken route block; restored after JSON middleware.
- ✅ **BrowserPool Windows fix** — Added `--no-proxy-server`, `--ignore-certificate-errors`, `--disable-features=NetworkService` to Chromium launch args to fix `ERR_INTERNET_DISCONNECTED`.
- ✅ **Track Directory pace data audited** — `paceBiasByGoing` is draw-derived (not historical running styles). All 83 tracks have `paceBias`, 83 have `paceBiasByGoing`, 55 have `derivedStats`.
- ✅ **Track Directory UI relabelled** — "Pace Bias" → "Track Positioning Bias" with data-quality gate: real draw bias when available (Historical Draw Bias), heuristic fallback when not (with "Estimated" disclaimer).
- ✅ **Daily picks freeze fix** — Both client (`main.tsx:462`) and server (`server.js:1519`) now check if picks exist at all (not just null results). First save of the day is final; never overwritten.
- ✅ **Horse memory schema alignment** — Added `or_rating`/`rpr_rating`/`starting_price` columns to `horseMemoryDb.js`, matching `saveHorseRun.js` inserts. Added WAL mode + synchronous=NORMAL for concurrent reads.
- ✅ **Horse memory batch query** — `getHorseMemoryBatch` in `horseMemoryEngine.js` replaces N serial SQLite queries with 1 `WHERE horse_name IN (...)` query. Estimated 60s→~3s per race.

### Pending / Future
- [ ] **Paper-track PA gate live** — Run 200-500 live races collecting PA > 0 vs PA ≤ 0 performance via `/api/pa-gate-monitor`
- [ ] **Ranking gate (exploratory only)** — Revisit `finalScore -= 999` for PA ≤ 0 after live validation. Do NOT ship yet.
- [ ] Further engine extraction from dashboard widgets (some inline calculations remain)
- [ ] Add zod/valibot for schema validation if data shape issues arise
- [x] Convert `main.jsx` → `main.tsx` for full type coverage
- [ ] Better loading states for individual widgets
- [ ] RaceModal — convert to use same Tailwind card pattern as RacePage
- [ ] Speed up results scraper (5+ min per date is slow; consider parallel fetching)
- [ ] Replace template paceBiasByGoing with calculated historical data
- [x] **Startup retry logic** — `startupFetchWithRetry()` retries up to 3 times at 60s intervals if no races loaded
- [x] **ATR child process isolation** — ATR Playwright scraping runs in `atrWorker.js` via `child_process.spawn()`, preventing event loop blocking
- [x] **Health check + auto-restart** — `/api/health` endpoint + self-ping every 60s. After 3 consecutive failures, triggers `gracefulShutdown('HEALTH_CHECK_RESTART')`
- [x] **Horse memory SQLite fix** — Schema now includes `or_rating`/`rpr_rating`/`starting_price` columns (matching saveHorseRun.js inserts). WAL mode + synchronous=NORMAL added for concurrent reads. Batch query (`getHorseMemoryBatch`) replaces N serial queries with 1 `WHERE horse_name IN (...)` — estimated 60s→~3s per race.

## Validated Findings

### Provable Rules (backtest-confirmed, no trade-offs)

| Rule | Evidence | Impact |
|-------|----------|--------|
| **PA > 0 for value bets** | A/B backtest (--pa-gate): Value WR +7.6pp, Value ROI +60pp, Kelly +155pp. No ranking change. | **SHIPPED** |
| **PA ≤ 0 is a near-total non-contender filter** | Backtest: 1 winner from 3642 PA ≤ 0 selections (0.03% WR). Top picks with PA ≤ 0: 0/25. | **Value gate only for now** |

### Strong Signals

| Signal | Winner Better | Avg Delta | Med Delta | Notes |
|--------|:-:|:-:|:-:|-------|
| **personalAffinity** | 89% | +4.47 | +5.0 | Bayesian position-based. Keep as-is. |
| **ground** | 25% | +6.59 | 0.0 | Rare (25% of promotions) but highest avg delta when it fires. Keep. |
| **trainerForm** | 35% (driver: 26%) | +0.25 | 0.0 | Frequent small positive. Promoted 87/339 races. |
| **rprORGap** | 55% | +1.32 | +0.7 | Moderate consistent signal. RPR says winner > OR. |

### Weak / Null Signals

| Signal | Winner Better | Avg Delta | Med Delta | Verdict |
|--------|:-:|:-:|:-:|---------|
| **specialistIndex** | 25% | +11.4pp | 0.0pp | Noise — adds nothing beyond personalAffinity |
| **courseAffinity** | 86% | +0.38 | +0.4 | Everywhere but tiny. Not a standalone driver. |
| **paceCompat** | 3% | +0.13 | 0.0 | Barely differentiates |
| **raceShape** | 1% | +0.01 | 0.0 | Effectively dead |
| **power** | 6% (driver: 2%) | −1.29 | 0.0 | Pick has MORE power than winner. Over-rewarded but single-component scaling has no effect. |
| **distanceAffinity** | 31% | +0.07 | 0.0 | Too sparse to matter |
| **goingAffinity** | 0% | 0.00 | 0.0 | Dead (gated by runs≥3) |

### ×2.5 Mystery — RESOLVED

The ×2.5 course multiplier improves backtest metrics (+133% Kelly, 52.4% Top Pick WR) but courseAffinity itself (BHA-based `computeCourseAffinity`) is tiny (+0.38 avg delta, 86% winner better but never the primary driver). The improvement comes from **amplifying personalAffinity's track subcomponent** — which is a course win rate signal (86% of PA, 90% winner better, 291/339 primary driver). Since PA is the backbone supporting every other feature (present in 89% of trainerForm-driven and 99% of ground-driven promotions), the multiplier interacts with the entire feature network. Not from BHA-based courseAffinity directly.

### Open Questions

- Why does ×2.5 improve backtests if courseAffinity itself is tiny?
  - **Resolved**: PA's track subcomponent (win-rate-based, not BHA-based) is the real driver
- Is personalAffinity benefiting from interaction effects with trainerForm?
  - **Yes**: PA + trainerForm both positive in 31% of promotions
- Are trainerForm and personalAffinity jointly responsible for the majority of promotions?
  - **Yes**: together with ground they constitute 72% of promotions
- Is promotion attribution still missing second-order interactions?
  - Potential, but PA decomposition shows course win rate dominates (86%)
- The A/B test showed single-component weight scaling has no effect — only multi-component interaction shifts produce metric changes.
  - **Confirmed**: power×0.667 and ground×2.667 produced zero ranking change

## Key Decisions
- **×2.5 stays**: The improvement is real, even if the source isn't course affinity alone
- **Do not elevate specialistIndex**: 25% winner better is noise; personalAffinity already captures this
- **Do not touch weights**: A/B test proved single-component scaling is absorbed by multi-pathway architecture
- **Model frozen**: courseMultiplier=2.5, disableGoing=true, distanceAffinity=1.0 locked. The engine is now an interaction system (PA + trainerForm + ground) where single-coefficient tuning has proven ineffective. Any new scoring change must be judged against the validated baseline (52.4% Top Pick WR, +133% Kelly ROI, Brier 0.0854).

## Roadmap

### Phase 1 — Freeze the model ✅ (current state)
courseMultiplier=2.5, disableGoing=true, distanceAffinity=1.0 exactly as-is.

### Phase 2 — Forward test (next)
Run 200-500 live races tracking: Top Pick WR, Top 3 WR, Kelly ROI, Brier, specialist track WR.
Biggest risk: overfitting historical data.

### Phase 3 — Improve data quality
Remaining bottlenecks (more impactful than scoring tweaks):
- RPR coverage (52%)
- Jockey database (nearly empty)
- Going database (weak)
- Personal affinity store (sparse)

### Phase 4 — Stop
No new scoring features. No weight tuning. The model's edge comes from interactions (PA + trainerForm + ground), not from finding magic weights.

## Signal Tiers

### Tier 1 — Proven (embedded in WinnerScore)
| Signal | Source | Why |
|--------|--------|-----|
| `personalAffinity.trackAdj` | PA track component | 90% winner better, 86% of promotions |
| `trainerForm` | componentScores | 26% primary driver, frequent small positive |
| `ground` | componentScores | +6.59 avg delta when it fires |
| `rprORGap` | classModel | 55% winner better, +1.32 avg delta |

### Tier 2 — Useful but secondary
| Signal | Source | Why |
|--------|--------|-----|
| `distanceAdj` | PA distance component | 32% winner better, 72% when ungated |

### Tier 3 — Effectively inactive
| Signal | Reason |
|--------|--------|
| `goingAdj` | 0% winner better, 99% gated (runs < 3) |
| `drawStyleAdj` | 5% winner better, avg delta ≈ 0 |
| `paceCompat` | 3% winner better |
| `raceShape` | 1% winner better |
| `specialistIndex` | 25% at chance, median 0 |

Stop spending time on Tier 3 until a future audit proves otherwise.

## Conventions

- **Imports**: Relative paths (`../lib/types`) for pages, `@/components/` for components (Vite alias)
- **Types**: Always use proper interfaces from `types.ts`, never `any`
- **Styling**: Tailwind utility classes via custom CSS file; no inline `style={{}}` objects
- **Scores**: Always use `getScore(runner)` from engine, never manual fallback chains
- **Race filtering**: Use `filterGBIRE()`, `filterToday()`, `sortByOffTime()` from engine
- **Commits**: `npm run build` before every commit; build must pass

## Build & Deploy

```bash
npm run dev              # Frontend :5173 + Backend :3000
npm run build            # Production build (dist/)
npm run apk              # Build + sync Capacitor + open Android Studio (APK)
npm run desktop          # Build Windows portable .exe (via Electron)
npm run electron:dev     # Test Electron app locally
```

## Mobile APK (Android)

```bash
npm run apk
```
Requires Android Studio installed. The APK will be at `android/app/build/outputs/apk/debug/`.

## Desktop App (Windows)

```bash
npm run desktop
```
The `.exe` will be in `dist/` folder. No dependencies needed to run it.

### Requirements
- **APK**: Android Studio (free, download from developer.android.com)
- **Desktop (.exe)**: No extra tools required
