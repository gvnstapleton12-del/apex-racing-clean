import { useState, useEffect } from 'react'
import RoiSegmentation from './RoiSegmentation'
import AntiOverfitDashboard from './AntiOverfitDashboard'

function CalibrationBucket({ bucket }) {
  const isOverconfident = bucket.avgPredicted > bucket.actualRate
  const isUnderconfident = bucket.avgPredicted < bucket.actualRate

  return (
    <div className='cal-bucket'>
      <div className='cal-bucket-header'>
        <span className='cal-bucket-range'>{bucket.range}%</span>
        <span className='cal-bucket-count'>{bucket.count} runners</span>
      </div>
      <div className='cal-bucket-bars'>
        <div className='cal-bar-group'>
          <span className='cal-bar-label'>Predicted</span>
          <div className='cal-bar-track'>
            <div
              className='cal-bar-fill cal-bar-predicted'
              style={{ width: `${bucket.avgPredicted}%` }}
            />
          </div>
          <span className='cal-bar-value'>{bucket.avgPredicted}%</span>
        </div>
        <div className='cal-bar-group'>
          <span className='cal-bar-label'>Actual</span>
          <div className='cal-bar-track'>
            <div
              className={`cal-bar-fill cal-bar-actual ${isOverconfident ? 'over' : isUnderconfident ? 'under' : ''}`}
              style={{ width: `${bucket.actualRate}%` }}
            />
          </div>
          <span className='cal-bar-value'>{bucket.actualRate}%</span>
        </div>
      </div>
      <div className='cal-bucket-error'>
        <span className={`cal-error-value ${bucket.calibrationError > 10 ? 'high' : bucket.calibrationError > 5 ? 'medium' : 'low'}`}>
          ±{bucket.calibrationError}%
        </span>
        <span className='cal-error-label'>calibration error</span>
      </div>
    </div>
  )
}

function GradeCalibration({ grade }) {
  return (
    <div className='cal-grade-row'>
      <span className='cal-grade-name'>{grade.grade}</span>
      <span className='cal-grade-count'>{grade.count}</span>
      <div className='cal-grade-bars'>
        <div className='cal-grade-bar'>
          <span className='cal-grade-bar-label'>Predicted</span>
          <div className='cal-grade-bar-track'>
            <div
              className='cal-grade-bar-fill predicted'
              style={{ width: `${grade.avgPredictedProb}%` }}
            />
          </div>
          <span className='cal-grade-bar-value'>{grade.avgPredictedProb}%</span>
        </div>
        <div className='cal-grade-bar'>
          <span className='cal-grade-bar-label'>Actual</span>
          <div className='cal-grade-bar-track'>
            <div
              className={`cal-grade-bar-fill actual ${grade.avgPredictedProb > grade.actualRate ? 'over' : grade.avgPredictedProb < grade.actualRate ? 'under' : ''}`}
              style={{ width: `${grade.actualRate}%` }}
            />
          </div>
          <span className='cal-grade-bar-value'>{grade.actualRate}%</span>
        </div>
      </div>
      <span className={`cal-grade-error ${grade.calibrationError > 10 ? 'high' : grade.calibrationError > 5 ? 'medium' : 'low'}`}>
        ±{grade.calibrationError}%
      </span>
    </div>
  )
}

function QualityCalibration({ quality }) {
  return (
    <div className='cal-quality-row'>
      <span className='cal-quality-name'>{quality.quality}</span>
      <span className='cal-quality-count'>{quality.count}</span>
      <span className='cal-quality-rate'>{quality.actualRate}% SR</span>
      <span className={`cal-quality-roi ${quality.roi >= 0 ? 'positive' : 'negative'}`}>
        {quality.roi >= 0 ? '+' : ''}{quality.roi}% ROI
      </span>
      <span className={`cal-quality-pl ${quality.profitLoss >= 0 ? 'positive' : 'negative'}`}>
        {quality.profitLoss >= 0 ? '+' : ''}{quality.profitLoss} PL
      </span>
    </div>
  )
}

export default function CalibrationDashboard() {
  const [calibration, setCalibration] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('probability')

  useEffect(() => {
    fetch('/api/calibration')
      .then((r) => r.json())
      .then((data) => {
        setCalibration(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className='cal-loading'>Loading calibration data...</div>
  }

  if (!calibration || !calibration.analytics) {
    return (
      <div className='cal-empty'>
        <h2>Calibration Tracking</h2>
        <p>No calibration data yet. Upload results to start tracking model accuracy.</p>
      </div>
    )
  }

  const {
    byProbability = { totalRecords: 0, totalWins: 0, overallAccuracy: 0, brierScore: 0, reliability: 'N/A', buckets: [] },
    byPlaceProbability = { buckets: [] },
    byGrade = { grades: [] },
    byBetQuality = { qualities: [] },
  } = calibration.analytics || {}

  const records = calibration.records || []
  const wins = records.filter(r => r.actualWon).length
  const places = records.filter(r => !r.actualWon && r.actualPlaced).length
  const losses = records.filter(r => !r.actualWon && !r.actualPlaced).length
  const placeRate = records.length ? (((wins + places) / records.length) * 100).toFixed(1) : 0

  // Compute value-pick metrics on-the-fly using the production gate
  function passesValueGate(prob, odds, apexScore = 0, previousRuns = 0) {
    if (!odds || odds <= 1 || !prob) return false
    const requiredApexFloor = previousRuns < 5 ? 50 : 40
    if (apexScore > 0 && apexScore < requiredApexFloor) return false
    const implied = (1 / odds) * 100
    const marginPct = implied > 0 ? ((prob - implied) / implied) * 100 : 0
    return prob >= 10 && marginPct > 25
  }
  const valuePicks = records.filter(r => passesValueGate(Number(r.predictedWinProb), Number(r.predictedOdds), Number(r.predictedScore || 0), Number(r.previousRuns || 0)))
  const nonValuePicks = records.filter(r => !passesValueGate(Number(r.predictedWinProb), Number(r.predictedOdds), Number(r.predictedScore || 0), Number(r.previousRuns || 0)))
  const vpWins = valuePicks.filter(r => r.actualWon).length
  const vpWR = valuePicks.length ? ((vpWins / valuePicks.length) * 100).toFixed(1) : '0.0'
  const vpPL = valuePicks.reduce((s, r) => s + (r.actualWon ? (Number(r.actualOdds) || 0) - 1 : -1), 0)
  const vpROI = valuePicks.length ? ((vpPL / valuePicks.length) * 100).toFixed(1) : '0.0'

  // Eighth-Kelly simulation
  let kellyBankroll = 1000
  valuePicks.forEach(r => {
    const p = Number(r.predictedWinProb) / 100
    const odds = Number(r.actualOdds) || Number(r.predictedOdds) || 2
    const b = odds - 1
    const edge = p * b - (1 - p)
    if (edge > 0) {
      const kelly = (edge / b) * 0.125
      const stake = kellyBankroll * Math.min(kelly, 0.05)
      kellyBankroll += r.actualWon ? stake * (odds - 1) : -stake
    }
  })
  const kellyRoi = ((kellyBankroll - 1000) / 1000) * 100

  // Dense vs sparse breakdown using previousRuns (actual historical runs)
  const densePicks = valuePicks.filter(r => (r.previousRuns || 0) >= 5)
  const sparsePicks = valuePicks.filter(r => (r.previousRuns || 0) < 5)
  const denseWR = densePicks.length ? ((densePicks.filter(r => r.actualWon).length / densePicks.length) * 100).toFixed(1) : '0.0'
  const densePL = densePicks.reduce((s, r) => s + (r.actualWon ? (Number(r.actualOdds) || 0) - 1 : -1), 0)
  const denseROI = densePicks.length ? ((densePL / densePicks.length) * 100).toFixed(1) : '0.0'
  const sparseWR = sparsePicks.length ? ((sparsePicks.filter(r => r.actualWon).length / sparsePicks.length) * 100).toFixed(1) : '0.0'
  const sparsePL = sparsePicks.reduce((s, r) => s + (r.actualWon ? (Number(r.actualOdds) || 0) - 1 : -1), 0)
  const sparseROI = sparsePicks.length ? ((sparsePL / sparsePicks.length) * 100).toFixed(1) : '0.0'

  return (
    <div className='calibration-dashboard'>
      <div className='cal-header'>
        <h2>Calibration Tracking</h2>
        <div className='cal-header-stats'>
          <div className='cal-stat'>
            <span className='cal-stat-value'>{byProbability.totalRecords}</span>
            <span className='cal-stat-label'>Predictions</span>
          </div>
          <div className='cal-stat' style={{ color: '#22c55e' }}>
            <span className='cal-stat-value'>{wins}</span>
            <span className='cal-stat-label'>Wins</span>
          </div>
          <div className='cal-stat' style={{ color: '#eab308' }}>
            <span className='cal-stat-value'>{places}</span>
            <span className='cal-stat-label'>Places</span>
          </div>
          <div className='cal-stat' style={{ color: '#ef4444' }}>
            <span className='cal-stat-value'>{losses}</span>
            <span className='cal-stat-label'>Losses</span>
          </div>
          <div className='cal-stat'>
            <span className='cal-stat-value'>{byProbability.overallAccuracy}%</span>
            <span className='cal-stat-label'>Win Rate</span>
          </div>
          <div className='cal-stat'>
            <span className='cal-stat-value'>{placeRate}%</span>
            <span className='cal-stat-label'>Place Rate</span>
          </div>
          <div className='cal-stat'>
            <span className='cal-stat-value'>{byProbability.brierScore}</span>
            <span className='cal-stat-label'>Brier Score</span>
          </div>
          <div className='cal-stat'>
            <span className={`cal-stat-value cal-reliability-${byProbability.reliability.toLowerCase().replace(/[^a-z]/g, '')}`}>
              {byProbability.reliability}
            </span>
            <span className='cal-stat-label'>Reliability</span>
          </div>
        </div>
      </div>

      {valuePicks.length > 0 && (
        <div className='cal-value-summary' style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', margin: '0 1rem', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#22c55e', fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Value Picks Performance</span>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Gate: P ≥ 10% + 25% margin + APEX ≥ 40</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div>
              <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>Bets</span>
              <strong style={{ color: '#e2e8f0', fontSize: '1.1rem' }}>{valuePicks.length}</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>Win Rate</span>
              <strong style={{ color: Number(vpWR) >= 10 ? '#22c55e' : '#eab308', fontSize: '1.1rem' }}>{vpWR}%</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>Level ROI</span>
              <strong style={{ color: Number(vpROI) >= 0 ? '#22c55e' : '#ef4444', fontSize: '1.1rem' }}>{Number(vpROI) >= 0 ? '+' : ''}{vpROI}%</strong>
            </div>
            <div>
              <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>Eighth-Kelly ROI</span>
              <strong style={{ color: kellyRoi >= 0 ? '#22c55e' : '#ef4444', fontSize: '1.1rem' }}>{kellyRoi >= 0 ? '+' : ''}{kellyRoi.toFixed(1)}%</strong>
            </div>
          </div>
          {(densePicks.length > 0 || sparsePicks.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(34,197,94,0.1)' }}>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Dense Data (5+ runs)</span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}><strong>{densePicks.length}</strong> bets</span>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}><strong style={{ color: Number(denseWR) >= 10 ? '#22c55e' : '#eab308' }}>{denseWR}%</strong> WR</span>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}><strong style={{ color: Number(denseROI) >= 0 ? '#22c55e' : '#ef4444' }}>{Number(denseROI) >= 0 ? '+' : ''}{denseROI}%</strong> ROI</span>
                </div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block', marginBottom: '0.25rem' }}>Sparse Data (&lt;5 runs)</span>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}><strong>{sparsePicks.length}</strong> bets</span>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}><strong style={{ color: Number(sparseWR) >= 10 ? '#22c55e' : '#eab308' }}>{sparseWR}%</strong> WR</span>
                  <span style={{ color: '#e2e8f0', fontSize: '0.85rem' }}><strong style={{ color: Number(sparseROI) >= 0 ? '#22c55e' : '#ef4444' }}>{Number(sparseROI) >= 0 ? '+' : ''}{sparseROI}%</strong> ROI</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className='cal-tabs'>
        <button
          type='button'
          className={`cal-tab ${activeTab === 'probability' ? 'active' : ''}`}
          onClick={() => setActiveTab('probability')}
        >
          Win Probability
        </button>
        <button
          type='button'
          className={`cal-tab ${activeTab === 'place' ? 'active' : ''}`}
          onClick={() => setActiveTab('place')}
        >
          Place Probability
        </button>
        <button
          type='button'
          className={`cal-tab ${activeTab === 'grade' ? 'active' : ''}`}
          onClick={() => setActiveTab('grade')}
        >
          By Grade
        </button>
        <button
          type='button'
          className={`cal-tab ${activeTab === 'quality' ? 'active' : ''}`}
          onClick={() => setActiveTab('quality')}
        >
          By Bet Quality
        </button>
        <button
          type='button'
          className={`cal-tab ${activeTab === 'segments' ? 'active' : ''}`}
          onClick={() => setActiveTab('segments')}
        >
          ROI Segmentation
        </button>
        <button
          type='button'
          className={`cal-tab ${activeTab === 'overfit' ? 'active' : ''}`}
          onClick={() => setActiveTab('overfit')}
        >
          Anti-Overfit
        </button>
      </div>

      {activeTab === 'overfit' && <AntiOverfitDashboard />}

      {activeTab === 'segments' && <RoiSegmentation />}

      {activeTab === 'probability' && (
        <div className='cal-probability-view'>
          <div className='cal-probability-grid'>
            {byProbability.buckets.map((bucket) => (
              <CalibrationBucket key={bucket.range} bucket={bucket} />
            ))}
          </div>
          {byProbability.buckets.length === 0 && (
            <div className='cal-empty-state'>
              No win probability buckets filled yet. Need more predictions.
            </div>
          )}
        </div>
      )}

      {activeTab === 'place' && byPlaceProbability && (
        <div className='cal-probability-view'>
          <div className='cal-probability-grid'>
            {byPlaceProbability.buckets.map((bucket) => (
              <CalibrationBucket key={bucket.range} bucket={bucket} />
            ))}
          </div>
          {byPlaceProbability.buckets.length === 0 && (
            <div className='cal-empty-state'>
              No place probability buckets filled yet. Need more predictions.
            </div>
          )}
        </div>
      )}

      {activeTab === 'grade' && (
        <div className='cal-grade-view'>
          <div className='cal-grade-list'>
            {byGrade.grades.map((grade) => (
              <GradeCalibration key={grade.grade} grade={grade} />
            ))}
          </div>
          {byGrade.grades.length === 0 && (
            <div className='cal-empty-state'>
              No grade data yet. Need more predictions.
            </div>
          )}
        </div>
      )}

      {activeTab === 'quality' && (
        <div className='cal-quality-view'>
          <div className='cal-quality-list'>
            {byBetQuality.qualities.map((quality) => (
              <QualityCalibration key={quality.quality} quality={quality} />
            ))}
          </div>
          {byBetQuality.qualities.length === 0 && (
            <div className='cal-empty-state'>
              No bet quality data yet. Need more predictions.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
