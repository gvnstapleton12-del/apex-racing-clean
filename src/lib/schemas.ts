import { z } from 'zod'

const ReplayTriggerSchema = z.object({
  key: z.string(),
  short: z.string().optional(),
  label: z.string(),
  severity: z.string().optional(),
})

const ReplayFlagSchema = z.object({
  key: z.string(),
  label: z.string(),
  severity: z.string().optional(),
})

const AiProfileSchema = z.object({
  confidence: z.coerce.number().optional(),
  grade: z.string().optional(),
})

const HorseQualitySchema = z.object({
  label: z.string().optional(),
  power: z.coerce.number().optional(),
  suitability: z.coerce.number().optional(),
  consistency: z.coerce.number().optional(),
  paceCompat: z.coerce.number().optional(),
  volatility: z.coerce.number().optional(),
  finalScore: z.coerce.number().optional(),
})

const ComponentScoresSchema = z.object({
  finalScore: z.coerce.number().optional(),
  ability: z.coerce.number().optional(),
  form: z.coerce.number().optional(),
  suitability: z.coerce.number().optional(),
  pace: z.coerce.number().optional(),
  replay: z.coerce.number().optional(),
  trainerJockey: z.coerce.number().optional(),
  weightEffect: z.coerce.number().optional(),
  conditionMatch: z.coerce.number().optional(),
})

const SelectionQualitySchema = z.object({
  grade: z.string().optional(),
  recommendation: z.string().optional(),
  fairOdds: z.union([z.string(), z.number()]).optional(),
  marketOdds: z.union([z.string(), z.number()]).optional(),
  edge: z.coerce.number().optional(),
  value: z.coerce.number().optional(),
})

const ValueEngineSchema = z.object({
  edgeLabel: z.string().optional(),
  valueGrade: z.string().optional(),
  edge: z.coerce.number().optional(),
  expectedValue: z.coerce.number().optional(),
  roi: z.coerce.number().optional(),
  bettable: z.boolean().optional(),
})

const BankrollEngineSchema = z.object({
  label: z.string().optional(),
  stake: z.coerce.number().optional(),
  units: z.coerce.number().optional(),
  adjustedKelly: z.coerce.number().optional(),
  reason: z.string().optional(),
})

const BetFilterSchema = z.object({
  verdict: z.string().optional(),
})

const PaceMapSchema = z.object({
  projectedTempo: z.string().optional(),
  collapseRisk: z.string().optional(),
})

const RunnerSchema = z.object({
  horse: z.string().optional(),
  horse_id: z.string().optional(),
  name: z.string().optional(),
  jockey: z.string().optional(),
  trainer: z.string().optional(),
  odds: z.union([z.string(), z.number()]).optional(),
  draw: z.coerce.number().optional(),
  or: z.coerce.number().catch(undefined).optional(),
  ofr: z.coerce.number().optional(),
  rpr: z.coerce.number().optional(),
  age: z.coerce.number().optional(),
  lbs: z.union([z.string(), z.number()]).optional(),
  last_run: z.coerce.number().optional(),
  bha_trend: z.coerce.number().optional(),
  sex: z.string().optional(),
  colour: z.string().optional(),
  position: z.coerce.number().catch(undefined).optional(),
  pos: z.coerce.number().optional(),
  finish_distance: z.string().optional(),
  spOdds: z.string().optional(),
  sp: z.string().optional(),
  score: z.coerce.number().optional(),
  finalScore: z.coerce.number().optional(),
  aiProfile: AiProfileSchema.optional(),
  winProb: z.coerce.number().optional(),
  placeProb: z.coerce.number().optional(),
  probBand: z.string().optional(),
  probRange: z.string().optional(),
  runningStyle: z.string().optional(),
  earlyPaceScore: z.coerce.number().optional(),
  paceScore: z.coerce.number().optional(),
  energy: z.object({
    earlyEnergy: z.coerce.number().optional(),
    lateEnergy: z.coerce.number().optional(),
    midEnergy: z.coerce.number().optional(),
    energyAdj: z.coerce.number().optional(),
  }).optional(),
  trackProfile: z.object({
    trackBiasFactor: z.coerce.number().optional(),
    drawBias: z.any().optional(),
    isAllWeather: z.boolean().optional(),
    trackAdj: z.coerce.number().optional(),
  }).optional(),
  awTransfer: z.object({
    hasAWForm: z.boolean().optional(),
    adjustment: z.coerce.number().optional(),
    label: z.string().optional(),
    awRuns: z.coerce.number().optional(),
    awWins: z.coerce.number().optional(),
    awPlaces: z.coerce.number().optional(),
    awWinRate: z.coerce.number().optional(),
    awPlaceRate: z.coerce.number().optional(),
    turfRuns: z.coerce.number().optional(),
    turfWins: z.coerce.number().optional(),
    primarySurface: z.string().optional(),
    primaryAWCourse: z.string().optional(),
    courseMultiplier: z.coerce.number().optional(),
    goingCompatible: z.boolean().optional(),
    goingNote: z.string().optional(),
    trackNote: z.string().optional(),
    layoutNote: z.string().optional(),
    distanceNote: z.string().optional(),
    isAWSpecialist: z.boolean().optional(),
    specialistScore: z.coerce.number().optional(),
    specialistNote: z.string().optional(),
    bestAW: z.coerce.number().optional(),
    bestTurf: z.coerce.number().optional(),
    ratingGap: z.coerce.number().optional(),
    surfaceSwitch: z.boolean().optional(),
    provenBothSurfaces: z.boolean().optional(),
    totalRuns: z.coerce.number().optional(),
  }).optional(),
  classModel: z.object({
    raceClass: z.string().optional(),
    orFit: z.string().optional(),
    orFitScore: z.coerce.number().optional(),
    weightFit: z.string().optional(),
    classAdj: z.coerce.number().optional(),
    orProfile: z.string().optional(),
    orProfileAdj: z.coerce.number().optional(),
    rprORGap: z.coerce.number().optional(),
    rprORLabel: z.string().optional(),
    rprORAdj: z.coerce.number().optional(),
    rprORSource: z.string().optional(),
  }).optional(),
  horseQuality: HorseQualitySchema.optional(),
  components: ComponentScoresSchema.optional(),
  placeTraits: z.object({
    consistency: z.coerce.number().optional(),
    reliability: z.coerce.number().optional(),
    honesty: z.coerce.number().optional(),
    finishingKick: z.coerce.number().optional(),
    explosiveAbility: z.coerce.number().optional(),
    marketConfidence: z.coerce.number().optional(),
  }).optional(),
  selectionQuality: SelectionQualitySchema.optional(),
  simulation: z.object({
    winRate: z.coerce.number().optional(),
    placeRate: z.coerce.number().optional(),
    avgPosition: z.coerce.number().optional(),
    collapseRate: z.coerce.number().optional(),
    raceShape: z.string().optional(),
  }).optional(),
  valueEngine: ValueEngineSchema.optional(),
  bankrollEngine: BankrollEngineSchema.optional(),
  confidenceTier: z.object({
    tier: z.string().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    maxStake: z.coerce.number().optional(),
  }).optional(),
  scenarioFlags: z.object({
    flags: z.array(z.object({
      flag: z.string(),
      description: z.string().optional(),
      action: z.string().optional(),
      severity: z.string().optional(),
    })).optional(),
  }).optional(),
  explanation: z.object({
    whyCount: z.number().optional(),
    riskCount: z.number().optional(),
    why: z.array(z.object({ icon: z.string(), label: z.string() })).optional(),
    risks: z.array(z.object({ icon: z.string(), label: z.string() })).optional(),
  }).optional(),
  interactions: z.object({
    interactions: z.array(z.object({
      label: z.string(),
      adjustment: z.coerce.number(),
      direction: z.string(),
    })).optional(),
    totalAdjustment: z.coerce.number().optional(),
  }).optional(),
  replayTriggers: z.array(ReplayTriggerSchema).optional(),
  replayFlags: z.array(ReplayFlagSchema).optional(),
  betQuality: z.string().optional(),
  form: z.string().optional(),
  atrUrl: z.string().optional(),
  atrFormUrl: z.string().optional(),
  previous_results: z.array(z.object({
    position: z.number().optional(),
    runner_count: z.number().optional(),
    bha: z.number().optional(),
    weight: z.string().optional(),
    distance: z.string().optional(),
    going_shortcode: z.string().optional(),
    race_class: z.string().optional(),
  })).optional(),
  performanceRating: z.object({
    pr: z.coerce.number().optional(),
    gap: z.coerce.number().optional(),
    source: z.string().optional(),
  }).optional(),
})

const RaceSchema = z.object({
  race_id: z.string().optional(),
  race_name: z.string().optional(),
  course: z.string().optional(),
  off_time: z.string().optional(),
  off_dt: z.string().optional(),
  date: z.string().optional(),
  region: z.string().optional(),
  distance_f: z.string().optional(),
  going: z.string().optional(),
  surface: z.string().optional(),
  race_class: z.coerce.number().optional(),
  type: z.string().optional(),
  pattern: z.string().optional(),
  age_band: z.string().optional(),
  field_size: z.coerce.number().optional(),
  paceMap: PaceMapSchema.optional(),
  raceShape: z.object({
    shape: z.string().optional(),
    tempo: z.string().optional(),
    leaders: z.coerce.number().optional(),
    pressers: z.coerce.number().optional(),
    midfield: z.coerce.number().optional(),
    closers: z.coerce.number().optional(),
    pressureLabel: z.string().optional(),
    collapseProb: z.coerce.number().optional(),
    beneficiaries: z.array(z.object({
      horse: z.string().optional(),
      horse_id: z.string().optional(),
      earlyPaceScore: z.coerce.number().optional(),
      reason: z.string().optional(),
    })).optional(),
    disadvantaged: z.array(z.object({
      horse: z.string().optional(),
      horse_id: z.string().optional(),
      earlyPaceScore: z.coerce.number().optional(),
      reason: z.string().optional(),
    })).optional(),
  }).optional(),
  betFilter: BetFilterSchema.optional(),
  runners: z.array(RunnerSchema).optional(),
})

export const RacecardsSchema = z.array(RaceSchema)
export const RaceSchemaExport = RaceSchema
export const RunnerSchemaExport = RunnerSchema

export function validateRacecards(data: unknown) {
  return RacecardsSchema.safeParse(data)
}

export function validateRace(data: unknown) {
  return RaceSchema.safeParse(data)
}

export function validateRunner(data: unknown) {
  return RunnerSchema.safeParse(data)
}
