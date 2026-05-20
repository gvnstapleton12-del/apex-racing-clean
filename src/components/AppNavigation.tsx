export default function AppNavigation() {
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

  return (
    <div className="app-nav">
      <div className="app-nav-container">
        {tabs.map((tab) => (
          <button key={tab} className="app-nav-button">
            {tab}
          </button>
        ))}
      </div>
    </div>
  )
}