import { REPLAY_TAG_LIBRARY } from './replayTagLibrary.js'
import { computeTrackCompatibility } from './courseProfiles.js'

const WATCHLIST_PRIORITY_SCORES = {
  HIGH: 5,
  MEDIUM: 3,
  LOW: 0,
}

export function humanIntelligenceLayer(replayNote = {}, raceCourse = '') {
  const tags = replayNote.tags || []
  const manualAdj = Number(replayNote.adjustment) || 0
  let tagScore = 0

  for (const tag of tags) {
    const key = tag.toLowerCase().replace(/\s+/g, '_')
    const def = Object.values(REPLAY_TAG_LIBRARY).find((lib) => lib[key])
    tagScore += def ? def.score : 0
  }

  const catScores = replayNote.category_scores || {}
  let catAdj = 0
  for (const [, score] of Object.entries(catScores)) {
    if (score > 0) catAdj += score * 0.3
    else if (score < 0) catAdj += score * 0.2
  }

  const wlPriority = replayNote.watchlist_priority || 'LOW'
  const wlAdj = WATCHLIST_PRIORITY_SCORES[wlPriority] || 0

  const trackCompat = computeTrackCompatibility(replayNote.course, raceCourse)
  const trackAdj = (tagScore + catAdj + wlAdj) * (trackCompat - 1)

  const total = (tagScore + manualAdj + catAdj + wlAdj + trackAdj) * trackCompat
  return Math.max(-15, Math.min(15, Math.round(total * 10) / 10))
}

export function getHumanInsights(replayNote = {}) {
  const insights = []
  if (replayNote.positive_tags && replayNote.positive_tags.length > 0) {
    insights.push({
      type: 'positive',
      tags: replayNote.positive_tags,
      message: `Positive replay signals: ${replayNote.positive_tags.map((t) => t.tag).join(', ')}`,
    })
  }
  if (replayNote.negative_tags && replayNote.negative_tags.length > 0) {
    insights.push({
      type: 'negative',
      tags: replayNote.negative_tags,
      message: `Negative replay signals: ${replayNote.negative_tags.map((t) => t.tag).join(', ')}`,
    })
  }
  if (replayNote.recommended_conditions && replayNote.recommended_conditions.length > 0) {
    insights.push({
      type: 'conditions',
      conditions: replayNote.recommended_conditions,
      message: `Best conditions: ${replayNote.recommended_conditions.map((c) => c.replace(/_/g, ' ')).join(', ')}`,
    })
  }
  if (replayNote.watchlist_priority && replayNote.watchlist_priority !== 'LOW') {
    insights.push({
      type: 'watchlist',
      priority: replayNote.watchlist_priority,
      message: `${replayNote.watchlist_priority} priority watchlist`,
    })
  }
  if (replayNote.summary) {
    insights.push({
      type: 'summary',
      message: replayNote.summary,
    })
  }
  return insights
}
