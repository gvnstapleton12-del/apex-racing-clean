import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'

import Racecards from './pages/Racecards'
import UploadResults, {
  ResultsList,
} from './pages/Results'
import { fetchRacecards } from './lib/racingApi'
import { openAtTheRacesHorseForm } from './lib/horseLinks'

const queryClient =
  new QueryClient()

const tabs = [
  'Home',
  'Racecards',
  'Results',
  'Intelligence',
  'Alerts',
  'Horses',
  'Upload',
  'Analytics',
]

function getRunnerScore(runner) {
  return (
    runner.aiProfile?.confidence ||
    runner.score ||
    0
  )
}

function getHomeSelections(races) {
  return races
    .flatMap((race) =>
      (race.runners || []).map((runner) => ({
        ...runner,
        race,
        raceName: race.race_name,
        course: race.course,
        offTime: race.off_time,
        score: getRunnerScore(runner),
      }))
    )
    .sort((a, b) => (b.score || 0) - (a.score || 0))
}

function PickCard({ label, selection, featured = false }) {
  if (!selection) {
    return (
      <article className='pick-card'>
        <span>{label}</span>
        <h3>No pick available</h3>
        <p>Waiting for the live race feed.</p>
      </article>
    )
  }

  return (
    <article
      className={
        featured ? 'pick-card pick-card-featured' : 'pick-card'
      }
    >
      <div className='pick-card-top'>
        <span>{label}</span>
        <strong>{selection.score}</strong>
      </div>

      <button
        type='button'
        className='pick-horse-button'
        onClick={() =>
          openAtTheRacesHorseForm(selection, selection.race)
        }
      >
        {selection.horse}
      </button>

      <p>
        {selection.offTime} - {selection.course}
      </p>

      <p>{selection.raceName}</p>

      <div className='pick-meta'>
        <span>Odds {selection.odds || '-'}</span>
        <span>Form {selection.form || '-'}</span>
        <span>Draw {selection.draw || '-'}</span>
      </div>
    </article>
  )
}

function Home() {
  const {
    data: races = [],
    isLoading,
  } = useQuery({
    queryKey: ['home-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const selections = getHomeSelections(races)
  const nap = selections[0]
  const nextBest = selections[1]
  const eachWay = selections.find(
    (selection) =>
      selection !== nap &&
      selection.odds &&
      (selection.score || 0) >= 60
  )
  const totalRunners = selections.length

  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>Home</span>

          <h1>Today&apos;s system picks</h1>

          <p>
            The live APEX model ranks every runner and promotes the
            strongest selections into NAP, next best and value slots.
          </p>
        </div>

        <div className='hero-metrics'>
          <div>
            <span>Races</span>
            <strong>{races.length}</strong>
          </div>

          <div>
            <span>Runners</span>
            <strong>{totalRunners}</strong>
          </div>

          <div>
            <span>Top score</span>
            <strong>{nap?.score || '--'}</strong>
          </div>
        </div>
      </section>

      {isLoading ? (
        <div className='loading-card'>
          <div className='pulse-dot' />
          <span>Finding the strongest system picks...</span>
        </div>
      ) : (
        <section className='pick-grid'>
          <PickCard
            label='NAP'
            selection={nap}
            featured
          />

          <PickCard
            label='Next Best'
            selection={nextBest}
          />

          <PickCard
            label='Each-Way Value'
            selection={eachWay}
          />
        </section>
      )}
    </div>
  )
}

function PlaceholderPage({ title }) {
  return (
    <div className='dashboard-page'>
      <section className='empty-state'>
        <span>{title}</span>
        <h2>{title} workspace</h2>
        <p>
          This tab is ready for the next layer of APEX tooling.
        </p>
      </section>
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] =
    useState('Home')
  const [uploadedResults, setUploadedResults] =
    useState([])

  useEffect(() => {
    async function loadSavedResults() {
      try {
        const response = await fetch(
          'http://localhost:3000/api/results'
        )

        const data = await response.json()

        if (Array.isArray(data)) {
          setUploadedResults(data)
        }
      } catch (error) {
        console.error(
          'Failed to load saved results',
          error
        )
      }
    }

    loadSavedResults()
  }, [])

  const handleResultsLoaded = (
  results,
  switchTab = true
) => {
  setUploadedResults(results)

  if (switchTab) {
    setActiveTab('Results')
  }
}

  const renderPage = () => {
    if (activeTab === 'Racecards') {
      return <Racecards />
    }

    if (activeTab === 'Results') {
      return <ResultsList results={uploadedResults} />
    }

    if (activeTab === 'Upload') {
      return (
        <UploadResults
          onResultsLoaded={handleResultsLoaded}
        />
      )
    }

    if (activeTab === 'Home') {
      return <Home />
    }

    return <PlaceholderPage title={activeTab} />
  }

  return (
    <div className='layout'>
      <aside className='sidebar'>
        <div className='brand'>
          <div className='brand-mark'>A</div>

          <div>
            <h1>APEX</h1>
            <p>Racing Intelligence</p>
          </div>
        </div>

        <nav>
          {tabs.map((tab) => (
            <button
              key={tab}
              type='button'
              className={
                activeTab === tab ? 'active' : ''
              }
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </nav>

        <div className='sidebar-panel'>
          <span>Live Mode</span>
          <strong>Market scan active</strong>
        </div>
      </aside>

      <main className='main'>
        {renderPage()}
      </main>
    </div>
  )
}

ReactDOM.createRoot(
  document.getElementById('root')
).render(
  <React.StrictMode>
    <QueryClientProvider
      client={queryClient}
    >
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
