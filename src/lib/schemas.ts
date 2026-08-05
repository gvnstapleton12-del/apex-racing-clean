import { z } from 'zod'

const ReplayTriggerSchema = z.object({
  key: z.string().optional(),
  short: z.string().optional(),
  label: z.string().optional(),
  severity: z.string().optional(),
}).passthrough().nullable()

const ReplayFlagSchema = z.object({
  key: z.string().optional(),
  label: z.string().optional(),
  severity: z.string().optional(),
}).passthrough().nullable()

const AiProfileSchema = z.object({
  confidence: z.coerce.number().optional(),
  grade: z.string().optional(),
}).passthrough().nullable()

const HorseQualitySchema = z.object({
  label: z.string().optional(),
  power: z.coerce.number().optional(),
  suitability: z.coerce.number().optional(),
  consistency: z.coerce.number().optional(),
  paceCompat: z.coerce.number().optional(),
  volatility: z.coerce.number().optional(),
  finalScore: z.coerce.number().optional(),
}).passthrough().nullable()

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
}).passthrough().nullable()

const SelectionQualitySchema = z.object({
  grade: z.string().optional(),
  recommendation: z.string().optional(),
  fairOdds: z.coerce.string().optional(),
  marketOdds: z.coerce.string().optional(),
  edge: z.coerce.number().optional(),
  value: z.coerce.number().optional(),
}).passthrough().nullable()

const ValueEngineSchema = z.object({
  edgeLabel: z.string().optional(),
  valueGrade: z.string().optional(),
  edge: z.coerce.number().optional(),
  expectedValue: z.coerce.number().optional(),
  roi: z.coerce.number().optional(),
  bettable: z.boolean().optional(),
}).passthrough().nullable()

const BankrollEngineSchema = z.object({
  label: z.string().optional(),
  stake: z.coerce.number().optional(),
  units: z.coerce.number().optional(),
  adjustedKelly: z.coerce.number().optional(),
  reason: z.string().optional(),
}).passthrough().nullable()

const BetFilterSchema = z.object({
  verdict: z.string().optional(),
}).passthrough().nullable()

const PaceMapSchema = z.object({
  projectedTempo: z.string().optional(),
  collapseRisk: z.string().optional(),
  frontRunners: z.coerce.number().optional(),
  prominent: z.coerce.number().optional(),
  midfield: z.coerce.number().optional(),
  holdUp: z.coerce.number().optional(),
  pacePressure: z.string().optional(),
}).passthrough().nullable()

const RunnerSchema = z.object({
  horse: z.string().optional(),
  horse_id: z.string().optional(),
  name: z.string().optional(),
  jockey: z.string().optional(),
  trainer: z.string().optional(),
  odds: z.coerce.string().optional(),
  draw: z.coerce.number().optional(),
  or: z.coerce.number().catch(undefined).optional(),
  ofr: z.coerce.number().optional(),
  rpr: z.coerce.number().optional(),
  age: z.coerce.number().optional(),
  lbs: z.coerce.string().optional(),
  last_run: z.coerce.number().optional(),
  bha_trend: z.coerce.number().optional(),
  sex: z.string().optional(),
  colour: z.string().optional(),
  position: z.coerce.number().catch(undefined).optional(),
  pos: z.coerce.number().optional(),
  finish_distance: z.string().optional(),
  spOdds: z.coerce.string().optional(),
  sp: z.coerce.string().optional(),
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
  }).passthrough().nullable().optional(),
  trackProfile: z.object({
    trackBiasFactor: z.coerce.number().optional(),
    drawBias: z.any().optional(),
    isAllWeather: z.boolean().optional(),
    trackAdj: z.coerce.number().optional(),
  }).passthrough().nullable().optional(),
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
  }).passthrough().nullable().optional(),
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
  }).passthrough().nullable().optional(),
  horseQuality: HorseQualitySchema.optional(),
  components: ComponentScoresSchema.optional(),
  placeTraits: z.object({
    consistency: z.coerce.number().optional(),
    reliability: z.coerce.number().optional(),
    honesty: z.coerce.number().optional(),
    finishingKick: z.coerce.number().optional(),
    explosiveAbility: z.coerce.number().optional(),
    marketConfidence: z.coerce.number().optional(),
  }).passthrough().nullable().optional(),
  selectionQuality: SelectionQualitySchema.optional(),
  simulation: z.object({
    winRate: z.coerce.number().optional(),
    placeRate: z.coerce.number().optional(),
    avgPosition: z.coerce.number().optional(),
    collapseRate: z.coerce.number().optional(),
    raceShape: z.string().optional(),
  }).passthrough().nullable().optional(),
  valueEngine: ValueEngineSchema.optional(),
  bankrollEngine: BankrollEngineSchema.optional(),
  confidenceTier: z.object({
    tier: z.string().optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    maxStake: z.coerce.number().optional(),
  }).passthrough().nullable().optional(),
  scenarioFlags: z.object({
    flags: z.array(z.object({
      flag: z.string().optional(),
      description: z.string().optional(),
      action: z.string().optional(),
      severity: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough().nullable().optional(),
  explanation: z.object({
    whyCount: z.coerce.number().optional(),
    riskCount: z.coerce.number().optional(),
    why: z.array(z.object({ icon: z.string().optional(), label: z.string().optional() }).passthrough()).optional(),
    risks: z.array(z.object({ icon: z.string().optional(), label: z.string().optional() }).passthrough()).optional(),
  }).passthrough().nullable().optional(),
  interactions: z.object({
    interactions: z.array(z.object({
      label: z.string().optional(),
      adjustment: z.coerce.number().optional(),
      direction: z.string().optional(),
    }).passthrough()).optional(),
    totalAdjustment: z.coerce.number().optional(),
  }).passthrough().nullable().optional(),
  replayTriggers: z.array(ReplayTriggerSchema).nullable().optional(),
  replayFlags: z.array(ReplayFlagSchema).nullable().optional(),
  betQuality: z.string().optional(),
  form: z.string().optional(),
  atrUrl: z.string().optional(),
  atrFormUrl: z.string().optional(),
  previous_results: z.array(z.object({
    position: z.coerce.number().optional(),
    runner_count: z.coerce.number().optional(),
    bha: z.coerce.number().optional(),
    weight: z.string().optional(),
    distance: z.string().optional(),
    going_shortcode: z.string().optional(),
    race_class: z.string().optional(),
  }).passthrough()).nullable().optional(),
  performanceRating: z.object({
    pr: z.coerce.number().optional(),
    gap: z.coerce.number().optional(),
    source: z.string().optional(),
  }).passthrough().nullable().optional(),
}).passthrough()

const RaceSchema = z.object({
  race_id: z.coerce.string().optional(),
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
  runners_count: z.coerce.number().optional(),
  paceMap: PaceMapSchema.nullable().optional(),
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
    }).passthrough()).nullable().optional(),
    disadvantaged: z.array(z.object({
      horse: z.string().optional(),
      horse_id: z.string().optional(),
      earlyPaceScore: z.coerce.number().optional(),
      reason: z.string().optional(),
    }).passthrough()).nullable().optional(),
  }).passthrough().nullable().optional(),
  betFilter: BetFilterSchema.nullable().optional(),
  runners: z.array(RunnerSchema).nullable().optional(),
}).passthrough()

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
