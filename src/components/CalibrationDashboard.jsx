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
