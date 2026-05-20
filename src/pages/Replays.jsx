import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRacecards } from '../lib/racingApi'
import { formatOffTime } from '../lib/formatTime'
import { openAtTheRacesHorseForm } from '../lib/horseLinks'

const QUICK_TAGS = {
  positive: [
    { label: 'Won impressively', adj: 5 },
    { label: 'Finished strongly', adj: 3 },
    { label: 'Troubled run (forgive)', adj: 4 },
    { label: 'Ran green (will improve)', adj: 2 },
    { label: 'Good attitude', adj: 2 },
  ],
  negative: [
    { label: 'Pulled hard', adj: -3 },
    { label: 'One-paced finish', adj: -3 },
    { label: 'Didn\'t stay distance', adj: -4 },
    { label: 'Outclassed visually', adj: -5 },
    { label: 'Sore / went lame', adj: -5 },
  ],
}

export default function Replays() {
  const { data: races = [] } = useQuery({
    queryKey: ['replay-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const [notesDb, setNotesDb] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [draft, setDraft] = useState({ tags: [], notes: '', adjustment: 0 })

  useEffect(() => {
    fetch('/api/replay-notes')
      .then((r) => r.json())
      .then(setNotesDb)
      .catch(() => {})
  }, [])

  const runners = races
    .filter((r) => r.region === 'GB' || r.region === 'IRE' || r.region === 'gb' || r.region === 'ire')
    .flatMap((race) =>
      (race.runners || []).map((runner) => ({
        ...runner,
        race,
        offTime: formatOffTime(race),
        course: race.course,
        raceName: race.race_name,
      }))
    )

  function openForm(key, existing) {
    setExpanded(key)
    setDraft({
      tags: existing?.tags || [],
      notes: existing?.notes || '',
      adjustment: existing?.adjustment || 0,
    })
  }

  function toggleTag(tag) {
    setDraft((prev) => {
      const exists = prev.tags.includes(tag.label)
      const tags = exists
        ? prev.tags.filter((t) => t !== tag.label)
        : [...prev.tags, tag.label]
      const totalAdj = tags.reduce((sum, t) => {
        const found = [...QUICK_TAGS.positive, ...QUICK_TAGS.negative].find((x) => x.label === t)
        return sum + (found?.adj || 0)
      }, 0)
      return { ...prev, tags, adjustment: Math.max(-10, Math.min(10, totalAdj)) }
    })
  }

  async function saveNote(key, horse, course) {
    await fetch('/api/replay-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        horse,
        course,
        tags: draft.tags,
        notes: draft.notes,
        adjustment: draft.adjustment,
      }),
    })

    const res = await fetch('/api/replay-notes')
    const data = await res.json()
    setNotesDb(data)
    setExpanded(null)
  }

  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>Race review</span>
          <h1>Replay Notes</h1>
          <p>
            Watch replays and record your observations. Each note adjusts
            the APEX confidence score for that horse.
          </p>
        </div>
        <div className='hero-metrics'>
          <div>
            <span>Today's runners</span>
            <strong>{runners.length}</strong>
          </div>
          <div>
            <span>Reviewed</span>
            <strong>{Object.keys(notesDb).length}</strong>
          </div>
        </div>
      </section>

      <section className='replay-list'>
        {runners.map((runner) => {
          const key = `${runner.horse}|${runner.course}`
          const existing = notesDb[key]
          const isOpen = expanded === key

          return (
            <div key={key} className={`replay-card${isOpen ? ' is-open' : ''}`}>
              <div className='replay-card-head' onClick={() => openForm(key, existing)}>
                <div className='replay-card-info'>
                  <strong className='replay-card-horse' onClick={() => openAtTheRacesHorseForm(runner, runner.race)}>{runner.horse}</strong>
                  <span className='replay-card-meta'>
                    {runner.offTime} &middot; {runner.course} &middot; {runner.raceName}
                  </span>
                </div>
                <div className='replay-card-status'>
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
                  <div className='replay-tag-group'>
                    <span className='replay-tag-group-label'>Positive observations</span>
                    <div className='replay-tags'>
                      {QUICK_TAGS.positive.map((tag) => (
                        <button
                          key={tag.label}
                          type='button'
                          className={`replay-tag ${draft.tags.includes(tag.label) ? 'active-pos' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag.label} <small>(+{tag.adj})</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className='replay-tag-group'>
                    <span className='replay-tag-group-label'>Negative observations</span>
                    <div className='replay-tags'>
                      {QUICK_TAGS.negative.map((tag) => (
                        <button
                          key={tag.label}
                          type='button'
                          className={`replay-tag ${draft.tags.includes(tag.label) ? 'active-neg' : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag.label} <small>({tag.adj})</small>
                        </button>
                      ))}
                    </div>
                  </div>

                  <textarea
                    className='replay-notes-input'
                    placeholder='Free-text notes about the run...'
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    rows={3}
                  />

                  <div className='replay-adjust-row'>
                    <span>Manual adjustment:</span>
                    <input
                      type='range'
                      min='-10'
                      max='10'
                      value={draft.adjustment}
                      onChange={(e) => setDraft({ ...draft, adjustment: Number(e.target.value) })}
                    />
                    <span className={`replay-adjust-value ${draft.adjustment > 0 ? 'pos' : draft.adjustment < 0 ? 'neg' : ''}`}>
                      {draft.adjustment > 0 ? '+' : ''}{draft.adjustment}
                    </span>
                  </div>

                  <div className='replay-actions'>
                    <button type='button' className='replay-btn replay-btn-save' onClick={() => saveNote(key, runner.horse, runner.course)}>
                      Save notes
                    </button>
                    <button type='button' className='replay-btn replay-btn-cancel' onClick={() => setExpanded(null)}>
                      Cancel
                    </button>
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
