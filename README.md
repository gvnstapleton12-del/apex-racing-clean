# APEX Racing Intelligence

Live racing intelligence platform for UK & Ireland horse racing. Provides real-time racecards, AI-powered runner analysis, confidence scoring, betting intelligence, and race replay tracking.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite |
| Language | TypeScript (`.tsx`) / JavaScript (`.jsx`) |
| Styling | Tailwind CSS + custom CSS |
| State | React Query (`@tanstack/react-query`) |
| Backend | Express.js (Node) |
| Database | PostgreSQL (via `pg`) |
| Deploy | Vercel (frontend) + Railway (backend) |

## Project Structure

```
src/
├── lib/
│   ├── types.ts          # Domain interfaces (Race, Runner, Score, etc.)
│   ├── engine.ts         # Intelligence engine (scoring, filtering, grading)
│   ├── racingApi.ts      # API client (fetchRacecards, fetchResults)
│   ├── formatTime.ts     # Race time formatters
│   ├── horseLinks.ts     # ATR horse form URL builder
│   └── parseOdds.ts      # Fractional → decimal odds parser
├── components/           # Reusable UI widgets (21+ dashboard boards)
├── pages/
│   ├── RacePage.tsx      # Full race detail view
│   ├── Racecards.tsx     # Live racecard listing
│   ├── Results.tsx       # Results upload + display
│   ├── IntelligenceDashboard.tsx  # Multi-board intelligence hub
│   ├── Replays.jsx       # Replay note management
│   └── Analytics.tsx     # Analytics views
├── main.tsx              # App entry, routing, home page
└── styles.css            # Global styles + utility classes
```

## Architecture

The project follows a three-layer separation:

1. **Data Layer** (`src/lib/`) — API clients, type definitions, format utilities
2. **Intelligence Engine** (`src/lib/engine.ts`) — Pure functions for scoring, filtering, sorting, grading
3. **Presentation Layer** (`src/pages/`, `src/components/`) — React components with typed props

AI confidence and race intelligence logic lives entirely in `engine.ts`, keeping components clean and testable.

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server (frontend + backend concurrently)
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

## Features

- **Live Racecards** — Real-time GB/IRE race listings with runner scores
- **APEX Scoring** — Multi-component confidence scoring (6 engines)
- **Intelligence Dashboard** — 15+ boards: Value Index, Volatility, Top Rated, Smart Money, etc.
- **Race Detail** — Per-runner breakdown of Horse Quality, Simulation, Value, Bankroll engines
- **Results Upload** — JSON upload with automatic deduplication
- **Replay Notes** — Structured flag system for race replay analysis
- **UK/IRE Filter** — All views filtered to GB and Ireland meetings only

## Key Packages

- `react`, `react-dom` — UI framework
- `@tanstack/react-query` — Server state, caching, polling (60s refetch)
- `vite` — Build tool
- `express` — API server
- `pg` — PostgreSQL client
- `concurrently` — Run frontend + backend in parallel
