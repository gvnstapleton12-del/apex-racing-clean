export function formatOffTime(race: any): string {
  if (race.off_dt) {
    const m = race.off_dt.match(/T(\d{2}):(\d{2})/)
    if (m) return `${m[1]}:${m[2]}`
  }

  if (race.off_time) {
    const m = race.off_time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (m) {
      let h = parseInt(m[1], 10)
      if (h >= 1 && h <= 7) h += 12
      return `${String(h).padStart(2, '0')}:${m[2]}`
    }
    return race.off_time
  }

  return '--'
}
