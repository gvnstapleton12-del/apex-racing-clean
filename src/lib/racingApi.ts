export async function fetchRacecards() {
  const response = await fetch('/api/live-meetings')

  if (!response.ok) {
    throw new Error('Failed to fetch racecards')
  }

  const data = await response.json()

  return (data.racecards || []).filter((race: any) => {
    const region = race.region || ''
    return region === 'GB' || region === 'IRE'
  })
}

export async function fetchResults() {
  const saved = localStorage.getItem('apex-results')
  return saved ? JSON.parse(saved) : []
}

export async function saveResults(results: any[]) {
  localStorage.setItem('apex-results', JSON.stringify(results))
}
