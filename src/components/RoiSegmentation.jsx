import { useState, useEffect } from 'react'

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
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('course')

  useEffect(() => {
    fetch('/api/calibration')
      .then((r) => r.json())
      .then((data) => {
        setSegments(data.analytics?.segments || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
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

  const tabs = [
    { key: 'course', label: 'By Course' },
    { key: 'raceType', label: 'By Race Type' },
    { key: 'fieldSize', label: 'By Field Size' },
    { key: 'going', label: 'By Going' },
    { key: 'oddsRange', label: 'By Odds Range' },
    { key: 'trainer', label: 'By Trainer' },
    { key: 'interaction', label: 'By Interaction' },
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
