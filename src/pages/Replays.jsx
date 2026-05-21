import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRacecards } from '../lib/racingApi'
import { formatOffTime } from '../lib/formatTime'
import { openAtTheRacesHorseForm } from '../lib/horseLinks'

const QUICK_REPLAY_TAGS = [
  'looked_winner', 'weakened', 'one_paced', 'outpaced',
  'stayed_on', 'wrong_trip', 'needs_further',
]

const ALL_TAGS = [
  'strong_finish', 'finished_well', 'stayed_on', 'head_way', 'rallied',
  'weakened', 'stopped_quickly', 'keen', 'one_paced', 'ran_flat',
  'blocked_run', 'hampered', 'no_room', 'bumped', 'slowly_away', 'missed_break',
  'looked_winner', 'found_little', 'needs_further', 'wrong_trip', 'drops_in_trip',
  'flew_up_hill', 'idled', 'outpaced', 'hung_badly', 'ran_green',
]

const TAG_VALUES = {
  strong_finish: 5, finished_well: 5, stayed_on: 4, head_way: 3, rallied: 2,
  weakened: -4, stopped_quickly: -7, keen: -2, one_paced: -4, ran_flat: -5,
  blocked_run: 4, hampered: 3, no_room: 3, bumped: -2, slowly_away: -3, missed_break: -3,
  looked_winner: 5, found_little: -6, needs_further: 3, wrong_trip: 6, drops_in_trip: 3,
  flew_up_hill: 3, idled: -2, outpaced: -3, hung_badly: -4, ran_green: -2,
}

export default function Replays() {
  const { data: races = [] } = useQuery({
    queryKey: ['replay-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const [notesDb, setNotesDb] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [draftTags, setDraftTags] = useState([])
  const [draftNotes, setDraftNotes] = useState('')
  const [draftAdj, setDraftAdj] = useState(0)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetch('/api/replay-notes')
      .then((r) => r.json())
      .then(setNotesDb)
      .catch(() => {})
  }, [])

  const ukRaces = races.filter((r) => r.region === 'GB' || r.region === 'IRE' || r.region === 'gb' || r.region === 'ire')

  const allRunners = ukRaces.flatMap((race) =>
    (race.runners || []).map((runner) => ({
      ...runner,
      race,
      offTime: formatOffTime(race),
      course: race.course,
      raceName: race.race_name,
      hasFlags: (runner.replayFlags || []).length > 0,
    }))
  )

  const displayRunners = showAll ? allRunners : allRunners.filter((r) => r.hasFlags)
  const reviewedCount = Object.keys(notesDb).length

  function openForm(key, existing) {
    setExpanded(key)
    setDraftTags(existing?.tags || [])
    setDraftNotes(existing?.notes || '')
    setDraftAdj(existing?.adjustment || 0)
  }

  function toggleTag(tag) {
    setDraftTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    )
  }

  async function saveNote(key, horse, course) {
    await fetch('/api/replay-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horse, course, tags: draftTags, notes: draftNotes, adjustment: draftAdj }),
    })
    const res = await fetch('/api/replay-notes')
    setNotesDb(await res.json())
    setExpanded(null)
  }

  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>Race review</span>
          <h1>Replay Notes</h1>
          <p>
            Flagged horses prioritised. Toggle to see all runners. Each note adjusts the APEX score.
          </p>
        </div>
        <div className='hero-metrics'>
          <div><span>Flagged</span><strong>{allRunners.filter((r) => r.hasFlags).length}</strong></div>
          <div><span>Reviewed</span><strong>{reviewedCount}</strong></div>
          <div><span>Races</span><strong>{ukRaces.length}</strong></div>
        </div>
      </section>

      <div className='flex gap-2 mb-6'>
        <button
          type='button'
          className={`text-sm px-4 py-2 rounded-lg border transition ${!showAll ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'border-white/10 text-muted-foreground hover:text-white'}`}
          onClick={() => setShowAll(false)}
        >
          Flagged ({allRunners.filter((r) => r.hasFlags).length})
        </button>
        <button
          type='button'
          className={`text-sm px-4 py-2 rounded-lg border transition ${showAll ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'border-white/10 text-muted-foreground hover:text-white'}`}
          onClick={() => setShowAll(true)}
        >
          All runners ({allRunners.length})
        </button>
      </div>

      <section className='replay-list'>
        {displayRunners.map((runner) => {
          const key = `${runner.horse}|${runner.course}`
          const existing = notesDb[key]
          const isOpen = expanded === key

          return (
            <div key={key} className={`replay-card${isOpen ? ' is-open' : ''}${runner.hasFlags ? ' border-l-2 border-l-amber-500/30' : ''}`}>
              <div className='replay-card-head' onClick={() => openForm(key, existing)}>
                <div className='replay-card-info'>
                  <div className='flex items-center gap-2'>
                    {runner.hasFlags && <span className='text-xs text-amber-400'>●</span>}
                    <strong className='replay-card-horse'>{runner.horse}</strong>
                  </div>
                  <span className='replay-card-meta'>{runner.offTime} &middot; {runner.course} &middot; {runner.raceName}</span>
                  {existing && existing.tags.length > 0 && (
                    <div className='flex gap-1 mt-1 flex-wrap'>
                      {existing.tags.map((t, i) => {
                        const tv = TAG_VALUES[t] || 0
                        return <span key={i} className={`replay-badge text-xs px-2 py-0.5 rounded ${tv >= 3 ? 'pos' : tv <= -3 ? 'neg' : 'neutral'}`}>{t.replace(/_/g, ' ')}</span>
                      })}
                    </div>
                  )}
                </div>
                <div className='replay-card-status'>
                  <button type='button' className='text-xs text-cyan-400 hover:text-cyan-300 mr-2' onClick={(e) => { e.stopPropagation(); openAtTheRacesHorseForm(runner, runner.race) }}>
                    Replay
                  </button>
                  {existing ? (
                    <span className={`replay-badge ${existing.adjustment > 0 ? 'pos' : existing.adjustment < 0 ? 'neg' : 'neutral'}`}>
                      {existing.adjustment > 0 ? '+' : ''}{existing.adjustment}
                    </span>
                  ) : (
                    <span className='replay-badge neutral'>New</span>
                  )}
                  <span className='replay-card-arrow'>{isOpen ? '▲' : '▼'}</span>
                </div>
              </div>

              {isOpen && (
                <div className='replay-form'>
                  <div className='replay-tag-group mb-3'>
                    <span className='replay-tag-group-label'>Quick replay tags</span>
                    <div className='replay-tags flex gap-1.5 flex-wrap'>
                      {QUICK_REPLAY_TAGS.map((tag) => {
                        const isActive = draftTags.includes(tag)
                        const tv = TAG_VALUES[tag] || 0
                        return (
                          <button
                            key={tag}
                            type='button'
                            className={`replay-tag text-sm px-3 py-2 rounded-lg border transition ${
                              isActive
                                ? tv >= 3 ? 'active-pos border-green-500/40 bg-green-500/15 text-green-400'
                                  : tv <= -3 ? 'active-neg border-red-500/40 bg-red-500/15 text-red-400'
                                    : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                                : 'border-amber-500/30 bg-amber-500/5 text-amber-300'
                            }`}
                            onClick={() => toggleTag(tag)}
                          >
                            {tag.replace(/_/g, ' ')} <small className='opacity-50'>({tv > 0 ? `+${tv}` : tv})</small>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className='replay-tag-group mb-3'>
                    <span className='replay-tag-group-label'>All tags</span>
                    <div className='replay-tags flex gap-1.5 flex-wrap'>
                      {ALL_TAGS.map((tag) => {
                        const isActive = draftTags.includes(tag)
                        const tv = TAG_VALUES[tag] || 0
                        return (
                          <button
                            key={tag}
                            type='button'
                            className={`replay-tag text-xs px-2.5 py-1 rounded-lg border transition ${
                              isActive
                                ? tv >= 3 ? 'active-pos border-green-500/40 bg-green-500/15 text-green-400'
                                  : tv <= -3 ? 'active-neg border-red-500/40 bg-red-500/15 text-red-400'
                                    : 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                                : 'border-white/10 hover:border-white/20 text-muted-foreground'
                            }`}
                            onClick={() => toggleTag(tag)}
                          >
                            {tag.replace(/_/g, ' ')} <small className='opacity-50'>({tv > 0 ? `+${tv}` : tv})</small>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <textarea
                    className='replay-notes-input w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm resize-none'
                    placeholder='Free-text notes about the run...'
                    value={draftNotes}
                    onChange={(e) => setDraftNotes(e.target.value)}
                    rows={3}
                  />

                  <div className='replay-adjust-row flex items-center gap-3 my-4'>
                    <span className='text-xs text-muted-foreground'>Adj:</span>
                    <input type='range' min='-10' max='10' value={draftAdj} onChange={(e) => setDraftAdj(Number(e.target.value))} className='flex-1' />
                    <span className={`replay-adjust-value text-sm font-bold min-w-[4rem] text-right ${draftAdj > 0 ? 'pos text-green-400' : draftAdj < 0 ? 'neg text-red-400' : 'text-muted-foreground'}`}>
                      {draftAdj > 0 ? `+${draftAdj}` : draftAdj}
                    </span>
                  </div>

                  <div className='replay-actions flex gap-2 justify-end'>
                    <button type='button' className='replay-btn-cancel text-xs px-4 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-white transition' onClick={() => setExpanded(null)}>Cancel</button>
                    <button type='button' className='replay-btn-save text-xs px-4 py-1.5 rounded-lg bg-cyan-500 text-black font-bold hover:opacity-90 transition' onClick={() => saveNote(key, runner.horse, runner.course)}>Save notes</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}
