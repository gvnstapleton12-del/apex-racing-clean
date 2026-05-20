import React, {
  useRef,
  useState,
} from 'react'
import { useQuery } from '@tanstack/react-query'

import { fetchRacecards } from '../lib/racingApi'
import { formatOffTime } from '../lib/formatTime'

type UploadResultsProps = {
  onResultsLoaded?: (results: any[]) => void
}

type ResultsListProps = {
  results: any[]
}

function getRacesFromResults(results: any[]) {
  if (!Array.isArray(results)) {
    return []
  }

  return results
}

export function ResultsList({ results }: ResultsListProps) {
  const races = getRacesFromResults(results)

  const { data: liveRaces = [] } = useQuery<any[]>({
    queryKey: ['results-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  const completedRaces = liveRaces.filter((race: any) => {
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return false
    if (race.off_dt && new Date(race.off_dt) > now) return false
    const hasResults = (race.runners || []).some(
      (r: any) => r.position || r.pos
    )
    return hasResults
  })

  const todayUploaded = races.filter((race: any) => {
    const raceDate = race.date || (race.off_dt ? race.off_dt.slice(0, 10) : null)
    if (raceDate !== todayStr) return false
    const hasResults = (race.runners || []).some(
      (r: any) => r.position || r.pos
    )
    return hasResults
  })

  const totalCompleted = completedRaces.length + todayUploaded.length

  const todayUploadedIds = new Set(todayUploaded.map((r: any) => r.race_id))

  const olderRaces = races.filter(
    (r: any) => !todayUploadedIds.has(r.race_id)
  )

  const noContent = !olderRaces.length && !totalCompleted

  if (noContent) {
    return (
      <div className='dashboard-page'>
        <section className='empty-state'>
          <span>Results</span>
          <h2>No uploaded results yet</h2>
          <p>
            Upload an official results JSON file from the Upload tab
            and the processed races will appear here.
          </p>
        </section>
      </div>
    )
  }

  return (
    <div className='dashboard-page'>
      <section className='dashboard-hero'>
        <div className='hero-copy'>
          <span className='eyebrow'>Results</span>

          <h1>Race results</h1>

          <p>
            Live completed races appear automatically. Uploaded results
            from official JSON files are shown below.
          </p>
        </div>

        <div className='hero-metrics'>
          <div>
            <span>Completed today</span>
            <strong>{totalCompleted}</strong>
          </div>

          <div>
            <span>Saved uploads</span>
            <strong>{races.length}</strong>
          </div>
        </div>
      </section>

      {totalCompleted > 0 && (
        <section className='race-grid'>
          <div className='race-grid-header'>
            <h2>Today's results</h2>
          </div>
          {[...completedRaces, ...todayUploaded].map((race: any, raceIndex: number) => (
            <article
              key={race.race_id || `live-${raceIndex}`}
              className='race-card'
            >
              <div className='race-card-header'>
                <div>
                  <div className='race-meta-row'>
                    <span className='live-badge'>RESULT</span>
                    <span>{race.runners?.length || 0} runners</span>
                  </div>

                  <h2>{race.race_name}</h2>

                  <p>
                    {race.course} - {formatOffTime(race)}
                  </p>
                </div>
              </div>

              <div className='runner-list'>
                {(race.runners || []).map(
                  (runner: any, runnerIndex: number) => (
                    <div
                      key={runner.horse_id || runnerIndex}
                      className='runner-row'
                    >
                      <div>
                        <strong className='result-position'>
                          {runner.position || runner.pos || '-'}
                        </strong>

                        <span className='result-horse-name'>
                          {runner.horse || runner.name || 'Unnamed runner'}
                        </span>

                        <p>
                          {runner.jockey || '-'} - {runner.trainer || '-'}
                        </p>
                      </div>

                      <div className='runner-score'>
                        <strong>
                          {runner.spOdds ||
                            runner.sp ||
                            runner.odds ||
                            '-'}
                        </strong>
                        <span>SP</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {olderRaces.length > 0 && (
        <section className='race-grid'>
          <div className='race-grid-header'>
            <h2>Uploaded results</h2>
          </div>
          {olderRaces.map((race, raceIndex) => (
            <article
              key={race.race_id || raceIndex}
              className='race-card'
            >
              <div className='race-card-header'>
                <div>
                  <div className='race-meta-row'>
                    <span className='live-badge'>RESULT</span>
                    <span>{race.runners?.length || 0} runners</span>
                  </div>

                  <h2>
                    {race.race_name || race.name || 'Imported race'}
                  </h2>

                  <p>
                    {race.course || 'Unknown course'}
                    {race.off_time ? ` - ${formatOffTime(race)}` : ''}
                  </p>
                </div>
              </div>

              <div className='runner-list'>
                {(race.runners || []).map(
                  (runner: any, runnerIndex: number) => (
                    <div
                      key={runner.horse_id || runnerIndex}
                      className='runner-row'
                    >
                      <div>
                        <strong className='result-position'>
                          {runner.position || runner.pos || '-'}
                        </strong>

                        <span className='result-horse-name'>
                          {runner.horse || runner.name || 'Unnamed runner'}
                        </span>

                        <p>
                          {runner.jockey || '-'} - {runner.trainer || '-'}
                        </p>
                      </div>

                      <div className='runner-score'>
                        <strong>
                          {runner.spOdds ||
                            runner.sp ||
                            runner.odds ||
                            '-'}
                        </strong>
                        <span>SP</span>
                      </div>
                    </div>
                  )
                )}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  )
}

export default function UploadResults(props: UploadResultsProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      setLoading(true)
      setMessage('Processing results...')

      const text = await file.text()
      const json = JSON.parse(text)

      const response = await fetch(
        'http://localhost:3000/api/upload-results',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(json),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      const races =
        json.results ||
        json.racecards ||
        json.races ||
        json.data ||
        []

      props.onResultsLoaded?.(races)

      setMessage(
        `Successfully processed ${
          data.processedRaces || races.length || 0
        } races. Opening Results...`
      )
    } catch (error: any) {
      console.error(error)
      setMessage(error.message || 'Invalid JSON file')
    } finally {
      setLoading(false)
      event.target.value = ''
    }
  }

  return (
    <div className='dashboard-page'>
      <section className='empty-state upload-panel'>
        <span>Upload</span>

        <h2>Upload official results</h2>

        <p>
          Choose your Racing API results JSON file. Once processed,
          APEX will move the imported races to the Results tab.
        </p>

        <button
          type='button'
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          className='primary-button upload-button'
        >
          {loading ? 'Processing...' : 'Choose Results JSON'}
        </button>

        <input
          ref={fileInputRef}
          type='file'
          accept='.json,application/json'
          style={{ display: 'none' }}
          onChange={handleUpload}
        />

        {message && (
          <div className='upload-message'>
            {message}
          </div>
        )}
      </section>
    </div>
  )
}
