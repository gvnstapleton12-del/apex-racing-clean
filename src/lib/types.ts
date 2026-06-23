export interface Race {
  race_id?: string
  race_name?: string
  course?: string
  off_time?: string
  off_dt?: string
  date?: string
  region?: string
  distance_f?: string
  going?: string
  surface?: string
  race_class?: string | number
  type?: string
  pattern?: string
  age_band?: string
  field_size?: number
  paceMap?: PaceMap
  raceShape?: RaceShape
  betFilter?: BetFilter
  runners?: Runner[]
}

export interface PaceMap {
  projectedTempo: string
  collapseRisk: string
  frontRunners: number
  prominent: number
  midfield: number
  holdUp: number
  pacePressure: string
}

export interface RaceShape {
  shape?: string
  tempo?: string
  leaders?: number
  pressers?: number
  midfield?: number
  closers?: number
  pressureLabel?: string
  collapseProb?: number
  beneficiaries?: Array<{ horse?: string; horse_id?: string; earlyPaceScore?: number; reason?: string }>
  disadvantaged?: Array<{ horse?: string; horse_id?: string; earlyPaceScore?: number; reason?: string }>
}

export interface BetFilter {
  verdict: string
}

export interface Runner {
  horse?: string
  horse_id?: string
  jockey?: string
  trainer?: string
  odds?: string | number
  draw?: number
  or?: number
  ofr?: number
  rpr?: number
  age?: number
  lbs?: string | number
  last_run?: number
  sex?: string
  colour?: string
  position?: number
  pos?: number
  spOdds?: string
  sp?: string
  score?: number
  finalScore?: number
  aiProfile?: AiProfile
  winProb?: number
  placeProb?: number
  probBand?: string
  probRange?: string
  runningStyle?: string
  paceScore?: number
  horseQuality?: HorseQuality
  components?: ComponentScores
  placeTraits?: PlaceTraits
  selectionQuality?: SelectionQuality
  simulation?: Simulation
  valueEngine?: ValueEngine
  bankrollEngine?: BankrollEngine
  confidenceTier?: ConfidenceTier
  scenarioFlags?: ScenarioFlags
  explanation?: Explanation
  interactions?: FeatureInteractions
  replayTriggers?: ReplayTrigger[]
  replayFlags?: ReplayFlag[]
  betQuality?: string
  form?: string
  atrUrl?: string
  atrFormUrl?: string
  horseMemory?: HorseMemory
}

export interface HorseMemory {
  horseName: string
  runsCount: number
  peakRPR: number
  peakOR: number
  lastWinningOR: number | null
  lastWinningRPR: number | null
  currentVsPeak: number
  currentVsLastWin: number
  avgRPR: number
  recentRPR: number
  olderRPR: number
  rprTrend: number
  bestDistance: number | null
  bestGoing: string | null
  bestCourse: string | null
  wins: number
  winRate: number
  handicapScore?: number
  handicapLabel?: string
  abilityScore?: number
  provenZoneScore?: number
  provenZoneInZone?: boolean
  provenZoneDetails?: {
    orDelta?: number
    orInZone?: boolean
    anchorOR?: number
    goingDelta?: number
    anchorGoing?: string
    distanceDelta?: number
    anchorDistance?: number
    fieldDelta?: number
    anchorFieldSize?: number
    anchorClass?: string
    anchorCourse?: string
    scores?: Record<string, number>
    source?: string
    cohortBlended?: boolean
    cohortWinRate?: number
  }
  provenZoneAnchor?: {
    anchorDate: string
    orAtWin: number
    fieldSizeAtWin: number
    goingNumAtWin: number
    goingAtWin: string
    distanceFurlongsAtWin: number
    raceClassAtWin: string
    courseTypeAtWin: string
    courseAtWin: string
  } | null
}

export interface AiProfile {
  confidence?: number
  grade?: string
}

export interface HorseQuality {
  label: string
  power: number
  suitability: number
  consistency: number
  paceCompat: number
  volatility: number
  finalScore?: number
}

export interface ComponentScores {
  finalScore: number
  ability: number
  form: number
  suitability: number
  pace: number
  replay: number
  trainerJockey: number
  weightEffect?: number
  conditionMatch?: number
}

export interface PlaceTraits {
  consistency: number
  reliability: number
  honesty: number
  finishingKick: number
  explosiveAbility: number
  marketConfidence: number
}

export interface SelectionQuality {
  grade: string
  recommendation: string
  fairOdds: string | number
  marketOdds: string | number
  edge: number
  value: number
}

export interface Simulation {
  winRate: number
  placeRate: number
  avgPosition: number
  collapseRate: number
  raceShape: string
}

export interface ValueEngine {
  edgeLabel: string
  valueGrade: string
  edge: number
  expectedValue: number
  roi: number
  bettable: boolean
}

export interface BankrollEngine {
  label: string
  stake: number
  units: number
  adjustedKelly: number
  reason: string
}

export interface ConfidenceTier {
  tier: string
  label: string
  description: string
  maxStake: number
}

export interface ScenarioFlags {
  flags: ScenarioFlag[]
}

export interface ScenarioFlag {
  flag: string
  description: string
  action: string
  severity: string
}

export interface Explanation {
  whyCount: number
  riskCount: number
  why: Signal[]
  risks: Signal[]
}

export interface Signal {
  icon: string
  label: string
}

export interface FeatureInteractions {
  interactions: Interaction[]
  totalAdjustment: number
}

export interface Interaction {
  label: string
  adjustment: number
  direction: string
}

export interface ReplayTrigger {
  key: string
  short: string
  label: string
  severity: string
}

export interface ReplayFlag {
  key: string
  label: string
  severity: string
}
