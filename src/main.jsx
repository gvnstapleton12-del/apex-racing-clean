import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

import Racecards from './pages/Racecards'
import Results from './pages/Results'

const queryClient =
  new QueryClient()

const tabs = [
  'Dashboard',
  'Racecards',
  'Results',
  'Intelligence',
  'Alerts',
  'Horses',
  'Upload',
  'Analytics',
]

function DashboardHome() {
  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>APEX overview</span>

          <h1>Racing intelligence dashboard</h1>

          <p>
            Your high-level workspace for market signals, alerts,
            bankroll performance and daily racing intelligence.
          </p>
        </div>

        <div className='hero-metrics'>
          <div>
            <span>Mode</span>
            <strong>Live</strong>
          </div>

          <div>
            <span>Feed</span>
            <strong>On</strong>
          </div>

          <div>
            <span>Status</span>
            <strong>Ready</strong>
          </div>
        </div>
      </section>

      <section className='empty-state'>
        <span>Dashboard</span>
        <h2>Live races now live under Racecards</h2>
        <p>
          Use the Racecards tab in the sidebar to view the live
          race list, runner scores and race modals.
        </p>
      </section>
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
    useState('Dashboard')

  const renderPage = () => {
    if (activeTab === 'Racecards') {
      return <Racecards />
    }

    if (
      activeTab === 'Results' ||
      activeTab === 'Upload'
    ) {
      return <Results />
    }

    if (activeTab === 'Dashboard') {
      return <DashboardHome />
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
