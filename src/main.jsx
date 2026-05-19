import React from 'react'
import ReactDOM from 'react-dom/client'

import './styles.css'

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'

import Racecards from './pages/Racecards'

const queryClient =
  new QueryClient()

function App() {
  return (
    <div className='layout'>
      <aside className='sidebar'>
        <h1>APEX</h1>

        <nav>
          <button>Dashboard</button>
          <button>Racecards</button>
          <button>Results</button>
          <button>Intelligence</button>
          <button>Alerts</button>
          <button>Horses</button>
          <button>Upload</button>
          <button>Analytics</button>
        </nav>
      </aside>

      <main className='main'>
        <Racecards />
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