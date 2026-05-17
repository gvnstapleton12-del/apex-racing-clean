import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [racecards, setRacecards] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRace, setSelectedRace] = useState(null)

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const response = await fetch('/api/live-meetings')
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

                  <button onClick={() => setSelectedRace(race)}>
                    View Race
                  </button>
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
      </div>
    )
  }

  return (
    <>
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

      {selectedRace && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
            zIndex: 999
          }}
          onClick={() => setSelectedRace(null)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #222',
              borderRadius: '24px',
              padding: '32px',
              width: '100%',
              maxWidth: '900px',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '36px', marginBottom: '12px' }}>
                  {selectedRace.race_name}
                </h2>

                <p style={{ color: '#999', fontSize: '18px' }}>
                  {selectedRace.course} · {selectedRace.off_time}
                </p>
              </div>

              <button onClick={() => setSelectedRace(null)}>
                Close
              </button>
            </div>

            <div style={{ marginTop: '32px' }}>
              <h3 style={{ marginBottom: '20px' }}>Runners</h3>

              {(selectedRace.runners || []).map((runner, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #222',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <h4 style={{ marginBottom: '8px' }}>{runner.horse}</h4>

                    <p style={{ color: '#999' }}>
                      {runner.jockey} · {runner.trainer}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p>{runner.number}</p>
                    <p style={{ color: '#ff8800' }}>{runner.form}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
