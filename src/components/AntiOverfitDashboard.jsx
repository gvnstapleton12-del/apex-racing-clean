import { useState, useEffect } from 'react'

export default function AntiOverfitDashboard() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = () => {
      fetch('/api/anti-overfit')
        .then((r) => r.json())
        .then((data) => {
          setReport(data)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
    fetchData()
    const interval = setInterval(fetchData, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return <div className='aof-loading'>Loading protection report...</div>
  }

  if (!report) {
    return (
      <div className='aof-empty'>
        <h2>Anti-Overfit Protection</h2>
        <p>No data available yet.</p>
      </div>
    )
  }

  const rules = report.protectionRules || {}

  return (
    <div className='anti-overfit-dashboard'>
      <div className='aof-header'>
        <h2>Anti-Overfit Protection</h2>
        <p className='aof-subtitle'>Horse racing is noisy. These rules prevent the model from chasing randomness.</p>
      </div>

      <div className='aof-status-grid'>
        <div className={`aof-status-card ${report.canAdjust ? 'approved' : 'blocked'}`}>
          <span className='aof-status-icon'>{report.canAdjust ? '✓' : '⏸'}</span>
          <span className='aof-status-label'>Weight Adjustment</span>
          <span className='aof-status-value'>{report.canAdjust ? 'ACTIVE' : 'LOCKED'}</span>
        </div>

        <div className='aof-status-card'>
          <span className='aof-status-icon'>{report.sampleSize >= rules.minSamples ? '✓' : '!'}</span>
          <span className='aof-status-label'>Sample Size</span>
          <span className='aof-status-value'>{report.sampleSize} / {rules.minSamples}</span>
        </div>

        <div className='aof-status-card'>
          <span className='aof-status-icon'>{report.stability.stable ? '✓' : '!'}</span>
          <span className='aof-status-label'>Model Stability</span>
          <span className='aof-status-value'>{report.stability.stable ? 'STABLE' : 'UNSTABLE'}</span>
        </div>

        <div className='aof-status-card'>
          <span className='aof-status-icon'>{report.outliers.suppressed > 0 ? '!' : '✓'}</span>
          <span className='aof-status-label'>Outliers Suppressed</span>
          <span className='aof-status-value'>{report.outliers.suppressed}</span>
        </div>
      </div>

      <div className='aof-section'>
        <h3>Protection Rules</h3>
        <div className='aof-rules-grid'>
          <div className='aof-rule'>
            <span className='aof-rule-label'>Min Samples</span>
            <span className='aof-rule-value'>{rules.minSamples}</span>
            <span className='aof-rule-desc'>No weight changes below this threshold</span>
          </div>
          <div className='aof-rule'>
            <span className='aof-rule-label'>Max Learning Rate</span>
            <span className='aof-rule-value'>{rules.maxLearningRate}</span>
            <span className='aof-rule-desc'>Capped to prevent wild swings</span>
          </div>
          <div className='aof-rule'>
            <span className='aof-rule-label'>Decay Factor</span>
            <span className='aof-rule-value'>{rules.decayFactor}</span>
            <span className='aof-rule-desc'>Old data loses influence monthly</span>
          </div>
          <div className='aof-rule'>
            <span className='aof-rule-label'>Outlier Z-Threshold</span>
            <span className='aof-rule-value'>{rules.outlierZThreshold}</span>
            <span className='aof-rule-desc'>Results beyond this are suppressed</span>
          </div>
          <div className='aof-rule'>
            <span className='aof-rule-label'>Max Single Adjustment</span>
            <span className='aof-rule-value'>{rules.maxSingleAdjustment}</span>
            <span className='aof-rule-desc'>No weight can jump more than this</span>
          </div>
          <div className='aof-rule'>
            <span className='aof-rule-label'>Rolling Window</span>
            <span className='aof-rule-value'>{rules.rollingWindowSize}</span>
            <span className='aof-rule-desc'>Recent records for stats calculation</span>
          </div>
        </div>
      </div>

      <div className='aof-section'>
        <h3>Rolling Statistics (Last {rules.rollingWindowSize} Records)</h3>
        <div className='aof-rolling-grid'>
          <div className='aof-rolling-stat'>
            <span className='aof-rolling-label'>Mean ROI</span>
            <span className={`aof-rolling-value ${report.rollingStats.mean >= 0 ? 'positive' : 'negative'}`}>
              {report.rollingStats.mean >= 0 ? '+' : ''}{report.rollingStats.mean}
            </span>
          </div>
          <div className='aof-rolling-stat'>
            <span className='aof-rolling-label'>Std Dev</span>
            <span className='aof-rolling-value'>{report.rollingStats.std}</span>
          </div>
          <div className='aof-rolling-stat'>
            <span className='aof-rolling-label'>Best Result</span>
            <span className='aof-rolling-value positive'>+{report.rollingStats.max}</span>
          </div>
          <div className='aof-rolling-stat'>
            <span className='aof-rolling-label'>Worst Result</span>
            <span className='aof-rolling-value negative'>{report.rollingStats.min}</span>
          </div>
          <div className='aof-rolling-stat'>
            <span className='aof-rolling-label'>Records</span>
            <span className='aof-rolling-value'>{report.rollingStats.count}</span>
          </div>
        </div>
      </div>

      <div className='aof-section'>
        <h3>Stability Check</h3>
        <div className={`aof-stability-card ${report.stability.stable ? 'stable' : 'unstable'}`}>
          <span className='aof-stability-status'>{report.stability.stable ? 'STABLE' : 'UNSTABLE'}</span>
          <span className='aof-stability-reason'>{report.stability.reason}</span>
          <span className='aof-stability-variance'>Variance: {report.stability.variance}</span>
          <span className='aof-stability-mean'>Mean ROI: {report.stability.meanRoi}</span>
        </div>
      </div>

      {report.outliers.outliers && report.outliers.outliers.length > 0 && (
        <div className='aof-section'>
          <h3>Suppressed Outliers ({report.outliers.suppressed})</h3>
          <div className='aof-outlier-list'>
            {report.outliers.outliers.slice(0, 10).map((o, i) => (
              <div key={i} className='aof-outlier-row'>
                <span className='aof-outlier-horse'>{o.horse}</span>
                <span className='aof-outlier-race'>{o.race}</span>
                <span className='aof-outlier-value'>{o.value > 0 ? '+' : ''}{o.value}</span>
                <span className='aof-outlier-z'>Z: {o.zScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className='aof-section'>
        <h3>Weight Comparison</h3>
        <div className='aof-weights-grid'>
          {Object.entries(report.currentWeights).map(([key, current]) => {
            const decayed = report.decayedWeights[key] || current
            const diff = Math.round((decayed - current) * 1000) / 1000
            return (
              <div key={key} className='aof-weight-row'>
                <span className='aof-weight-name'>{key}</span>
                <span className='aof-weight-current'>{current}</span>
                <span className='aof-weight-arrow'>→</span>
                <span className={`aof-weight-decayed ${diff >= 0 ? 'positive' : 'negative'}`}>{decayed}</span>
                <span className='aof-weight-diff'>{diff >= 0 ? '+' : ''}{diff}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
