import { useEffect, useState } from 'react'
import { formatOffTime } from '../lib/formatTime'
import { QUICK_REPLAY_TAGS, ALL_REPLAY_TAGS, REPLAY_TAG_LIBRARY, TAG_TO_CATEGORY, generateAutoSummary, computeWatchlistPriority, getRecommendedConditions, getAvoidTags, computeCategoryScores } from '../lib/replayTagLibrary'

function selectHorse(runner, race) {
  window.dispatchEvent(new CustomEvent('select-horse', { detail: { horse: runner.horse, course: race.course, offTime: race.off_time } }))
}

interface ReplayFlagBoardProps {
  races: any[]
}

const FLAG_TAG_MAP: Record<string, string[]> = {
  FAST_FINISHER: ['strong_finish', 'finished_well', 'stayed_on'],
  PACE_EXCUSE: ['weakened', 'stopped_quickly', 'keen'],
  TRAFFIC_TROUBLE: ['blocked_run', 'hampered', 'no_room'],
  MORE_TO_GIVE: ['looked_winner', 'head_way', 'needs_further'],
  CONDITIONS_EXCUSE: ['wrong_trip', 'drops_in_trip', 'needs_further'],
}

const severityColors: Record<string, string> = {
  high: 'border-red-500/20 bg-red-500/10 text-red-400',
  medium: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
  info: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
}

export default function ReplayFlagBoard({ races }: ReplayFlagBoardProps) {
  const [replayDb, setReplayDb] = useState<Record<string, any>>({})
  const [storedResults, setStoredResults] = useState<any[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [draftTags, setDraftTags] = useState<string[]>([])
  const [draftNotes, setDraftNotes] = useState('')
  const [draftAdj, setDraftAdj] = useState(0)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'today' | 'review' | 'reviewed'>('today')

  useEffect(() => {
    fetch('/api/replay-notes')
      .then((r) => r.json())
      .then(setReplayDb)
      .catch(() => {})
    fetch('/api/results')
      .then((r) => r.json())
      .then((data) => setStoredResults(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  const todayStr = new Date().toISOString().slice(0, 10)

  function noteKey(horse: string, course: string) {
    return `${horse}|${course}`
  }

  function existingNote(horse: string, course: string) {
    return replayDb[noteKey(horse, course)]
  }

  function openTagPanel(item: any) {
    const existing = existingNote(item.horse, item.course) || item
    const suggested = item.flags ? item.flags.flatMap((f: any) => FLAG_TAG_MAP[f.key] || []) : []
    const uniqueTags = [...new Set(suggested)]
    setOpenKey(noteKey(item.horse, item.course))
    setDraftTags(existing?.tags || uniqueTags)
    setDraftNotes(existing?.notes || '')
    setDraftAdj(existing?.adjustment || 0)
  }

  function closeTagPanel() {
    setOpenKey(null)
    setDraftTags([])
    setDraftNotes('')
    setDraftAdj(0)
  }

  function toggleTag(tag: string) {
    setDraftTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  function getTagDef(tag: string) {
    for (const lib of Object.values(REPLAY_TAG_LIBRARY)) {
      if (lib[tag]) return lib[tag]
    }
    return null
  }

  async function saveNote(horse: string, course: string) {
    setSaving(true)
    try {
      const res = await fetch('/api/replay-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ horse, course, notes: draftNotes, tags: draftTags, adjustment: draftAdj }),
      })
      const data = await res.json()
      if (data.saved) {
        setReplayDb((prev) => ({
          ...prev,
          [data.key]: {
            horse,
            course: course || '',
            tags: draftTags,
            positive_tags: draftTags.filter((t) => getTagDef(t)?.score > 0).map((t) => ({ tag: t, score: getTagDef(t)?.score || 0 })),
            negative_tags: draftTags.filter((t) => getTagDef(t)?.score < 0).map((t) => ({ tag: t, score: getTagDef(t)?.score || 0 })),
            category_scores: computeCategoryScores(draftTags),
            notes: draftNotes,
            summary: draftNotes || generateAutoSummary(draftTags),
            recommended_conditions: getRecommendedConditions(draftTags),
            avoid_tags: getAvoidTags(draftTags),
            watchlist_priority: computeWatchlistPriority(draftTags),
            adjustment: draftAdj,
            reviewedAt: new Date().toISOString(),
            reviewCount: (prev[data.key]?.reviewCount || 0) + 1,
          },
        }))
      }
    } catch {}
    setSaving(false)
    closeTagPanel()
  }

  const todayFlagged = races.flatMap((race: any) => {
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return []
    return (race.runners || [])
      .filter((runner: any) => runner.replayFlags && runner.replayFlags.length > 0)
      .map((runner: any) => ({
        horse: runner.horse,
        race: race.race_name,
        course: race.course,
        time: formatOffTime(race),
        off_time: race.off_time,
        flags: runner.replayFlags,
        score: runner.finalScore || runner.score || 0,
        date: raceDate,
        source: 'today',
      }))
  })

  const needsReview = storedResults.flatMap((race: any) => {
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate === todayStr) return []
    const region = race.region || ''
    if (region !== 'GB' && region !== 'IRE' && region !== 'gb' && region !== 'ire') return []
    return (race.runners || [])
      .filter((runner: any) => {
        const pos = Number(runner.position || runner.pos || 0)
        const score = Number(runner.finalScore || runner.score || runner.aiProfile?.confidence || 0)
        const key = noteKey(runner.horse, race.course)
        if (replayDb[key]) return false
        if (pos >= 1 && pos <= 4 && score >= 70) return true
        if (pos === 1 && score < 60) return true
        return false
      })
      .map((runner: any) => {
        const pos = Number(runner.position || runner.pos || 0)
        const score = Number(runner.finalScore || runner.score || runner.aiProfile?.confidence || 0)
        const flags = []
        if (pos >= 1 && pos <= 2 && score >= 80) flags.push({ key: 'MORE_TO_GIVE', label: 'More to Give', severity: 'info' })
        if (pos >= 3 && score >= 70) flags.push({ key: 'PACE_EXCUSE', label: 'Pace Excuse', severity: 'medium' })
        if (pos === 1 && score < 60) flags.push({ key: 'CONDITIONS_EXCUSE', label: 'Conditions Excuse', severity: 'medium' })
        return {
          horse: runner.horse,
          race: race.race_name,
          course: race.course,
          time: formatOffTime(race),
          off_time: race.off_time,
          flags,
          score,
          position: pos,
          date: raceDate,
          source: 'review',
        }
      })
  })

  const reviewed = Object.entries(replayDb)
    .filter(([key, note]: [string, any]) => {
      const [horse, course] = key.split('|')
      return note?.reviewedAt && horse && course
    })
    .map(([key, note]: [string, any]) => {
      const [horse, course] = key.split('|')
      return { horse, course, ...note, source: 'reviewed' }
    })
    .sort((a: any, b: any) => (b.reviewedAt || '').localeCompare(a.reviewedAt || ''))
    .slice(0, 20)

  const todayCount = todayFlagged.length
  const reviewCount = needsReview.length
  const reviewedCount = reviewed.length

  const displayItems = tab === 'today' ? todayFlagged : tab === 'review' ? needsReview : reviewed
  const sorted = tab === 'reviewed' ? displayItems : (displayItems as any[]).sort((a: any, b: any) => b.score - a.score)

  function dateLabel(dateStr: string) {
    if (dateStr === todayStr) return 'TODAY'
    const d = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
    if (diff === 1) return 'YESTERDAY'
    if (diff <= 7) return `${diff} DAYS AGO`
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <div className='rounded-2xl border bg-card p-6'>
      <div className='mb-5'>
        <h2 className='text-2xl font-bold'>Replay Flag Board</h2>
        <p className='text-muted-foreground'>
          Replays to find {todayCount + reviewCount > 0 ? `(${todayCount + reviewCount})` : ''}
        </p>
      </div>

      <div className='flex gap-2 mb-4'>
        <button type='button' className={`text-xs px-3 py-1.5 rounded-lg border transition ${tab === 'today' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'border-white/10 text-muted-foreground hover:text-white'}`} onClick={() => setTab('today')}>
          Today ({todayCount})
        </button>
        <button type='button' className={`text-xs px-3 py-1.5 rounded-lg border transition ${tab === 'review' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'border-white/10 text-muted-foreground hover:text-white'}`} onClick={() => setTab('review')}>
          Needs Review ({reviewCount})
        </button>
        <button type='button' className={`text-xs px-3 py-1.5 rounded-lg border transition ${tab === 'reviewed' ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'border-white/10 text-muted-foreground hover:text-white'}`} onClick={() => setTab('reviewed')}>
          Reviewed ({reviewedCount})
        </button>
      </div>

      <div className='replay-list space-y-3'>
        {sorted.length === 0 ? (
          <div className='rounded-xl border p-5 text-muted-foreground'>
            {tab === 'today' ? 'No replay flags today.' : tab === 'review' ? 'No past results need review.' : 'No reviewed notes yet.'}
          </div>
        ) : (
          sorted.map((item: any, index: number) => {
            const key = noteKey(item.horse, item.course)
            const existing = item.source === 'reviewed' ? item : existingNote(item.horse, item.course)
            const isOpen = openKey === key
            const isReviewed = item.source === 'reviewed' || existing
            const catScores = existing?.category_scores || computeCategoryScores(item.tags || [])

            return (
              <div key={index} className={`replay-card rounded-xl border p-4 ${isOpen ? 'is-open' : ''} ${isReviewed ? 'border-green-500/20' : ''}`}>
                <div className='replay-card-head flex items-start justify-between'>
                  <div className='replay-card-info flex-1'>
                    <div className='flex items-center gap-2 mb-1'>
                      {item.source === 'reviewed' ? (
                        <span className='text-xs px-2 py-1 rounded-lg border border-green-500/20 bg-green-500/10 text-green-400'>REVIEWED</span>
                      ) : (
                        <span className={`text-xs px-2 py-1 rounded-lg border ${item.source === 'today' ? 'border-amber-500/20 bg-amber-500/10 text-amber-300' : 'border-purple-500/20 bg-purple-500/10 text-purple-300'}`}>
                          {item.source === 'today' ? 'TODAY' : dateLabel(item.date)}
                        </span>
                      )}
                      {item.reviewedAt && <span className='text-xs text-muted-foreground'>{new Date(item.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                      {item.position && <span className='text-xs px-2 py-1 rounded-lg border border-white/10 text-muted-foreground'>Finished {item.position}{item.position === 1 ? 'st' : item.position === 2 ? 'nd' : item.position === 3 ? 'rd' : 'th'}</span>}
                      {item.watchlist_priority && item.watchlist_priority !== 'LOW' && (
                        <span className={`text-xs px-2 py-1 rounded-lg border ${item.watchlist_priority === 'HIGH' ? 'border-red-500/20 bg-red-500/10 text-red-400' : 'border-amber-500/20 bg-amber-500/10 text-amber-300'}`}>
                          {item.watchlist_priority} WATCHLIST
                        </span>
                      )}
                      <p className='text-sm text-muted-foreground'>{item.time || item.course || ''}{item.time && item.course ? ' · ' : ''}{item.course || ''}</p>
                    </div>
                    <h3 className='replay-card-horse font-bold text-lg'>
                      <button type='button' className='hover:text-amber-300 transition text-left' onClick={() => selectHorse({ horse: item.horse }, item)}>
                        {item.horse}
                      </button>
                    </h3>
                    <p className='replay-card-meta text-sm text-muted-foreground'>{item.race || ''}</p>
                    {item.flags && item.flags.length > 0 && (
                      <div className='flex gap-2 mt-2 flex-wrap'>
                        {item.flags.map((flag: any, fi: number) => (
                          <span key={fi} className={`text-xs px-2 py-1 rounded-lg border ${severityColors[flag.severity] || severityColors.info}`}>{flag.label}</span>
                        ))}
                      </div>
                    )}
                    {(existing?.positive_tags || []).length > 0 && (
                      <div className='flex gap-1 mt-2 flex-wrap'>
                        {existing.positive_tags.map((t: any, ti: number) => (
                          <span key={ti} className='text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-400'>{t.tag.replace(/_/g, ' ')} (+{t.score})</span>
                        ))}
                      </div>
                    )}
                    {(existing?.negative_tags || []).length > 0 && (
                      <div className='flex gap-1 mt-1 flex-wrap'>
                        {existing.negative_tags.map((t: any, ti: number) => (
                          <span key={ti} className='text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400'>{t.tag.replace(/_/g, ' ')} ({t.score})</span>
                        ))}
                      </div>
                    )}
                    {existing?.summary && <p className='text-xs text-muted-foreground mt-2 italic'>{existing.summary}</p>}
                    {existing?.recommended_conditions && existing.recommended_conditions.length > 0 && (
                      <div className='flex gap-1 mt-2 flex-wrap'>
                        {existing.recommended_conditions.map((c: string, ci: number) => (
                          <span key={ci} className='text-xs px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300'>{c.replace(/_/g, ' ')}</span>
                        ))}
                      </div>
                    )}
                    {isReviewed && catScores && (
                      <div className='flex gap-3 mt-2 text-xs text-muted-foreground'>
                        {Object.entries(catScores).filter(([, v]) => v !== 0).map(([k, v]) => (
                          <span key={k} className={v > 0 ? 'text-green-400' : 'text-red-400'}>{k.replace(/_/g, ' ')}: {v > 0 ? '+' : ''}{v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className='flex flex-col items-end gap-2'>
                    <span className='text-lg font-bold'>{item.source === 'reviewed' ? (item.adjustment > 0 ? `+${item.adjustment}` : item.adjustment) : item.score}</span>
                    <button type='button' className='replay-btn text-xs px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15 transition' onClick={() => isOpen ? closeTagPanel() : openTagPanel(item)}>
                      {isReviewed ? 'Edit' : 'Tag'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className='replay-form mt-4 pt-4 border-t border-white/5'>
                    <div className='replay-tag-group mb-3'>
                      <p className='replay-tag-group-label text-xs text-muted-foreground mb-2'>Quick replay tags</p>
                      <div className='replay-tags flex gap-1.5 flex-wrap'>
                        {QUICK_REPLAY_TAGS.map((tag) => {
                          const isActive = draftTags.includes(tag)
                          const def = getTagDef(tag)
                          return (
                            <button key={tag} type='button' className={`replay-tag text-sm px-3 py-2 rounded-lg border transition ${isActive ? def?.score >= 3 ? 'active-pos border-green-500/40 bg-green-500/15 text-green-400' : def?.score <= -3 ? 'active-neg border-red-500/40 bg-red-500/15 text-red-400' : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-300'}`} onClick={() => toggleTag(tag)}>
                              {def?.label || tag.replace(/_/g, ' ')}{def?.score ? <small className='ml-1 opacity-50'>{def.score > 0 ? `+${def.score}` : def.score}</small> : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div className='replay-tag-group mb-3'>
                      <p className='replay-tag-group-label text-xs text-muted-foreground mb-2'>All tags</p>
                      <div className='replay-tags flex gap-1.5 flex-wrap'>
                        {ALL_REPLAY_TAGS.map((tag) => {
                          const isActive = draftTags.includes(tag)
                          const def = getTagDef(tag)
                          const inSuggested = item.flags ? item.flags.flatMap((f: any) => FLAG_TAG_MAP[f.key] || []).includes(tag) : false
                          return (
                            <button key={tag} type='button' className={`replay-tag text-xs px-2.5 py-1 rounded-lg border transition ${isActive ? def?.score >= 3 ? 'active-pos border-green-500/40 bg-green-500/15 text-green-400' : def?.score <= -3 ? 'active-neg border-red-500/40 bg-red-500/15 text-red-400' : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300' : inSuggested ? 'border-amber-500/30 bg-amber-500/5 text-amber-300' : 'border-white/10 hover:border-white/20 text-muted-foreground'}`} onClick={() => toggleTag(tag)}>
                              {def?.label || tag.replace(/_/g, ' ')}{def?.score ? <small className='ml-1 opacity-50'>{def.score > 0 ? `+${def.score}` : def.score}</small> : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <textarea className='replay-notes-input w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm resize-none' rows={2} placeholder='Notes about this run...' value={draftNotes} onChange={(e) => setDraftNotes(e.target.value)} />

                    <div className='replay-adjust-row flex items-center gap-3 my-4'>
                      <span className='text-xs text-muted-foreground'>Adj:</span>
                      <input type='range' min='-10' max='10' value={draftAdj} onChange={(e) => setDraftAdj(Number(e.target.value))} className='flex-1' />
                      <span className={`replay-adjust-value text-sm font-bold min-w-[4rem] text-right ${draftAdj > 0 ? 'pos text-green-400' : draftAdj < 0 ? 'neg text-red-400' : 'text-muted-foreground'}`}>{draftAdj > 0 ? `+${draftAdj}` : draftAdj}</span>
                    </div>

                    <div className='replay-actions flex gap-2 justify-end'>
                      <button type='button' className='replay-btn-cancel text-xs px-4 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-white transition' onClick={closeTagPanel}>Cancel</button>
                      <button type='button' className='replay-btn-save text-xs px-4 py-1.5 rounded-lg bg-cyan-500 text-black font-bold hover:opacity-90 transition' disabled={saving} onClick={() => saveNote(item.horse, item.course)}>{saving ? 'Saving...' : 'Save'}</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
