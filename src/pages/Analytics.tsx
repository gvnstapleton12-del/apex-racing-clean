import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchRacecards } from '@/lib/racingApi'
import ReplayFlagBoard from '@/components/ReplayFlagBoard'
import CalibrationDashboard from '@/components/CalibrationDashboard'

const views = [
  { value: 'replays', label: 'Replay Flag Board' },
  { value: 'calibration', label: 'Calibration Dashboard' },
]

export default function Analytics() {
  const [view, setView] = useState('replays')
  const { data: allRaces = [] } = useQuery({
    queryKey: ['analytics-racecards'],
    queryFn: fetchRacecards,
    refetchInterval: 60000,
  })
  const races = allRaces.filter((r) => r.region === 'GB' || r.region === 'IRE' || r.region === 'gb' || r.region === 'ire')

  return (
    <div className='dashboard-page p-6'>
      <div className='mb-6'>
        <h1 className='text-5xl font-black tracking-tight'>Analytics</h1>
        <p className='text-muted-foreground mt-2'>Race intelligence analysis tools</p>
      </div>

      <div className='mb-6'>
        <label className='text-xs text-muted-foreground mb-2 block'>Select view</label>
        <select
          value={view}
          onChange={(e) => setView(e.target.value)}
          className='w-full max-w-xs rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm appearance-none cursor-pointer focus:outline-none focus:border-amber-500/50'
        >
          {views.map((v) => (
            <option key={v.value} value={v.value} className='bg-zinc-900'>{v.label}</option>
          ))}
        </select>
      </div>

      {view === 'replays' && <ReplayFlagBoard races={races} />}
      {view === 'calibration' && <CalibrationDashboard />}
    </div>
  )
}
