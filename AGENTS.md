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
└── main.jsx              # App entry + home page PickCard
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

### Pending / Future
- [ ] Further engine extraction from dashboard widgets (some inline calculations remain)
- [ ] Add zod/valibot for schema validation if data shape issues arise
- [ ] Convert `main.jsx` → `main.tsx` for full type coverage
- [ ] Better loading states for individual widgets
- [ ] RaceModal — convert to use same Tailwind card pattern as RacePage

## Conventions

- **Imports**: Relative paths (`../lib/types`) for pages, `@/components/` for components (Vite alias)
- **Types**: Always use proper interfaces from `types.ts`, never `any`
- **Styling**: Tailwind utility classes via custom CSS file; no inline `style={{}}` objects
- **Scores**: Always use `getScore(runner)` from engine, never manual fallback chains
- **Race filtering**: Use `filterGBIRE()`, `filterToday()`, `sortByOffTime()` from engine
- **Commits**: `npm run build` before every commit; build must pass

## Running

```bash
npm run dev    # Frontend :5173 + Backend :3000
npm run build  # Production build
```
