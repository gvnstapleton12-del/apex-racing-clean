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
    weakened_late: { label: 'Weakened late', score: -5, category: 'finishing_energy' },
    weakened_mid: { label: 'Weakened mid-race', score: -4, category: 'finishing_energy' },
    stopped_quickly: { label: 'Stopped quickly', score: -7, category: 'finishing_energy' },
    one_paced: { label: 'One paced', score: -4, category: 'finishing_energy' },
    outpaced: { label: 'Outpaced', score: -3, category: 'pace_suitability' },
    outpaced_early: { label: 'Outpaced early', score: -3, category: 'pace_suitability' },
    outpaced_mid: { label: 'Outpaced mid-race', score: -4, category: 'pace_suitability' },
    outpaced_late: { label: 'Outpaced late', score: -5, category: 'finishing_energy' },
    ran_flat: { label: 'Ran flat', score: -5, category: 'finishing_energy' },
    no_response: { label: 'No response', score: -5, category: 'mental_professionalism' },
    no_response_early: { label: 'No response early', score: -4, category: 'mental_professionalism' },
    no_response_mid: { label: 'No response mid-race', score: -5, category: 'mental_professionalism' },
    no_response_late: { label: 'No response late', score: -6, category: 'finishing_energy' },
    awkward_start: { label: 'Awkward start', score: -3, category: 'mental_professionalism' },
    hung_left: { label: 'Hung left', score: -2, category: 'mental_professionalism' },
    hung_right: { label: 'Hung right', score: -2, category: 'mental_professionalism' },
    pulled_hard: { label: 'Pulled hard', score: -3, category: 'mental_professionalism' },
    pulled_hard_early: { label: 'Pulled hard early', score: -4, category: 'mental_professionalism' },
    pulled_hard_mid: { label: 'Pulled hard mid-race', score: -3, category: 'mental_professionalism' },
    keen: { label: 'Keen', score: -2, category: 'mental_professionalism' },
    keen_early: { label: 'Keen early', score: -3, category: 'mental_professionalism' },
    keen_mid: { label: 'Keen mid-race', score: -2, category: 'mental_professionalism' },
    found_little: { label: 'Found little', score: -6, category: 'finishing_energy' },
    never_placed: { label: 'Never placed', score: -5, category: 'finishing_energy' },
    idled: { label: 'Idled', score: -2, category: 'mental_professionalism' },
    idled_late: { label: 'Idled late', score: -3, category: 'finishing_energy' },
    missed_break: { label: 'Missed break', score: -3, category: 'trip_efficiency' },
    slowly_away: { label: 'Slowly away', score: -3, category: 'trip_efficiency' },
    bumped: { label: 'Bumped', score: -2, category: 'trip_efficiency' },
    bumped_early: { label: 'Bumped early', score: -3, category: 'trip_efficiency' },
    bumped_mid: { label: 'Bumped mid-race', score: -2, category: 'trip_efficiency' },
    ran_green: { label: 'Ran green', score: -2, category: 'mental_professionalism' },
    ran_green_early: { label: 'Ran green early', score: -3, category: 'mental_professionalism' },
    ran_green_mid: { label: 'Ran green mid-race', score: -2, category: 'mental_professionalism' },
    wrong_trip: { label: 'Wrong trip', score: 6, category: 'pace_suitability' },
    drops_in_trip: { label: 'Drops in trip', score: 3, category: 'pace_suitability' },
    needs_further: { label: 'Needs further', score: 3, category: 'pace_suitability' },
    struggled_early: { label: 'Struggled early', score: -3, category: 'pace_suitability' },
    struggled_mid: { label: 'Struggled mid-race', score: -4, category: 'pace_suitability' },
    lost_ground_early: { label: 'Lost ground early', score: -3, category: 'trip_efficiency' },
    lost_ground_mid: { label: 'Lost ground mid-race', score: -4, category: 'trip_efficiency' },
    held_up: { label: 'Held up', score: -2, category: 'trip_efficiency' },
    held_up_early: { label: 'Held up early', score: -3, category: 'trip_efficiency' },
    held_up_mid: { label: 'Held up mid-race', score: -2, category: 'trip_efficiency' },
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
  weakened_late: 'finishing_energy',
  weakened_mid: 'finishing_energy',
  stopped_quickly: 'finishing_energy',
  one_paced: 'finishing_energy',
  outpaced: 'pace_suitability',
  outpaced_early: 'pace_suitability',
  outpaced_mid: 'pace_suitability',
  outpaced_late: 'finishing_energy',
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
  no_response_early: 'mental_professionalism',
  no_response_mid: 'mental_professionalism',
  no_response_late: 'finishing_energy',
  awkward_start: 'mental_professionalism',
  hung_left: 'mental_professionalism',
  hung_right: 'mental_professionalism',
  pulled_hard: 'mental_professionalism',
  pulled_hard_early: 'mental_professionalism',
  pulled_hard_mid: 'mental_professionalism',
  keen: 'mental_professionalism',
  keen_early: 'mental_professionalism',
  keen_mid: 'mental_professionalism',
  idled: 'mental_professionalism',
  idled_late: 'finishing_energy',
  missed_break: 'trip_efficiency',
  slowly_away: 'trip_efficiency',
  bumped: 'trip_efficiency',
  bumped_early: 'trip_efficiency',
  bumped_mid: 'trip_efficiency',
  ran_green: 'mental_professionalism',
  ran_green_early: 'mental_professionalism',
  ran_green_mid: 'mental_professionalism',
  wrong_trip: 'pace_suitability',
  drops_in_trip: 'pace_suitability',
  needs_further: 'pace_suitability',
  struggled_early: 'pace_suitability',
  struggled_mid: 'pace_suitability',
  lost_ground_early: 'trip_efficiency',
  lost_ground_mid: 'trip_efficiency',
  held_up: 'trip_efficiency',
  held_up_early: 'trip_efficiency',
  held_up_mid: 'trip_efficiency',
}

export const ALL_REPLAY_TAGS = Object.keys(TAG_TO_CATEGORY)

export const QUICK_REPLAY_TAGS = [
  'looked_winner', 'weakened', 'one_paced', 'outpaced',
  'stayed_on', 'wrong_trip', 'needs_further',
]

export const WATCHLIST_RULES = [
  { tags: ['finished_well', 'outpaced'], priority: 'HIGH', reason: 'Needs stronger pace, stays on well' },
  { tags: ['finished_well', 'outpaced_early'], priority: 'HIGH', reason: 'Outpaced early but finished strongly, needs stronger pace' },
  { tags: ['finished_well', 'outpaced_mid'], priority: 'HIGH', reason: 'Outpaced mid-race but recovered to finish well' },
  { tags: ['wide_trip', 'rallied'], priority: 'HIGH', reason: 'Covered extra ground but recovered' },
  { tags: ['travelled_well', 'no_response'], priority: 'MEDIUM', reason: 'Travelled easily but weak finish' },
  { tags: ['travelled_well', 'no_response_late'], priority: 'MEDIUM', reason: 'Travelled easily but weak late finish' },
  { tags: ['blocked_run', 'stayed_on'], priority: 'HIGH', reason: 'Unlucky trip, kept finding' },
  { tags: ['looked_winner', 'weakened'], priority: 'MEDIUM', reason: 'Looked like winning but faded' },
  { tags: ['looked_winner', 'weakened_late'], priority: 'MEDIUM', reason: 'Looked winner but weakened late' },
  { tags: ['flew_up_hill', 'stayed_on'], priority: 'HIGH', reason: 'Strong uphill finish, needs further' },
  { tags: ['pace_victim', 'finished_well'], priority: 'HIGH', reason: 'Wrong pace setup but finished well' },
  { tags: ['unlucky_run', 'rallied'], priority: 'HIGH', reason: 'Traffic trouble but recovered momentum' },
  { tags: ['struggled_early', 'stayed_on'], priority: 'HIGH', reason: 'Early struggles but kept on, stiff finish suits' },
  { tags: ['lost_ground_early', 'finished_well'], priority: 'HIGH', reason: 'Lost early ground but finished well, clear run needed' },
  { tags: ['keen_early', 'stayed_on'], priority: 'MEDIUM', reason: 'Keen early but stayed on, settling would help' },
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
  if (tagSet.has('outpaced') || tagSet.has('pace_victim') || tagSet.has('outpaced_early') || tagSet.has('outpaced_mid') || tagSet.has('struggled_early') || tagSet.has('struggled_mid')) conditions.push('stronger_pace')
  if (tagSet.has('needs_further') || tagSet.has('drops_in_trip')) conditions.push('further_trip')
  if (tagSet.has('stayed_on') || tagSet.has('finished_well')) conditions.push('stiff_finish')
  if (tagSet.has('wide_trip') || tagSet.has('unlucky_run') || tagSet.has('lost_ground_early') || tagSet.has('lost_ground_mid')) conditions.push('clear_run')
  if (tagSet.has('travelled_well') && (tagSet.has('no_response') || tagSet.has('no_response_late'))) conditions.push('softer_ground')
  if (tagSet.has('flew_up_hill')) conditions.push('uphill_finish')
  if (tagSet.has('blocked_run') || tagSet.has('hampered') || tagSet.has('held_up') || tagSet.has('held_up_early') || tagSet.has('held_up_mid')) conditions.push('luck_in_running')
  if (tagSet.has('keen_early') || tagSet.has('pulled_hard_early')) conditions.push('settling_needed')
  if (tagSet.has('outpaced_late') || tagSet.has('weakened_late') || tagSet.has('no_response_late')) conditions.push('shorter_trip')
  return conditions
}

export function getAvoidTags(tags) {
  return tags.filter((t) => {
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[t])
    return def && def.score < 0
  })
}

const KEYWORD_TO_TAG = {
  finished_well: ['finished well', 'finishing well', 'finishing stronger', 'strong finish', 'finished strongly', 'finished better'],
  stayed_on: ['stayed on', 'kept finding', 'kept on', 'kept grinding', 'sustained effort', 'grinding home', 'kept finding late', 'doing best work late', 'best work late'],
  rallied: ['rallied', 'recovered', 'recovered momentum', 'found again', 'picked up', 'kept finding'],
  strong_closer: ['strong closer', 'powerful finish', 'closing well', 'closing strongly'],
  travelled_well: ['travelled well', 'moving easily', 'travelled easily', 'moved well', 'travelling well', 'travelling like'],
  looked_winner: ['looked winner', 'looked the winner', 'appeared to win', 'seemed certain', 'looked like winning'],
  strong_finish: ['strong finish', 'finished powerfully', 'finished strongly'],
  flew_up_hill: ['flew up hill', 'uphill finish', 'uphill suited', 'best work late', 'strong uphill', 'uphill finish suited'],
  head_way: ['head way', 'made headway', 'gained ground'],
  blocked_run: ['blocked run', 'blocked', 'no clear run', 'cut off', 'blocked run'],
  hampered: ['hampered', 'interference', 'crowded', 'hampered'],
  no_room: ['no room', 'no room to run', 'couldn\'t get clear', 'no room'],
  wide_trip: ['wide trip', 'wide throughout', 'wide run', 'covered extra ground', 'extra ground'],
  unlucky_run: ['unlucky run', 'unlucky trip', 'bad luck', 'traffic trouble'],
  pace_victim: ['pace victim', 'wrong pace', 'pace setup', 'pace collapse', 'pace collapsed', 'tempo lifted', 'under pressure', 'race setup to collapse', 'setup to collapse'],
  weakened: ['weakened', 'faded', 'gradual fade', 'lost momentum'],
  weakened_late: ['weakened late', 'faded late', 'weakened inside final furlong', 'weakened inside the final'],
  weakened_mid: ['weakened mid-race', 'weakened midway', 'faded halfway'],
  stopped_quickly: ['stopped quickly', 'sudden empty', 'stopped suddenly', 'ran out of steam'],
  one_paced: ['one paced', 'no acceleration', 'one-pace', 'lacked pace'],
  outpaced: ['outpaced', 'tempo too sharp', 'couldn\'t match pace', 'wasn\'t travelling', 'not travelling', 'not travelling like', 'wasn\'t travelling like'],
  outpaced_early: ['outpaced early', 'outpaced from start', 'never travelling early', 'wasn\'t travelling early', 'outpaced early', 'tempo lifted early', 'under pressure early'],
  outpaced_mid: ['outpaced mid-race', 'outpaced midway', 'couldn\'t match pace halfway', 'outpaced when the tempo'],
  outpaced_late: ['outpaced late', 'outpaced inside final furlong', 'outpaced final stages'],
  ran_flat: ['ran flat', 'no spark', 'flat run', 'never dangerous'],
  no_response: ['no response', 'no pickup', 'didn\'t respond', 'no reaction'],
  no_response_early: ['no response early', 'didn\'t respond early', 'no reaction early'],
  no_response_mid: ['no response mid-race', 'no reaction midway', 'didn\'t respond halfway'],
  no_response_late: ['no response late', 'no reaction late', 'nothing left when asked'],
  awkward_start: ['awkward start', 'poor break', 'missed break'],
  hung_left: ['hung left', 'drifted left', 'veered left'],
  hung_right: ['hung right', 'drifted right', 'veered right'],
  pulled_hard: ['pulled hard', 'fighting rider'],
  pulled_hard_early: ['pulled hard early', 'keen early', 'fighting rider early'],
  pulled_hard_mid: ['pulled hard mid-race', 'keen halfway', 'fighting rider midway'],
  keen: ['keen', 'too keen', 'over-racing'],
  keen_early: ['keen early', 'over-racing early'],
  keen_mid: ['keen mid-race', 'over-racing halfway'],
  found_little: ['found little', 'nothing left', 'empty', 'had nothing'],
  never_placed: ['never placed', 'never in contention', 'always behind'],
  idled: ['idled', 'lost concentration', 'switched off'],
  idled_late: ['idled late', 'lost concentration late', 'switched off late'],
  missed_break: ['missed break', 'late away'],
  slowly_away: ['slowly away', 'slow start'],
  bumped: ['bumped', 'contact'],
  bumped_early: ['bumped early', 'bumped start', 'bumped at start'],
  bumped_mid: ['bumped mid-race', 'bumped midway'],
  ran_green: ['ran green', 'green', 'inexperienced', 'ran badly'],
  ran_green_early: ['ran green early', 'green early', 'ran badly early'],
  ran_green_mid: ['ran green mid-race', 'green halfway'],
  wrong_trip: ['wrong trip', 'unsuitable trip', 'too short', 'needed further'],
  drops_in_trip: ['drops in trip', 'shorter trip', 'reduced distance'],
  needs_further: ['needs further', 'needs more', 'stay on longer', 'further trip', 'slightly further trip', 'longer trip'],
  struggled_early: ['struggled early', 'struggled from start', 'struggled early on'],
  struggled_mid: ['struggled mid-race', 'struggled halfway', 'struggled midway'],
  lost_ground_early: ['lost ground early', 'lost touch early', 'dropped back early'],
  lost_ground_mid: ['lost ground mid-race', 'lost touch halfway', 'dropped back midway'],
  held_up: ['held up', 'held up throughout'],
  held_up_early: ['held up early', 'held up from start'],
  held_up_mid: ['held up mid-race', 'held up halfway'],
}

export function extractTagsFromNotes(text) {
  if (!text) return []
  const lower = text.toLowerCase()
  const found = new Set()
  for (const [tag, keywords] of Object.entries(KEYWORD_TO_TAG)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        found.add(tag)
        break
      }
    }
  }
  return Array.from(found)
}
