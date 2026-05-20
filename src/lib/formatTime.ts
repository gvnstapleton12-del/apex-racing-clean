export function formatOffTime(race: any): string {
  if (race.off_dt) {
    const d = new Date(race.off_dt)
    if (!isNaN(d.getTime())) {
      const h = String(d.getHours()).padStart(2, '0')
      const m = String(d.getMinutes()).padStart(2, '0')
      return `${h}:${m}`
    }
  }

  if (race.off_time) {
    const parts = race.off_time.match(/^(\d{1,2}):(\d{2})$/)
    if (parts) {
      let h = parseInt(parts[1], 10)
      const m = parts[2]
      if (h >= 1 && h <= 7) {
        h += 12
      }
      return `${String(h).padStart(2, '0')}:${m}`
    }
    return race.off_time
  }

  return '--'
}
