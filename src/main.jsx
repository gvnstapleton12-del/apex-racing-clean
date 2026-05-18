import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  const [activeTab, setActiveTab] = useState('Dashboard')
  const [racecards, setRacecards] = useState([])
  const [resultsArchive, setResultsArchive] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedRace, setSelectedRace] = useState(null)

  useEffect(() => {
    async function fetchMeetings() {
      try {
        const response = await fetch('/api/live-meetings')
        const data = await response.json()

        const liveRaces = data.racecards || []

        const today = new Date().toDateString()
        const savedDate = localStorage.getItem('apex-race-date')
        const savedRaces = JSON.parse(
          localStorage.getItem('apex-old-races') || '[]'
        )

        if (savedDate && savedDate !== today && racecards.length > 0) {
          localStorage.setItem(
            'apex-old-races',
            JSON.stringify(racecards)
          )

          setResultsArchive(racecards)
        } else {
          setResultsArchive(savedRaces)
        }

        localStorage.setItem('apex-race-date', today)

        setRacecards(liveRaces)
      } catch (error) {
        console.error('Failed to fetch live meetings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchMeetings()
  }, [])

  const renderRacecards = () => {
    if (loading) {
      return (
        <div className='card'>
          <h2>Loading live race meetings...</h2>
        </div>
      )
    }

    return (
      <section className='bet-board'>
        <div className='board-header'>
          <h2>UK & Ireland Racecards</h2>
        </div>

        {racecards.slice(0, 20).map((race) => (
          <div className='bet-card' key={race.race_id}>
            <div>
              <div className='bet-top'>
                <span className='tag'>{race.type}</span>
                <span className='odds'>
                  {race.field_size} Runners
                </span>
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
    )
  }

  const renderResults = () => {
    return (
      <section className='bet-board'>
        <div className='board-header'>
          <h2>Previous Meetings</h2>
        </div>

        {resultsArchive.length === 0 ? (
          <div className='card'>
            <h2>No archived meetings yet</h2>
          </div>
        ) : (
          resultsArchive.map((race) => (
            <div className='bet-card' key={race.race_id}>
              <div>
                <div className='bet-top'>
                  <span className='tag'>{race.type}</span>
                  <span className='odds'>
                    {race.field_size} Runners
                  </span>
                </div>

                <h3>{race.race_name}</h3>

                <p>
                  {race.course} · {race.off_time}
                </p>
              </div>

              <button onClick={() => setSelectedRace(race)}>
                View Race
              </button>
            </div>
          ))
        )}
      </section>
    )
  }

  const renderIntelligence = () => {
    const topRunners = racecards
      .flatMap((race) =>
        (race.runners || []).map((runner) => ({
          ...runner,
          race_name: race.race_name,
          course: race.course,
          off_time: race.off_time
        }))
      )
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 12)

    return (
      <>
        <section className='hero'>
          <div>
            <h2>APEX Intelligence Terminal</h2>
            <p>
              Advanced race intelligence and AI analytics
            </p>
          </div>

          <button>LIVE ENGINE</button>
        </section>

        <section className='stats'>
          <div className='card'>
            <span>Live Meetings</span>
            <h3>{racecards.length}</h3>
          </div>

          <div className='card'>
            <span>Tracked Runners</span>

            <h3>
              {racecards.reduce(
                (acc, race) =>
                  acc + (race.runners?.length || 0),
                0
              )}
            </h3>
          </div>

          <div className='card'>
            <span>Replay Flags</span>
            <h3>ACTIVE</h3>
          </div>

          <div className='card'>
            <span>AI Engine</span>
            <h3>ONLINE</h3>
          </div>
        </section>

        <section className='bet-board'>
          <div className='board-header'>
            <h2>Top Intelligence Runners</h2>
          </div>

          {topRunners.map((runner, index) => (
            <div className='bet-card' key={index}>
              <div>
                <div className='bet-top'>
                  <span className='tag'>APEX</span>

                  <span className='odds'>
                    Score {runner.score || 'N/A'}
                  </span>
                </div>

                <h3>{runner.horse}</h3>

                <p>
                  {runner.course} · {runner.off_time}
                </p>

                <p>{runner.race_name}</p>
              </div>

              <button>Track Runner</button>
            </div>
          ))}
        </section>
      </>
    )
  }

  const renderContent = () => {
    if (activeTab === 'Dashboard') {
      return (
        <>
          <section className='hero'>
            <div>
              <h2>APEX Racing Intelligence</h2>
              <p>Live Racing API horse racing dashboard</p>
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
              <span>Results Archive</span>
              <h3>{resultsArchive.length}</h3>
            </div>
          </section>
        </>
      )
    }

    if (activeTab === 'Racecards') {
      return renderRacecards()
    }

    if (activeTab === 'Results') {
      return renderResults()
    }

    if (activeTab === 'Intelligence') {
      return renderIntelligence()
    }

    return (
      <div className='card'>
        <h2 style={{ marginBottom: '16px' }}>
          {activeTab}
        </h2>
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
            {[
              'Dashboard',
              'Racecards',
              'Results',
              'Intelligence',
              'Horses',
              'Upload',
              'Analytics'
            ].map((tab) => (
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
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: '36px',
                    marginBottom: '12px'
                  }}
                >
                  {selectedRace.race_name}
                </h2>

                <p
                  style={{
                    color: '#999',
                    fontSize: '18px'
                  }}
                >
                  {selectedRace.course} ·{' '}
                  {selectedRace.off_time}
                </p>
              </div>

              <button
                onClick={() => setSelectedRace(null)}
              >
                Close
              </button>
            </div>

            <div style={{ marginTop: '32px' }}>
              <h3 style={{ marginBottom: '20px' }}>
                Runners
              </h3>

              {(selectedRace.runners || []).map(
                (runner, index) => (
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
                      <h4 style={{ marginBottom: '8px' }}>
                        {runner.horse}
                      </h4>

                      <p style={{ color: '#999' }}>
                        {runner.jockey} ·{' '}
                        {runner.trainer}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <p>{runner.number}</p>

                      <p style={{ color: '#ff8800' }}>
                        {runner.form}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

ReactDOM.createRoot(
  document.getElementById('root')
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)