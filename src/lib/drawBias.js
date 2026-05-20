const drawBias = {
  ascot: { low: 2, high: 3 },
  ayr: { low: 2 },
  bath: { low: 3 },
  beverley: { low: 4 },
  brighton: { low: 2 },
  carlisle: { low: 3 },
  cartmel: {},
  catterick: { low: 3 },
  chelmsford: { low: 2 },
  cheltenham: {},
  chepstow: { low: 2 },
  chester: { low: 5 },
  doncaster: {},
  epsom: { high: 3 },
  exeter: {},
  fakenham: {},
  fontwell: {},
  goodwood: { low: 3 },
  hamilton: { high: 3 },
  haydock: { low: 2 },
  hereford: {},
  hexham: {},
  huntingdon: {},
  kelso: {},
  kempton: {},
  leicester: { low: 2 },
  lingfield: { low: 2 },
  ludlow: {},
  marketrasen: {},
  musselburgh: { low: 3 },
  newtonabbot: {},
  newbury: {},
  newcastle: {},
  newmarket: { high: 4 },
  nottingham: { low: 2 },
  perth: {},
  plumpton: {},
  pontefract: { low: 4 },
  redcar: { high: 3 },
  ripon: { low: 3 },
  salisbury: { low: 2 },
  sandown: { low: 2 },
  sedgefield: {},
  southwell: {},
  stratford: {},
  taunton: {},
  thirsk: { low: 3 },
  towcester: {},
  uttoxeter: {},
  warwick: {},
  wetherby: {},
  wincanton: {},
  windsor: { low: 3 },
  wolverhampton: { low: 2 },
  worcester: {},
  yarmouth: { low: 2 },
  york: { low: 3 },

  ballinrobe: {},
  bellewstown: {},
  clonmel: {},
  cork: {},
  curragh: { low: 2 },
  downpatrick: {},
  downroyal: {},
  dundalk: { low: 2 },
  fairyhouse: {},
  galway: { low: 2 },
  gowranpark: {},
  kilbeggan: {},
  killarney: {},
  laytown: {},
  leopardstown: { low: 2 },
  limerick: {},
  listowel: {},
  naas: { low: 2 },
  navan: { low: 2 },
  punchestown: {},
  roscommon: {},
  sligo: {},
  thurles: {},
  tipperary: {},
  tramore: {},
  wexford: {},
}

export function getDrawAdjustment(course, draw, fieldSize) {
  const key = String(course || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
  const profile = drawBias[key]
  if (!profile) return 0
  if (!draw || draw <= 0 || fieldSize <= 3) return 0

  const lowStrength = profile.low || 0
  const highStrength = profile.high || 0
  const middle = (fieldSize + 1) / 2
  const third = fieldSize / 3

  if (lowStrength > 0 && draw <= third) {
    return Math.round(lowStrength * 1.5)
  }
  if (lowStrength > 0 && draw >= fieldSize - third + 1) {
    return -Math.round(lowStrength)
  }

  if (highStrength > 0 && draw >= fieldSize - third + 1) {
    return Math.round(highStrength * 1.5)
  }
  if (highStrength > 0 && draw <= third) {
    return -Math.round(highStrength)
  }

  return 0
}
