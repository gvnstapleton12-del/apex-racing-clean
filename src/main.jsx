import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles.css'

function App() {
  const bestBets = [
    {
      horse: 'Midnight Runner',
      course: 'Ascot',
      time: '15:20',
      confidence: 'Best Of Day',
      odds: '5/1'
    },
    {
      horse: 'Golden Hooves',
      course: 'Cheltenham',
      time: '14:10',
      confidence: 'Top Rated',
      odds: '8/1'
    },
    {
      horse: 'Rapid Thunder',
      course: 'York',
      time: '16:40',
      confidence: 'EW Value',
      odds: '14/1'
    }
  ]

  return (
    <div className='layout'>
      <aside className='sidebar'>
        <div>
          <h1>APEX</h1>
          <p>Racing Intelligence</p>
        </div>

        <nav>
          <a className='active'>Dashboard</a>
          <a>Racecards</a>
          <a>Horses</a>
          <a>Upload</a>
          <a>Analytics</a>
        </nav>
      </aside>

      <main className='main'>
        <section className='hero'>
          <div>
            <h2>Daily Betting Board</h2>
            <p>AI-powered horse racing intelligence dashboard</p>
          </div>

          <button>Upload Racecards</button>
        </section>

        <section className='stats'>
          <div className='card'>
            <span>Today's Races</span>
            <h3>42</h3>
          </div>

          <div className='card'>
            <span>Best Bets</span>
            <h3>8</h3>
          </div>

          <div className='card'>
            <span>ROI</span>
            <h3>+18%</h3>
          </div>

          <div className='card'>
            <span>Avoid Races</span>
            <h3>5</h3>
          </div>
        </section>

        <section className='bet-board'>
          <div className='board-header'>
            <h2>Best Of The Day</h2>
          </div>

          {bestBets.map((bet, index) => (
            <div className='bet-card' key={index}>
              <div>
                <div className='bet-top'>
                  <span className='tag'>{bet.confidence}</span>
                  <span className='odds'>{bet.odds}</span>
                </div>

                <h3>{bet.horse}</h3>

                <p>
                  {bet.course} · {bet.time}
                </p>
              </div>

              <button>View Race</button>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
