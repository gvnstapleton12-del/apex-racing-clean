import { useState, useEffect } from 'react'
import { passesValueGate } from '../lib/engine'

function SegmentationTable({ data, columns, emptyMessage }) {
  if (!data || data.length === 0) {
    return <div className='seg-empty'>{emptyMessage || 'No data yet. Upload results to start tracking.'}</div>
  }

  return (
    <div className='seg-table-wrap'>
      <table className='seg-table'>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => {
                const value = row[col.key]
                let cls = ''
                if (col.key === 'roi' || col.key === 'profitLoss') {
                  cls = value >= 0 ? 'positive' : 'negative'
                }
                if (col.key === 'strikeRate') {
                  cls = value >= 25 ? 'hot' : value >= 15 ? 'warm' : 'cold'
                }
                return (
                  <td key={col.key} className={cls}>
                    {col.format ? col.format(value) : value}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function RoiSegmentation() {
  const [segments, setSegments] = useState(null)
  const [calibration, setCalibration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('course')

  useEffect(() => {
    Promise.all([
      fetch('/api/calibration').then(r => r.json()),
    ]).then(([calData]) => {
      setSegments(calData.analytics?.segments || null)
      setCalibration(calData)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className='seg-loading'>Loading segmentation data...</div>
  }

  if (!segments) {
    return (
      <div className='seg-empty-state'>
        <h2>ROI Segmentation</h2>
        <p>No segmentation data yet. Upload results to discover where the model is truly profitable.</p>
      </div>
    )
  }

  // Compute value picks from calibration records
  const records = calibration?.records || []
  const valuePicks = records.filter(r => passesValueGate(Number(r.predictedWinProb), Number(r.predictedOdds), Number(r.predictedScore || 0), Number(r.previousRuns || 0), r.personalAffinity ?? null))

  // Build value picks segmentation
  function buildValuePicksSegmentation(groupBy) {
    const groups = {}
    valuePicks.forEach(r => {
      let key
      if (groupBy === 'course') key = r.course || 'Unknown'
      else if (groupBy === 'oddsRange') {
        const odds = Number(r.predictedOdds) || 2
        if (odds < 2) key = '< 2/1'
        else if (odds < 4) key = '2/1 - 4/1'
        else if (odds < 6) key = '4/1 - 6/1'
        else if (odds < 10) key = '6/1 - 10/1'
        else key = '10/1+'
      }
      else if (groupBy === 'fieldSize') {
        const fs = r.fieldSize || 0
        if (fs <= 7) key = '5-7 runners'
        else if (fs <= 11) key = '8-11 runners'
        else key = '12+ runners'
      }
      else if (groupBy === 'going') key = r.going || 'Unknown'
      else key = 'All'

      if (!groups[key]) groups[key] = { runners: 0, wins: 0, pl: 0 }
      groups[key].runners++
      if (r.actualWon) {
        groups[key].wins++
        groups[key].pl += (Number(r.actualOdds) || 0) - 1
      } else {
        groups[key].pl -= 1
      }
    })

    return Object.entries(groups).map(([key, g]) => ({
      [groupBy === 'course' ? 'course' : groupBy === 'oddsRange' ? 'oddsRange' : groupBy === 'fieldSize' ? 'fieldSize' : 'going']: key,
      runners: g.runners,
      wins: g.wins,
      strikeRate: Math.round((g.wins / g.runners) * 1000) / 10,
      roi: Math.round((g.pl / g.runners) * 1000) / 10,
      profitLoss: Math.round(g.pl * 10) / 10,
    })).sort((a, b) => b.roi - a.roi)
  }

  const valuePicksByCourse = buildValuePicksSegmentation('course')
  const valuePicksByOdds = buildValuePicksSegmentation('oddsRange')
  const valuePicksByFieldSize = buildValuePicksSegmentation('fieldSize')
  const valuePicksByGoing = buildValuePicksSegmentation('going')

  const tabs = [
    { key: 'course', label: 'By Course' },
    { key: 'raceType', label: 'By Race Type' },
    { key: 'fieldSize', label: 'By Field Size' },
    { key: 'going', label: 'By Going' },
    { key: 'oddsRange', label: 'By Odds Range' },
    { key: 'trainer', label: 'By Trainer' },
    { key: 'interaction', label: 'By Interaction' },
    { key: 'valueCourse', label: 'Value Picks: Course' },
    { key: 'valueOdds', label: 'Value Picks: Odds' },
    { key: 'valueField', label: 'Value Picks: Field Size' },
    { key: 'valueGoing', label: 'Value Picks: Going' },
  ]

  const courseCols = [
    { key: 'course', label: 'Course' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const raceTypeCols = [
    { key: 'raceType', label: 'Type' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const fieldSizeCols = [
    { key: 'fieldSize', label: 'Field Size' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const goingCols = [
    { key: 'going', label: 'Going' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const oddsRangeCols = [
    { key: 'oddsRange', label: 'Odds Range' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const trainerCols = [
    { key: 'trainer', label: 'Trainer' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const interactionCols = [
    { key: 'interaction', label: 'Interaction' },
    { key: 'runners', label: 'Runs' },
    { key: 'wins', label: 'Wins' },
    { key: 'strikeRate', label: 'SR%', format: (v) => `${v}%` },
    { key: 'roi', label: 'ROI%', format: (v) => `${v >= 0 ? '+' : ''}${v}%` },
    { key: 'profitLoss', label: 'P/L', format: (v) => `${v >= 0 ? '+' : ''}${v}` },
  ]

  const dataMap = {
    course: { data: segments.byCourse?.courses || [], cols: courseCols, empty: 'No course data yet.' },
    raceType: { data: segments.byRaceType?.raceTypes || [], cols: raceTypeCols, empty: 'No race type data yet.' },
    fieldSize: { data: segments.byFieldSize?.fieldSizes || [], cols: fieldSizeCols, empty: 'No field size data yet.' },
    going: { data: segments.byGoing?.goings || [], cols: goingCols, empty: 'No going data yet.' },
    oddsRange: { data: segments.byOddsRange?.oddsRanges || [], cols: oddsRangeCols, empty: 'No odds range data yet.' },
    trainer: { data: segments.byTrainer?.trainers || [], cols: trainerCols, empty: 'No trainer data yet (min 3 runs).' },
    interaction: { data: segments.byInteraction?.interactions || [], cols: interactionCols, empty: 'No interaction data yet.' },
    valueCourse: { data: valuePicksByCourse, cols: courseCols, empty: 'No value picks by course yet.' },
    valueOdds: { data: valuePicksByOdds, cols: oddsRangeCols, empty: 'No value picks by odds range yet.' },
    valueField: { data: valuePicksByFieldSize, cols: fieldSizeCols, empty: 'No value picks by field size yet.' },
    valueGoing: { data: valuePicksByGoing, cols: goingCols, empty: 'No value picks by going yet.' },
  }

  const current = dataMap[activeTab]

  return (
    <div className='roi-segmentation'>
      <div className='seg-header'>
        <h2>ROI Segmentation</h2>
        <p className='seg-subtitle'>Discover where the model is truly profitable</p>
      </div>

      <div className='seg-tabs'>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type='button'
            className={`seg-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SegmentationTable
        data={current.data}
        columns={current.cols}
        emptyMessage={current.empty}
      />
    </div>
  )
}
