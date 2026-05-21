// APEX v4 — CLV Tracker
// Closing Line Value — the most important metric
// If picks consistently beat closing odds, model is good

export function computeCLV(predictedOdds, closingOdds) {
  if (!predictedOdds || predictedOdds <= 1 || !closingOdds || closingOdds <= 1) {
    return { clv: 0, label: 'No Data', value: 0 }
  }

  const predictedProb = 1 / predictedOdds
  const closingProb = 1 / closingOdds

  const clv = ((predictedProb - closingProb) / closingProb) * 100

  let label = 'Neutral'
  if (clv >= 15) label = 'Excellent'
  else if (clv >= 8) label = 'Strong'
  else if (clv >= 3) label = 'Positive'
  else if (clv >= 0) label = 'Marginal'
  else if (clv >= -5) label = 'Negative'
  else label = 'Poor'

  return {
    clv: Math.round(clv * 10) / 10,
    predictedOdds,
    closingOdds,
    label,
    value: clv > 0 ? 'Beating market' : 'Behind market',
  }
}

export function trackCLV(records = []) {
  if (!records.length) {
    return {
      totalTracked: 0,
      avgCLV: 0,
      positiveCLV: 0,
      negativeCLV: 0,
      excellent: 0,
      strong: 0,
      positive: 0,
      marginal: 0,
      negative: 0,
      poor: 0,
      trend: 'No Data',
      records: [],
    }
  }

  const clvRecords = records.filter((r) => r.predictedOdds && r.closingOdds)
  if (!clvRecords.length) {
    return {
      totalTracked: records.length,
      avgCLV: 0,
      positiveCLV: 0,
      negativeCLV: 0,
      excellent: 0,
      strong: 0,
      positive: 0,
      marginal: 0,
      negative: 0,
      poor: 0,
      trend: 'No CLV Data',
      records: [],
    }
  }

  const clvValues = clvRecords.map((r) => computeCLV(r.predictedOdds, r.closingOdds))
  const avgCLV = clvValues.reduce((s, c) => s + c.clv, 0) / clvValues.length

  const positiveCLV = clvValues.filter((c) => c.clv > 0).length
  const negativeCLV = clvValues.filter((c) => c.clv < 0).length

  const excellent = clvValues.filter((c) => c.label === 'Excellent').length
  const strong = clvValues.filter((c) => c.label === 'Strong').length
  const positive = clvValues.filter((c) => c.label === 'Positive').length
  const marginal = clvValues.filter((c) => c.label === 'Marginal').length
  const negative = clvValues.filter((c) => c.label === 'Negative').length
  const poor = clvValues.filter((c) => c.label === 'Poor').length

  let trend = 'Neutral'
  if (avgCLV >= 10) trend = 'Excellent — Model beating market consistently'
  else if (avgCLV >= 5) trend = 'Strong — Model beating market'
  else if (avgCLV >= 2) trend = 'Positive — Slight edge'
  else if (avgCLV >= 0) trend = 'Marginal — Roughly even'
  else if (avgCLV >= -3) trend = 'Negative — Slightly behind'
  else trend = 'Poor — Model behind market'

  return {
    totalTracked: clvRecords.length,
    avgCLV: Math.round(avgCLV * 10) / 10,
    positiveCLV,
    negativeCLV,
    excellent,
    strong,
    positive,
    marginal,
    negative,
    poor,
    trend,
    records: clvValues,
  }
}
