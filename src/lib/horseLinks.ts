const ATR_HORSE_OVERRIDES: Record<
  string,
  {
    horseId: string
    raceId?: string
  }
> = {
  siviez: {
    horseId: '3797131',
    raceId: '1590539',
  },
}

function normalizeName(name = '') {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
}

function formatHorseNameForAtr(name = '') {
  return String(name)
    .trim()
    .replace(/\s+/g, '-')
}

function formatAtrRacecardDate(date = '') {
  if (!date) return ''

  const parsedDate = new Date(`${date}T00:00:00`)

  if (Number.isNaN(parsedDate.getTime())) {
    return ''
  }

  const day = String(parsedDate.getDate()).padStart(2, '0')
  const month = parsedDate.toLocaleString('en-GB', {
    month: 'long',
  })
  const year = parsedDate.getFullYear()

  return `${day}-${month}-${year}`
}

function getAtrRacecardUrl(race: any) {
  const course = String(race?.course || '').replace(/\s+/g, '-')
  const date = formatAtrRacecardDate(race?.date)
  const offTime = String(race?.off_time || '').replace(':', '')

  if (!course || !date || !offTime) {
    return 'https://www.attheraces.com/racecards'
  }

  return `https://m.attheraces.com/racecard/${course}/${date}/${offTime}`
}

export function getAtTheRacesHorseFormUrl(
  runner: any,
  race?: any
) {
  const horseName = runner?.horse || ''
  const region = runner?.region || race?.region || 'GB'

  if (runner?.atrFormUrl) {
    return runner.atrFormUrl
  }

  const override =
    ATR_HORSE_OVERRIDES[normalizeName(horseName)]

  const atrHorseId =
    runner?.atrHorseId ||
    runner?.atr_horse_id ||
    override?.horseId

  const atrRaceId =
    runner?.atrRaceId ||
    runner?.atr_race_id ||
    race?.atrRaceId ||
    race?.atr_race_id ||
    override?.raceId

  if (horseName && atrHorseId) {
    const baseUrl =
      `https://www.attheraces.com/form-popup/horse/` +
      `${encodeURIComponent(formatHorseNameForAtr(horseName))}/` +
      `${encodeURIComponent(region)}/` +
      `${encodeURIComponent(String(atrHorseId))}`

    if (atrRaceId) {
      return `${baseUrl}?raceid=${encodeURIComponent(String(atrRaceId))}`
    }

    return baseUrl
  }

  if (horseName) {
    return (
      'https://www.attheraces.com/search?search=' +
      encodeURIComponent(horseName)
    )
  }

  return getAtrRacecardUrl(race)
}

export function openAtTheRacesHorseForm(
  runner: any,
  race?: any
) {
  window.open(
    getAtTheRacesHorseFormUrl(runner, race),
    '_blank',
    'noopener,noreferrer'
  )
}
