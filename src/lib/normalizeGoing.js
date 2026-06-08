export function normalizeGoingString(rawString) {
  if (!rawString) return 'Standard'
  const text = rawString.toLowerCase()
  if (text.includes('heavy') || text.includes('soft')) return 'Soft/Heavy'
  if (text.includes('good to firm') || text.includes('firm')) return 'Good to Firm/Firm'
  if (text.includes('good') && !text.includes('firm')) return 'Good'
  if (text.includes('yielding') || text.includes('yield')) return 'Yielding'
  if (text.includes('standard')) return 'Standard'
  return 'Good'
}
