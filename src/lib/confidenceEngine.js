export function generateConfidence(runner, options = {}) {
  const {
    baseline = 18,
    capClass = 22,
    capFormMarket = 32,
    capPace = 8,
    capTrainerJockey = 7,
    capProfile = 4,
    multiplier = {},
  } = options

  const classMult = multiplier.class || 1
  const formMult = multiplier.form || 1
  const marketMult = multiplier.market || 1
  const paceMult = multiplier.pace || 1
  const trainerMult = multiplier.trainer || 1
  const profileMult = multiplier.profile || 1
  const or = Number(
    runner.official_rating ||
    runner.or ||
    runner.officialRating ||
    runner.ratings?.official ||
    0
  )
  const rpr = Number(
    runner.rpr ||
    runner.racing_post_rating ||
    runner.racingPostRating ||
    runner.ratings?.rpr ||
    runner.postmark ||
    0
  )

  let estimatedOR = or
  let estimatedRPR = rpr

  if (!estimatedOR && estimatedRPR) {
    estimatedOR = Math.max(0, estimatedRPR - 3)
  }

  if (!estimatedRPR && estimatedOR) {
    estimatedRPR = estimatedOR + 5
  }

  const weight = Number(runner.weight_lbs || runner.weight || 0)
  const odds = Number(runner.odds || runner.price || 0)
  const draw = Number(runner.draw || 0)
  const age = Number(runner.age || 0)

  const trainer = String(runner.trainer || '').toLowerCase()
  const jockey = String(runner.jockey || '').toLowerCase()

  const pace = String(runner.run_style || runner.pace || '').toLowerCase()
  const fieldSize = Number(runner.number_of_runners || runner.runners || 0)
  const lastPos = Number(runner.last_run_position || 0)

  const formString = String(runner.form || '')
    .replace(/[^0-9-\/]/g, '')
    .split(/[-\/]/)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0)

  let completeness = 0
  if (odds > 0) completeness += 20
  if (estimatedRPR > 0) completeness += 20
  if (estimatedOR > 0) completeness += 15
  if (lastPos > 0) completeness += 15
  if (formString.length >= 2) completeness += 15
  if (pace) completeness += 10
  if (trainer) completeness += 5
  completeness = Math.min(100, completeness)

  const bestRating = Math.max(estimatedOR, estimatedRPR)
  let classScore = 0

  if (bestRating >= 150) classScore += 22
  else if (bestRating >= 140) classScore += 19
  else if (bestRating >= 130) classScore += 16
  else if (bestRating >= 120) classScore += 13
  else if (bestRating >= 110) classScore += 10
  else if (bestRating >= 100) classScore += 7
  else if (bestRating >= 90) classScore += 5
  else if (bestRating >= 80) classScore += 3
  else if (bestRating > 0) classScore += 1

  if (estimatedOR > 0 && estimatedRPR > 0) {
    const gap = estimatedRPR - estimatedOR
    if (gap >= 15) classScore += 6
    else if (gap >= 10) classScore += 4
    else if (gap >= 5) classScore += 2
    else if (gap <= -10) classScore -= 3
    else if (gap <= -5) classScore -= 1
  }

  let formScore = 0

  if (lastPos === 1) formScore += 18
  else if (lastPos === 2) formScore += 13
  else if (lastPos === 3) formScore += 9
  else if (lastPos === 4) formScore += 6
  else if (lastPos === 5) formScore += 4
  else if (lastPos > 0 && lastPos <= 8) formScore += 2
  else if (lastPos > 8) formScore += 1

  if (formString.length >= 3) {
    const recent = formString.slice(0, 3)
    const wins = recent.filter((p) => p === 1).length
    const top3 = recent.filter((p) => p >= 1 && p <= 3).length

    if (wins >= 1) formScore += 5
    if (top3 >= 2) formScore += 4
    if (formString.length >= 4) {
      const older = formString.slice(3, 5)
      const olderTop3 = older.filter((p) => p >= 1 && p <= 3).length
      if (olderTop3 >= 2 && top3 >= 2) formScore += 3
    }
  }

  let marketScore = 0

  if (odds > 0 && odds <= 1.5) marketScore = 20
  else if (odds <= 2.0) marketScore = 17
  else if (odds <= 3.0) marketScore = 14
  else if (odds <= 4.0) marketScore = 11
  else if (odds <= 6.0) marketScore = 8
  else if (odds <= 8.0) marketScore = 5
  else if (odds <= 12.0) marketScore = 3
  else if (odds <= 20.0) marketScore = 2
  else if (odds <= 50.0) marketScore = 1

  if (fieldSize >= 14 && odds <= 3) marketScore -= 3
  if (fieldSize <= 5) marketScore += 2

  let paceDrawScore = 0

  if (pace.includes('leader') || pace.includes('front')) {
    paceDrawScore += 6
    if (fieldSize <= 7) paceDrawScore += 3
    if (fieldSize >= 14) paceDrawScore -= 2
  } else if (pace.includes('prominent')) {
    paceDrawScore += 4
  } else if (pace.includes('midfield') || pace.includes('mid')) {
    paceDrawScore += 2
  }

  if (draw > 0 && draw <= 3) paceDrawScore += 3
  else if (draw > 0 && draw <= 5) paceDrawScore += 1
  if (draw === 0) paceDrawScore -= 1

  let trainerJockeyScore = 0

  const topTrainers = [
    'skelton', 'henderson', 'nicholls', 'pipe', 'elliott',
    'mullins', 'hobbs', 'tizzard', 'williams', 'obrien',
    'james owen', 'olly murphy', 'longsdon', 'bell', 'fisher',
  ]
  if (topTrainers.some((t) => trainer.includes(t))) {
    trainerJockeyScore += 4
  }

  const topJockeys = [
    'de boinville', 'coleman', 'townend', 'blackmore',
    'skelton', 'cobden', 'bowen', 'brennan', 'doyle',
    'quinlan', 'moore', 'powell', 'johnson', 'foster',
  ]
  if (topJockeys.some((j) => jockey.includes(j))) {
    trainerJockeyScore += 3
  }

  let profileScore = 0

  if (age >= 5 && age <= 9) profileScore += 3
  else if (age >= 4 && age <= 10) profileScore += 1

  if (weight >= 168) profileScore -= 3
  else if (weight >= 164) profileScore -= 1
  else if (weight > 0 && weight <= 154) profileScore += 2

  if (draw > 0 && draw <= 3) profileScore += 2

  let confidence =
    baseline +
    Math.min(classScore * classMult, capClass) +
    Math.min(formScore * formMult + marketScore * marketMult, capFormMarket) +
    Math.min(paceDrawScore * paceMult, capPace) +
    Math.min(trainerJockeyScore * trainerMult, capTrainerJockey) +
    Math.min(profileScore * profileMult, capProfile)

  confidence *= 0.75 + completeness / 300

  let impliedProbability = 0
  let aiProbability = 0
  let valueEdge = 0

  if (odds > 1) {
    impliedProbability = 1 / odds
  }

  aiProbability = confidence / 100

  valueEdge = Number(
    ((aiProbability - impliedProbability) * 100).toFixed(2)
  )

  confidence = Math.round(Math.max(1, Math.min(99, confidence)))

  let grade = 'C'

  if (confidence >= 90) {
    grade = 'A+'
  } else if (confidence >= 80) {
    grade = 'A'
  } else if (confidence >= 70) {
    grade = 'B'
  }

  return {
    confidence,
    grade,
    estimatedWinProbability: Number((aiProbability * 100).toFixed(1)),
    impliedProbability: Number((impliedProbability * 100).toFixed(1)),
    valueEdge,
    completeness,
    weights: { baseline, capClass, capFormMarket, capPace, capTrainerJockey, capProfile, multiplier },
    breakdown: {
      or: estimatedOR,
      rpr: estimatedRPR,
      odds,
      weight,
      draw,
      classScore,
      formScore,
      marketScore,
      paceDrawScore,
      trainerJockeyScore,
      profileScore,
    },
  }
}
