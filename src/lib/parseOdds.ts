export function parseOdds(odds?: string | number): number {
  if (!odds) return 1
  if (typeof odds === 'number') return odds

  if (odds.includes('/')) {
    const [a, b] = odds.split('/').map(Number)
    return a / b + 1
  }

  const n = parseFloat(odds)
  return isNaN(n) ? 1 : n
}
