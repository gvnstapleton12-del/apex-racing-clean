function bayesianPrior(runners) {
  const hasOdds = runners.some((r) => Number(r.odds || r.price || 0) > 0)
  if (hasOdds) {
    const probs = runners.map((r) => {
      const odds = Number(r.odds || r.price || 0)
      return odds > 1 ? 1 / odds : 1 / runners.length
    })
    const total = probs.reduce((a, b) => a + b, 0)
    return probs.map((p) => p / total)
  }

  const n = runners.length
  const scores = runners.map((r) => r.power?.total || 50)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  const stdScore = Math.sqrt(scores.reduce((s, p) => s + (p - avgScore) ** 2, 0) / scores.length) || 1

  const raw = scores.map((s) => {
    const z = (s - avgScore) / stdScore
    return Math.exp(z * 0.4)
  })
  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((r) => r / total)
}

function powerLikelihood(powerScore, allPowers) {
  const avg = allPowers.reduce((a, b) => a + b, 0) / allPowers.length
  const std = Math.sqrt(allPowers.reduce((s, p) => s + (p - avg) ** 2, 0) / allPowers.length) || 1
  const z = (powerScore - avg) / std
  return Math.exp(z * 0.3)
}

function paceLikelihood(paceScore) {
  return Math.exp(paceScore * 0.05)
}

function humanLikelihood(humanScore) {
  return Math.exp(humanScore * 0.03)
}

function marketLikelihood(marketScore) {
  return Math.exp(marketScore * 0.03)
}

function trainerLikelihood(trainerScore) {
  return Math.exp(trainerScore * 0.02)
}

export function bayesianProbabilities(runners) {
  const priors = bayesianPrior(runners)
  const powers = runners.map((r) => r.power?.total || 50)
  const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length

  const posteriors = runners.map((r, i) => {
    const prior = priors[i]
    const powerLR = powerLikelihood(r.power?.total || avgPower, powers)
    const paceLR = paceLikelihood(r.pace?.score || 0)
    const humanLR = humanLikelihood(r.human?.score || 0)
    const marketLR = marketLikelihood(r.market?.score || 0)
    const trainerLR = trainerLikelihood(r.trainerScore || 0)

    return prior * powerLR * paceLR * humanLR * marketLR * trainerLR
  })

  const total = posteriors.reduce((a, b) => a + b, 0)
  return posteriors.map((p) => (total > 0 ? (p / total) * 100 : 0))
}

export function bayesianUpdate(prior, likelihoods) {
  const posterior = likelihoods.reduce((acc, lr) => acc * lr, prior)
  return posterior
}
