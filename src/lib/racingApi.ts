export async function fetchRacecards() {
  try {
    const response = await fetch(
      '/api/live-state'
    )

    const data = await response.json()

    return data.racecards || []
  } catch (error) {
    console.error(
      'Failed to fetch racecards:',
      error
    )

    return []
  }
}

export async function fetchResults() {
  try {
    const response = await fetch(
      '/api/results'
    )

    const data = await response.json()

    return Array.isArray(data) ? data : []
  } catch (error) {
    console.error(
      'Failed to fetch results:',
      error
    )

    return []
  }
}