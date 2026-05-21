const TAG_VALUES = {
  strong_finish: 5,
  blocked_run: 4,
  wrong_trip: 6,
  hung_badly: -4,
  stopped_quickly: -7,
  green: -2,
  ran_green: -2,
  flew_up_hill: 3,
  idled: -2,
  needs_further: 3,
  drops_in_trip: 3,
  ran_flat: -5,
  keen: -2,
  outpaced: -3,
  stayed_on: 4,
  finished_well: 5,
  slowly_away: -3,
  missed_break: -3,
  hampered: 3,
  no_room: 3,
  looked_winner: 5,
  found_little: -6,
  one_paced: -4,
  never_placed: -5,
  head_way: 3,
  rallied: 2,
  weakened: -4,
}

export function humanIntelligenceLayer(replayNote = {}) {
  const tags = replayNote.tags || []
  const manualAdj = Number(replayNote.adjustment) || 0
  let tagScore = 0

  tags.forEach((tag) => {
    const key = tag.toLowerCase().replace(/\s+/g, '_')
    tagScore += TAG_VALUES[key] || 0
  })

  const total = tagScore + manualAdj
  return Math.max(-12, Math.min(12, total))
}

export { TAG_VALUES }
