import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [racecards, setRacecards] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const response = await fetch('http://localhost:3000/api/live-meetings')
        const data = await response.json()

        setRacecards(data.racecards || [])
      } catch (error) {
        console.error('Failed to fetch live meetings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [])

  const renderContent = () => {
    if (activeTab === 'Dashboard') {
      return (
        <>
          <section className='hero'>
            <div>
              <h2>Daily Betting Board</h2>
              <p>Live Racing API horse racing intelligence dashboard</p>
            </div>

            <button>Live Racing</button>
          </section>

          <section className='stats'>
            <div className='card'>
              <span>Today's Races</span>
              <h3>{racecards.length}</h3>
            </div>

            <div className='card'>
              <span>API Status</span>
              <h3>LIVE</h3>
            </div>

            <div className='card'>
              <span>Database</span>
              <h3>Connected</h3>
            </div>

            <div className='card'>
              <span>Backend</span>
              <h3>Online</h3>
            </div>
          </section>

          {loading ? (
            <div className='card'>
              <h2>Loading live race meetings...</h2>
            </div>
          ) : (
            <section className='bet-board'>
              <div className='board-header'>
                <h2>Live Meetings</h2>
              </div>

              {racecards.slice(0, 10).map((race) => (
                <div className='bet-card' key={race.race_id}>
                  <div>
                    <div className='bet-top'>
                      <span className='tag'>{race.type}</span>
                      <span className='odds'>{race.field_size} Runners</span>
                    </div>

                    <h3>{race.race_name}</h3>

                    <p>
                      {race.course} · {race.off_time}
                    </p>

                    <p>
                      {race.going} · {race.distance_f}
                    </p>
                  </div>

                  <button>View Race</button>
                </div>
              ))}
            </section>
          )}
        </>
      )
    }

    return (
      <div className='card'>
        <h2 style={{ marginBottom: '16px' }}>{activeTab}</h2>
        <p style={{ color: '#888', fontSize: '18px' }}>
          {activeTab} section is now connected and ready for the next build phase.
        </p>
      </div>
    )
  }

  return (
    <div className='layout'>
      <aside className='sidebar'>
        <div>
          <h1>APEX</h1>
          <p>Racing Intelligence</p>
        </div>

        <nav>
          {['Dashboard', 'Racecards', 'Horses', 'Upload', 'Analytics'].map(tab => (
            <a
              key={tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </a>
          ))}
        </nav>
      </aside>

      <main className='main'>{renderContent()}</main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
