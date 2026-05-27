function normalizeName(name = '') {
  return String(name).toLowerCase().trim().replace(/['']/g, '')
}

const ATR_HORSE_OVERRIDES: Record<
  string,
  { horseId: string; raceId?: string }
> = {
  siviez: { horseId: '3797131', raceId: '1590539' },
  'lady-kara': { horseId: '3791927', raceId: '1584729' },
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseDateFromIso(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const [, y, mo, d] = m
  return { year: parseInt(y), month: parseInt(mo) - 1, day: parseInt(d) }
}

function formatAtrRacecardDate(date = '') {
  const p = parseDateFromIso(date)
  if (!p) return ''
  const day = String(p.day).padStart(2, '0')
  const month = MONTHS[p.month]
  return `${day}-${month}-${p.year}`
}

function getAtrRacecardUrl(race: any) {
  const course = String(race?.course || '').replace(/\s+/g, '-')
  const date = formatAtrRacecardDate(race?.date)
  const offTime = String(race?.off_time || '').replace(':', '')
  if (!course || !date || !offTime) return 'https://www.attheraces.com/racecards'
  return `https://m.attheraces.com/racecard/${course}/${date}/${offTime}`
}

const ATR_SEARCH_URL = 'https://www.attheraces.com/search?search='

export function getAtTheRacesHorseUrl(runner: any, race?: any): string {
  const horseName = runner?.horse || ''

  const override = ATR_HORSE_OVERRIDES[normalizeName(horseName)]
  if (override?.horseId) {
    const region = runner?.region || race?.region || 'GB'
    let url = `https://www.attheraces.com/form-popup/horse/${horseName.trim().replace(/\s+/g, '-')}/${region}/${override.horseId}`
    if (override.raceId) url += `?raceid=${override.raceId}`
    return url
  }

  if (runner?.atrUrl) return runner.atrUrl

  return ATR_SEARCH_URL + encodeURIComponent(horseName)
}

export function openAtTheRacesHorseForm(runner: any, race?: any) {
  window.open(getAtTheRacesHorseUrl(runner, race), '_blank', 'noopener,noreferrer')
}

export { getAtrRacecardUrl }
