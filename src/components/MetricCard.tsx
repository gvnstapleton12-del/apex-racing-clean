interface MetricCardProps {
  label: string
  value: number | string | null
  color?: 'amber' | 'violet' | 'cyan' | 'green' | 'red'
}

export default function MetricCard({ label, value, color = 'amber' }: MetricCardProps) {
  const colorClasses = {
    amber: 'text-amber-400 border-amber-500/20 bg-amber-500/5',
    violet: 'text-violet-400 border-violet-500/20 bg-violet-500/5',
    cyan: 'text-cyan-400 border-cyan-500/20 bg-cyan-500/5',
    green: 'text-green-400 border-green-500/20 bg-green-500/5',
    red: 'text-red-400 border-red-500/20 bg-red-500/5',
  }

  const displayValue = value !== null && value !== undefined && value !== 0 ? value : '—'

  return (
    <div className={`metric-card ${colorClasses[color]}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{displayValue}</div>
    </div>
  )
}
