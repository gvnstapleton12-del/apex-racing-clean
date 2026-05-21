export const REPLAY_TAG_LIBRARY = {
  positive: {
    finished_well: { label: 'Finished well', score: 5, category: 'finishing_energy' },
    stayed_on: { label: 'Stayed on', score: 4, category: 'finishing_energy' },
    rallied: { label: 'Rallied', score: 2, category: 'finishing_energy' },
    strong_closer: { label: 'Strong closer', score: 5, category: 'finishing_energy' },
    travelled_well: { label: 'Travelled well', score: 4, category: 'pace_suitability' },
    looked_winner: { label: 'Looked winner', score: 5, category: 'mental_professionalism' },
    flew_up_hill: { label: 'Flew up hill', score: 3, category: 'finishing_energy' },
    head_way: { label: 'Head way', score: 3, category: 'finishing_energy' },
    strong_finish: { label: 'Strong finish', score: 5, category: 'finishing_energy' },
    finished_well: { label: 'Finished well', score: 5, category: 'finishing_energy' },
    blocked_run: { label: 'Blocked run', score: 4, category: 'trip_efficiency' },
    hampered: { label: 'Hampered', score: 3, category: 'trip_efficiency' },
    no_room: { label: 'No room', score: 3, category: 'trip_efficiency' },
    wide_trip: { label: 'Wide trip', score: 3, category: 'trip_efficiency' },
    unlucky_run: { label: 'Unlucky run', score: 4, category: 'trip_efficiency' },
    pace_victim: { label: 'Pace victim', score: 4, category: 'pace_suitability' },
    strong_finish: { label: 'Strong finish', score: 5, category: 'finishing_energy' },
  },
  negative: {
    weakened: { label: 'Weakened', score: -4, category: 'finishing_energy' },
    stopped_quickly: { label: 'Stopped quickly', score: -7, category: 'finishing_energy' },
    one_paced: { label: 'One paced', score: -4, category: 'finishing_energy' },
    outpaced: { label: 'Outpaced', score: -3, category: 'pace_suitability' },
    ran_flat: { label: 'Ran flat', score: -5, category: 'finishing_energy' },
    no_response: { label: 'No response', score: -5, category: 'mental_professionalism' },
    awkward_start: { label: 'Awkward start', score: -3, category: 'mental_professionalism' },
    hung_left: { label: 'Hung left', score: -2, category: 'mental_professionalism' },
    hung_right: { label: 'Hung right', score: -2, category: 'mental_professionalism' },
    pulled_hard: { label: 'Pulled hard', score: -3, category: 'mental_professionalism' },
    keen: { label: 'Keen', score: -2, category: 'mental_professionalism' },
    found_little: { label: 'Found little', score: -6, category: 'finishing_energy' },
    never_placed: { label: 'Never placed', score: -5, category: 'finishing_energy' },
    idled: { label: 'Idled', score: -2, category: 'mental_professionalism' },
    missed_break: { label: 'Missed break', score: -3, category: 'trip_efficiency' },
    slowly_away: { label: 'Slowly away', score: -3, category: 'trip_efficiency' },
    bumped: { label: 'Bumped', score: -2, category: 'trip_efficiency' },
    ran_green: { label: 'Ran green', score: -2, category: 'mental_professionalism' },
    wrong_trip: { label: 'Wrong trip', score: 6, category: 'pace_suitability' },
    drops_in_trip: { label: 'Drops in trip', score: 3, category: 'pace_suitability' },
    needs_further: { label: 'Needs further', score: 3, category: 'pace_suitability' },
  },
}

export const TAG_TO_CATEGORY = {
  finished_well: 'finishing_energy',
  stayed_on: 'finishing_energy',
  rallied: 'finishing_energy',
  strong_closer: 'finishing_energy',
  strong_finish: 'finishing_energy',
  flew_up_hill: 'finishing_energy',
  head_way: 'finishing_energy',
  weakened: 'finishing_energy',
  stopped_quickly: 'finishing_energy',
  one_paced: 'finishing_energy',
  outpaced: 'finishing_energy',
  ran_flat: 'finishing_energy',
  found_little: 'finishing_energy',
  never_placed: 'finishing_energy',
  travelled_well: 'pace_suitability',
  looked_winner: 'mental_professionalism',
  blocked_run: 'trip_efficiency',
  hampered: 'trip_efficiency',
  no_room: 'trip_efficiency',
  wide_trip: 'trip_efficiency',
  unlucky_run: 'trip_efficiency',
  pace_victim: 'pace_suitability',
  no_response: 'mental_professionalism',
  awkward_start: 'mental_professionalism',
  hung_left: 'mental_professionalism',
  hung_right: 'mental_professionalism',
  pulled_hard: 'mental_professionalism',
  keen: 'mental_professionalism',
  idled: 'mental_professionalism',
  missed_break: 'trip_efficiency',
  slowly_away: 'trip_efficiency',
  bumped: 'trip_efficiency',
  ran_green: 'mental_professionalism',
  wrong_trip: 'pace_suitability',
  drops_in_trip: 'pace_suitability',
  needs_further: 'pace_suitability',
}

export const ALL_REPLAY_TAGS = Object.keys(TAG_TO_CATEGORY)

export const QUICK_REPLAY_TAGS = [
  'looked_winner', 'weakened', 'one_paced', 'outpaced',
  'stayed_on', 'wrong_trip', 'needs_further',
]

export const WATCHLIST_RULES = [
  { tags: ['finished_well', 'outpaced'], priority: 'HIGH', reason: 'Needs stronger pace, stays on well' },
  { tags: ['wide_trip', 'rallied'], priority: 'HIGH', reason: 'Covered extra ground but recovered' },
  { tags: ['travelled_well', 'no_response'], priority: 'MEDIUM', reason: 'Travelled easily but weak finish' },
  { tags: ['blocked_run', 'stayed_on'], priority: 'HIGH', reason: 'Unlucky trip, kept finding' },
  { tags: ['looked_winner', 'weakened'], priority: 'MEDIUM', reason: 'Looked like winning but faded' },
  { tags: ['flew_up_hill', 'stayed_on'], priority: 'HIGH', reason: 'Strong uphill finish, needs further' },
  { tags: ['pace_victim', 'finished_well'], priority: 'HIGH', reason: 'Wrong pace setup but finished well' },
  { tags: ['unlucky_run', 'rallied'], priority: 'HIGH', reason: 'Traffic trouble but recovered momentum' },
]

export function computeCategoryScores(tags) {
  const scores = { finishing_energy: 0, pace_suitability: 0, trip_efficiency: 0, mental_professionalism: 0 }
  tags.forEach((t) => {
    const cat = TAG_TO_CATEGORY[t]
    if (cat && scores[cat] !== undefined) {
      const tagDef = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
      scores[cat] += tagDef ? tagDef.score : 0
    }
  })
  return scores
}

export function generateAutoSummary(tags) {
  const tagSet = new Set(tags)
  const combos = WATCHLIST_RULES.filter((rule) =>
    rule.tags.every((t) => tagSet.has(t))
  )
  if (combos.length > 0) return combos[0].reason

  const pos = tags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score > 0
  })
  const neg = tags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score < 0
  })

  if (pos.length > 0 && neg.length > 0) {
    return `Showed ${pos[0].replace(/_/g, ' ')} but ${neg[0].replace(/_/g, ' ')}`
  }
  if (pos.length > 0) return `Showed ${pos[0].replace(/_/g, ' ')}`
  if (neg.length > 0) return `${neg[0].replace(/_/g, ' ').charAt(0).toUpperCase() + neg[0].replace(/_/g, ' ').slice(1)} late`
  return ''
}

export function computeWatchlistPriority(tags) {
  const tagSet = new Set(tags)
  for (const rule of WATCHLIST_RULES) {
    if (rule.tags.every((t) => tagSet.has(t))) return rule.priority
  }
  const posCount = tags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score > 0
  }).length
  return posCount >= 2 ? 'MEDIUM' : 'LOW'
}

export function getRecommendedConditions(tags) {
  const conditions = []
  const tagSet = new Set(tags)
  if (tagSet.has('outpaced') || tagSet.has('pace_victim')) conditions.push('stronger_pace')
  if (tagSet.has('needs_further') || tagSet.has('drops_in_trip')) conditions.push('further_trip')
  if (tagSet.has('stayed_on') || tagSet.has('finished_well')) conditions.push('stiff_finish')
  if (tagSet.has('wide_trip') || tagSet.has('unlucky_run')) conditions.push('clear_run')
  if (tagSet.has('travelled_well') && tagSet.has('no_response')) conditions.push('softer_ground')
  if (tagSet.has('flew_up_hill')) conditions.push('uphill_finish')
  if (tagSet.has('blocked_run') || tagSet.has('hampered')) conditions.push('luck_in_running')
  return conditions
}

export function getAvoidTags(tags) {
  return tags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score < 0
  })
}
