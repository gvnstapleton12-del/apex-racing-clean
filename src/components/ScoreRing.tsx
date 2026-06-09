interface ScoreRingProps {
  score: number
  maxScore?: number
  size?: number
  strokeWidth?: number
  className?: string
}

export default function ScoreRing({
  score,
  maxScore = 100,
  size = 80,
  strokeWidth = 6,
  className = '',
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const percentage = Math.min(100, Math.max(0, (score / maxScore) * 100))
  const offset = circumference - (percentage / 100) * circumference

  let colorClass = 'weak'
  if (score >= 75) colorClass = 'elite'
  else if (score >= 60) colorClass = 'strong'
  else if (score >= 45) colorClass = 'competitive'
  else if (score >= 30) colorClass = 'marginal'

  return (
    <div className={`score-gauge ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle
          className="track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
        />
        <circle
          className={`fill ${colorClass}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="score-gauge-value">{Math.round(score)}</span>
    </div>
  )
}
