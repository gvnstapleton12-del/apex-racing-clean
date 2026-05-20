export function generateConfidence(runner) {
  const or = Number(runner.official_rating || runner.or || 0)
  const rpr = Number(runner.rpr || runner.racing_post_rating || 0)
  const weight = Number(runner.weight_lbs || runner.weight || 0)
  const odds = Number(runner.odds || runner.price || 0)
  const draw = Number(runner.draw || 0)
  const age = Number(runner.age || 0)

  const trainer = String(
    runner.trainer || ''
  ).toLowerCase()

  const pace = String(
    runner.run_style || runner.pace || ''
  ).toLowerCase()

  const fieldSize = Number(
    runner.number_of_runners ||
    runner.runners ||
    0
  )

  const lastPos = Number(
    runner.last_run_position || 0
  )

  /*
    DATA COMPLETENESS
  */

  let completeness = 0

  if (odds > 0) completeness += 25
  if (rpr > 0) completeness += 25
  if (or > 0) completeness += 25
  if (lastPos > 0) completeness += 15
  if (pace.length > 0) completeness += 10

  completeness = Math.min(100, completeness)

  /*
    CATEGORY SCORING
  */

  let speedScore = 0
  let marketScore = 0
  let paceScore = 0
  let trainerScore = 0
  let profileScore = 0

  const rprGap = rpr - or

  /*
    SPEED / CLASS
  */

  if (rprGap >= 15) {
    speedScore += 20
  } else if (rprGap >= 10) {
    speedScore += 15
  } else if (rprGap >= 5) {
    speedScore += 10
  } else if (rprGap < 0) {
    speedScore -= 10
  }

  if (lastPos === 1) {
    speedScore += 8
  }

  /*
    MARKET CONFIRMATION
  */

  if (odds > 0 && odds <= 3) {
    marketScore += 8
  } else if (odds <= 6) {
    marketScore += 5
  } else if (odds >= 20) {
    marketScore -= 10
  }

  /*
    PACE PROFILE
  */

  if (
    pace.includes('leader') ||
    pace.includes('front')
  ) {
    paceScore += 10

    if (fieldSize <= 8) {
      paceScore += 5
    }
  }

  if (pace.includes('prominent')) {
    paceScore += 5
  }

  if (pace.includes('hold')) {
    paceScore -= 4
  }

  /*
    TRAINER SIGNALS
  */

  if (trainer.includes('skelton')) {
    trainerScore += 8
  }

  if (trainer.includes('olly murphy')) {
    trainerScore += 6
  }

  if (trainer.includes('james owen')) {
    trainerScore += 5
  }

  /*
    HORSE PROFILE
  */

  if (age >= 4 && age <= 7) {
    profileScore += 5
  }

  if (weight >= 168) {
    profileScore -= 5
  }

  if (draw > 0 && draw <= 3) {
    profileScore += 3
  }

  /*
    WEIGHTED TOTAL
  */

  let confidence =
    50 +
    speedScore * 0.4 +
    marketScore * 0.25 +
    paceScore * 0.15 +
    trainerScore * 0.1 +
    profileScore * 0.1

  /*
    SCALE BY DATA QUALITY
  */

  confidence *= completeness / 100

  /*
    RESTORE BASELINE
    Prevent low-data horses from collapsing too hard
  */

  confidence += 20

  /*
    VALUE EDGE
  */

  let impliedProbability = 0
  let aiProbability = 0
  let valueEdge = 0

  if (odds > 1) {
    impliedProbability = 1 / odds
  }

  aiProbability = confidence / 100

  valueEdge =
    Number(
      (
        (aiProbability - impliedProbability) *
        100
      ).toFixed(2)
    )

  /*
    LIMITS
  */

  confidence = Math.round(
    Math.max(1, Math.min(99, confidence))
  )

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
    estimatedWinProbability: Number(
      (aiProbability * 100).toFixed(1)
    ),
    impliedProbability: Number(
      (impliedProbability * 100).toFixed(1)
    ),
    valueEdge,
    completeness,
    breakdown: {
      or,
      rpr,
      rprGap,
      odds,
      weight,
      draw,
      speedScore,
      marketScore,
      paceScore,
      trainerScore,
      profileScore,
    },
  }
}
