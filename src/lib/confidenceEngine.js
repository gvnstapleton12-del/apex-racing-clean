export function generateConfidence(runner) {
  let confidence = 50

  const or =
    Number(
      runner.official_rating ||
      runner.or ||
      0
    )

  const rpr =
    Number(
      runner.rpr ||
      runner.racing_post_rating ||
      0
    )

  const weight =
    Number(
      runner.weight_lbs ||
      runner.weight ||
      0
    )

  const odds =
    Number(
      runner.odds ||
      runner.price ||
      0
    )

  const draw =
    Number(runner.draw || 0)

  const age =
    Number(runner.age || 0)

  const rprGap = rpr - or

  /*
    OR / RPR GAP
  */

  if (rprGap >= 15) {
    confidence += 20
  } else if (rprGap >= 10) {
    confidence += 15
  } else if (rprGap >= 5) {
    confidence += 10
  } else if (rprGap < 0) {
    confidence -= 10
  }

  /*
    ODDS CONFIRMATION
  */

  if (odds > 0 && odds <= 3) {
    confidence += 8
  } else if (odds <= 6) {
    confidence += 5
  } else if (odds >= 20) {
    confidence -= 10
  }

  /*
    AGE PROFILE
  */

  if (age >= 4 && age <= 7) {
    confidence += 5
  }

  /*
    WEIGHT FILTER
  */

  if (weight >= 168) {
    confidence -= 5
  }

  /*
    DRAW BIAS
  */

  if (draw > 0 && draw <= 3) {
    confidence += 3
  }

  /*
    TRAINER SIGNALS
  */

  const trainer = String(
    runner.trainer || ''
  ).toLowerCase()

  if (
    trainer.includes('skelton')
  ) {
    confidence += 8
  }

  if (
    trainer.includes('olly murphy')
  ) {
    confidence += 6
  }

  if (
    trainer.includes('james owen')
  ) {
    confidence += 5
  }
/*
  PACE PROFILE
*/

const pace =
  String(
    runner.run_style ||
    runner.pace ||
    ''
  ).toLowerCase()

const fieldSize =
  Number(
    runner.number_of_runners ||
    runner.runners ||
    0
  )

if (
  pace.includes('leader') ||
  pace.includes('front')
) {
  confidence += 10

  /*
    Lone leader edge
  */

  if (fieldSize <= 8) {
    confidence += 5
  }
}

if (
  pace.includes('prominent')
) {
  confidence += 5
}

if (
  pace.includes('hold')
) {
  confidence -= 4
}
  /*
    LAST TIME OUT
  */

  const lastPos =
    Number(
      runner.last_run_position ||
      0
    )

  if (lastPos === 1) {
    confidence += 8
  }

  /*
    LIMITS
  */

  confidence = Math.max(
    1,
    Math.min(99, confidence)
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
    breakdown: {
      or,
      rpr,
      rprGap,
      odds,
      weight,
      draw,
    },
  }
}