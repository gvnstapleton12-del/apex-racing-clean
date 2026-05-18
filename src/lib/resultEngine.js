export function ingestRaceResults(racecards = [], learningDatabase = {}) {
  if (!learningDatabase.records) {
    learningDatabase.records = []
  }

  const completed = []

  racecards.forEach((race) => {
    const runners = race.runners || []

    runners.forEach((runner, index) => {
      const position = index === 0 ? 1 : index + 1

      const existing = learningDatabase.records.find(
        (r) =>
          r.horse === runner.horse &&
          r.race === race.race_name
      )

      if (existing) {
        existing.position = position
        existing.resultProcessed = true
      } else {
        learningDatabase.records.push({
          horse: runner.horse,
          race: race.race_name,
          course: race.course,
          aiConfidence:
            runner.aiProfile?.confidence || 0,
          signal:
            runner.bettingSignals?.[0]?.type ||
            'NONE',
          marketMovement:
            runner.marketMovement?.movement ||
            'STABLE',
          spOdds: runner.odds || 0,
          position,
          resultProcessed: true,
          timestamp: new Date().toISOString(),
        })
      }

      if (position === 1) {
        completed.push({
          horse: runner.horse,
          race: race.race_name,
          aiConfidence:
            runner.aiProfile?.confidence || 0,
        })
      }
    })
  })

  return {
    learningDatabase,
    completed,
  }
}
