// APEX v4 — Engine 4: Value Engine
// Where is the edge?
// Formula: Value = ModelProbability - MarketProbability

function computeEdge(modelProb, marketOdds) {
  if (!marketOdds || marketOdds <= 1 || !modelProb) {
    return { edge: 0, label: 'No Data', bettable: false }
  }

  const marketProb = (1 / marketOdds) * 100
  const edge = modelProb - marketProb

  // Value gate: confidence floor (P >= 10%) + 25% margin over implied probability
  const implied = (1 / marketOdds) * 100
  const marginPct = implied > 0 ? ((modelProb - implied) / implied) * 100 : 0
  const passesGate = modelProb >= 10 && marginPct > 25

  let label = 'No Value'
  let bettable = false

  if (edge >= 10 && passesGate) { label = 'Huge Value'; bettable = true }
  else if (edge >= 5 && passesGate) { label = 'Strong Value'; bettable = true }
  else if (edge >= 2 && passesGate) { label = 'Value'; bettable = true }
  else if (edge >= 0) { label = 'Marginal Value'; bettable = false }
  else if (edge >= -3) { label = 'Slight Overbet' }
  else if (edge >= -7) { label = 'Overbet' }
  else { label = 'Heavy Overbet' }

  return {
    edge: Math.round(edge * 10) / 10,
    marketProb: Math.round(marketProb * 10) / 10,
    marginPct: Math.round(marginPct * 10) / 10,
    label,
    bettable,
  }
}

function computeExpectedValue(modelProb, marketOdds, stake = 1) {
  if (!marketOdds || marketOdds <= 1 || !modelProb) return { ev: 0, roi: 0 }

  const p = modelProb / 100
  const q = 1 - p
  const b = marketOdds - 1

  const ev = p * b - q
  const roi = ev * 100

  return {
    ev: Math.round(ev * 1000) / 1000,
    roi: Math.round(roi * 10) / 10,
    expectedReturn: Math.round((ev * stake) * 100) / 100,
  }
}

function computeValueGrade(edge, modelProb) {
  if (edge >= 15 && modelProb >= 20) return 'A+'
  if (edge >= 10 && modelProb >= 15) return 'A'
  if (edge >= 7 && modelProb >= 12) return 'B+'
  if (edge >= 5 && modelProb >= 10) return 'B'
  if (edge >= 3 && modelProb >= 8) return 'C+'
  if (edge >= 2 && modelProb >= 6) return 'C'
  if (edge >= 0) return 'D'
  return 'F'
}

export function computeValue(runners, race) {
  const results = runners.map((runner) => {
    const modelProb = runner.modelProb || runner.winProb || 0
    const marketOdds = Number(runner.odds || runner.price || 0)

    const edge = computeEdge(modelProb, marketOdds)
    const ev = computeExpectedValue(modelProb, marketOdds)
    const grade = computeValueGrade(edge.edge, modelProb)

    return {
      horse: runner.horse,
      horse_id: runner.horse_id || runner.horse,
      modelProb: Math.round(modelProb * 10) / 10,
      marketOdds,
      marketProb: edge.marketProb || 0,
      edge: edge.edge,
      edgeLabel: edge.label,
      bettable: edge.bettable,
      expectedValue: ev.ev,
      roi: ev.roi,
      valueGrade: grade,
    }
  })

  results.sort((a, b) => b.edge - a.edge)

  const bettableCount = results.filter((r) => r.bettable).length
  const avgEdge = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.edge, 0) / results.length * 10) / 10 : 0
  const bestEdge = results.length > 0 ? results[0].edge : 0
  const worstEdge = results.length > 0 ? results[results.length - 1].edge : 0

  return {
    runners: results,
    summary: {
      bettableCount,
      avgEdge,
      bestEdge,
      worstEdge,
      valueOpportunities: bettableCount > 0 ? 'Found' : 'None',
    },
  }
}
