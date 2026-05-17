import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  const racecards = [
    {
      id: 1,
      course: 'Ascot',
      raceName: 'Royal Sprint Handicap',
      confidence: 'High',
      pick: 'Midnight Runner'
    },
    {
      id: 2,
      course: 'Cheltenham',
      raceName: 'Festival Chase',
      confidence: 'Medium',
      pick: 'Golden Hooves'
    }
  ]

  return (
    <div className="app">
      <header className="hero">
        <h1>APEX Racing Intelligence</h1>
        <p>AI Horse Racing Dashboard</p>
      </header>

      <section className="stats">
        <div className="card">
          <h2>2</h2>
          <span>Today's Meetings</span>
        </div>

        <div className="card">
          <h2>+18%</h2>
          <span>ROI</span>
        </div>

        <div className="card">
          <h2>High</h2>
          <span>Top Confidence</span>
        </div>
      </section>

      <section className="board">
        {racecards.map((race) => (
          <div className="race-card" key={race.id}>
            <div className="race-top">
              <h3>{race.course}</h3>
              <span>{race.confidence}</span>
            </div>

            <h2>{race.raceName}</h2>

            <div className="pick">
              Top Pick: {race.pick}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
