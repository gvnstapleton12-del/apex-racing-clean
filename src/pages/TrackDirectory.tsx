import { useState, useMemo } from 'react'
import trackData from '../../data/trackProfiles.json'

interface TrackProfile {
  aka?: string; surface?: string; surfaceType?: string; country?: string
  discipline?: string; handedness?: string; circuitLengthF?: number
  straight?: string; paceBias?: string; keyTraits?: string[]
  aw?: boolean; turf?: boolean; galloping?: boolean; sharp?: boolean
  undulating?: boolean; uphillFinish?: boolean; layoutCategory?: string
  drawBiasRules?: any[]; layoutBiasRules?: any[]; featureRules?: any[]
  biasRules?: any[]; systemExclusions?: any[]; notable?: string
}

const tracks: Record<string, TrackProfile> = (trackData as any).tracks || {}

function classifyDiscipline(track: TrackProfile): string[] {
  const d = (track.discipline || '').toLowerCase()
  const cats: string[] = []
  if (track.aw) cats.push('All-Weather')
  if (/flat only|flat aw/.test(d) && !cats.includes('All-Weather')) cats.push('Flat')
  if (/(?:national hunt|nh only|jumps only|nh\s)/.test(d) || /chase|hurdle|nh flat|bumper/.test(d)) cats.push('Jumps')
  if (/dual.?purpose/.test(d)) cats.push('Dual-Purpose')
  if (/cross.?country/.test(d)) cats.push('Cross-Country')
  if (cats.length === 0 && track.turf) cats.push('Flat')
  if (cats.length === 0) cats.push('Flat')
  return [...new Set(cats)]
}

function parsePaceBias(text: string): { fr: number; pr: number; md: number; hu: number } | null {
  if (!text) return null
  const match = text.match(/FR\s+(\d+)%.*?PR\s+(\d+)%.*?MD\s+(\d+)%.*?HU\s+(\d+)%/)
  if (!match) return null
  return { fr: +match[1], pr: +match[2], md: +match[3], hu: +match[4] }
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-full h-2.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right">{pct}%</span>
    </div>
  )
}

function BiasRating({ label, stars }: { label: string; stars: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs tracking-tight">{Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < stars ? 'text-amber-400' : 'text-zinc-700'}>★</span>
      ))}</span>
    </div>
  )
}

function getInsight(name: string, track: TrackProfile): string {
  return (track as any).insight || 'Fair track — genuine ability and stamina over tactics.'
}

function getWinnerProfile(name: string, track: TrackProfile): string[] {
  const tips: string[] = []
  const paceByGoing = (track as any).paceBiasByGoing
  const keyFactors = (track as any).keyFactors as string[] | undefined
  const isJumps = (track as any).isJumps

  // Use keyFactors as the primary winner profile source
  if (keyFactors?.length) {
    keyFactors.forEach(f => tips.push(f))
  }

  // Add pace-based tips from structured data
  if (paceByGoing) {
    const fast = paceByGoing.fast
    const soft = paceByGoing.soft
    if (fast && fast.fr >= 40) tips.push('FR dominant on fast ground')
    if (fast && fast.hu < 8) tips.push('Hold-up disadvantaged')
    if (soft && soft.pr >= 40) tips.push('PR dominant on soft ground')
  }

  // Handedness
  const h = track.handedness || ''
  if (h.includes('Left')) tips.push('Left-handed')
  if (h.includes('Right')) tips.push('Right-handed')

  return tips.slice(0, 5)
}

function getRatings(track: TrackProfile) {
  const ratings = (track as any).ratings
  if (ratings) return ratings
  // Fallback for unmigrated tracks
  return { speed: 3, stamina: 3, positioning: 3, draw: 2 }
}

function TrackCard({ name, track }: { name: string; track: TrackProfile }) {
  const insight = getInsight(name, track)
  const winnerProfile = getWinnerProfile(name, track)
  const ratings = getRatings(track)
  const isJumps = (track as any).isJumps
  const paceByGoing = (track as any).paceBiasByGoing
  const fastPace = paceByGoing?.fast
  const softPace = paceByGoing?.soft

  return (
    <div className="apex-card p-5 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-base font-black text-white">{name}</h3>
        {track.aka && <p className="text-[10px] text-zinc-600 mt-0.5">{track.aka}</p>}
      </div>

      {/* Course badges */}
      <div className="flex flex-wrap gap-1.5">
        {classifyDiscipline(track).map(cat => (
          <span key={cat} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
            cat === 'All-Weather' ? 'bg-amber-500/20 text-amber-300' :
            cat === 'Flat' ? 'bg-green-500/20 text-green-300' :
            cat === 'Jumps' ? 'bg-blue-500/20 text-blue-300' :
            cat === 'Dual-Purpose' ? 'bg-purple-500/20 text-purple-300' :
            'bg-orange-500/20 text-orange-300'
          }`}>{cat}</span>
        ))}
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${
          track.handedness?.includes('Left') ? 'border-blue-500/30 bg-blue-500/10 text-blue-300' :
          track.handedness?.includes('Right') ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
          'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
        }`}>
          {track.handedness?.includes('Left') ? '↺' : track.handedness?.includes('Right') ? '↻' : '↑'} {track.handedness}
        </span>
        {track.circuitLengthF ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-white/5 text-zinc-400">{track.circuitLengthF}f circuit</span>
        ) : null}
        {track.layoutCategory && (
          <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
            track.layoutCategory === 'sharp' ? 'border-red-500/30 bg-red-500/10 text-red-300' :
            track.layoutCategory === 'galloping' ? 'border-green-500/30 bg-green-500/10 text-green-300' :
            track.layoutCategory === 'stiff' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
            track.layoutCategory === 'tactical' ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' :
            'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
          }`}>{track.layoutCategory}</span>
        )}
      </div>

      {/* Pace Bias — structured data */}
      {fastPace && (
        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Pace Bias</h4>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 w-20">Front Runner</span>
              <Bar pct={fastPace.fr} color={fastPace.fr >= 40 ? 'bg-green-400' : fastPace.fr >= 25 ? 'bg-amber-400' : 'bg-red-400'} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 w-20">Prominent</span>
              <Bar pct={fastPace.pr} color={fastPace.pr >= 40 ? 'bg-green-400' : fastPace.pr >= 25 ? 'bg-amber-400' : 'bg-red-400'} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 w-20">Midfield</span>
              <Bar pct={fastPace.md} color={fastPace.md >= 25 ? 'bg-green-400' : fastPace.md >= 15 ? 'bg-amber-400' : 'bg-red-400'} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-zinc-400 w-20">Hold Up</span>
              <Bar pct={fastPace.hu} color={fastPace.hu >= 15 ? 'bg-green-400' : fastPace.hu >= 8 ? 'bg-amber-400' : 'bg-red-400'} />
            </div>
          </div>
        </div>
      )}

      {/* Typical Winner */}
      {winnerProfile.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Typical Winner</h4>
          <div className="space-y-1">
            {winnerProfile.map((tip, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-green-400 text-xs">✓</span>
                <span className="text-[11px] text-zinc-300">{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* APEX Insight */}
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl px-3 py-2.5">
        <h4 className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1">APEX Insight</h4>
        <p className="text-[11px] text-zinc-300 leading-relaxed">{insight}</p>
      </div>

      {/* APEX Rating */}
      <div>
        <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">APEX Rating</h4>
        <div className="space-y-0.5">
          <BiasRating label="Speed" stars={ratings.speed} />
          <BiasRating label="Stamina" stars={ratings.stamina} />
          <BiasRating label="Positioning" stars={ratings.positioning} />
          {isJumps ? (
            <BiasRating label="Jumping" stars={ratings.jumping || 0} />
          ) : (
            <BiasRating label="Draw Impact" stars={ratings.draw} />
          )}
        </div>
      </div>

      {/* Ground analysis — structured data */}
      {softPace && (
        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Soft / Heavy Ground</h4>
          <div className="space-y-0.5">
            {softPace.fr < fastPace.fr && (
              <div className="text-[11px] text-zinc-400">FR drops {fastPace.fr}% → {softPace.fr}%</div>
            )}
            {softPace.pr > fastPace.pr && (
              <div className="text-[11px] text-green-400">✓ PR rises {fastPace.pr}% → {softPace.pr}%</div>
            )}
            {softPace.hu > 8 && (
              <div className="text-[11px] text-zinc-400">HU improves to {softPace.hu}%</div>
            )}
          </div>
        </div>
      )}

      {/* System Exclusions */}
      {(track.systemExclusions?.length || 0) > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">System Exclusions</h4>
          <div className="flex flex-wrap gap-1">
            {track.systemExclusions!.map((ex: any, i: number) => (
              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-400 border border-red-500/20">
                {ex.raceType || ex.type}{ex.raceNameContains ? ` (${ex.raceNameContains})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Draw by Distance — for tracks with distance-specific draw data */}
      {!isJumps && track.drawBias && Object.keys(track.drawBias).length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">Draw by Distance</h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(track.drawBias).map(([dist, data]: [string, any]) => {
              const note = data?.note || ''
              const hasBias = /advantage|disadvantage|extinct|costly|penalty|trap/i.test(note)
              const isStrong = /severe|extinct|decisive/i.test(note)
              return (
                <span key={dist} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  isStrong ? 'border-amber-500/40 bg-amber-500/15 text-amber-300' :
                  hasBias ? 'border-zinc-500/30 bg-zinc-500/10 text-zinc-300' :
                  'border-zinc-700/30 bg-zinc-800/30 text-zinc-500'
                }`}>
                  {dist}: {isStrong ? '★★★★' : hasBias ? '★★★' : '★★'}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TrackDirectory() {
  const [search, setSearch] = useState('')
  const [filterCountry, setFilterCountry] = useState('ALL')
  const [filterType, setFilterType] = useState('ALL')
  const [filterHandedness, setFilterHandedness] = useState('ALL')
  const [filterLayout, setFilterLayout] = useState('ALL')
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [expanded, setExpanded] = useState<string | null>(null)

  const trackEntries = useMemo(() => {
    return Object.entries(tracks).filter(([name, track]) => {
      const q = search.toLowerCase()
      if (q && !name.toLowerCase().includes(q) && !(track.aka || '').toLowerCase().includes(q)) return false
      if (filterCountry !== 'ALL' && (track.country || '') !== filterCountry) return false
      if (filterType !== 'ALL') {
        const cats = classifyDiscipline(track)
        if (!cats.includes(filterType)) return false
      }
      if (filterHandedness !== 'ALL' && !(track.handedness || '').includes(filterHandedness)) return false
      if (filterLayout !== 'ALL' && (track.layoutCategory || '') !== filterLayout) return false
      if (filterCategory !== 'ALL' && (track as any).trackCategory !== filterCategory) return false
      return true
    }).sort(([a], [b]) => a.localeCompare(b))
  }, [search, filterCountry, filterType, filterHandedness, filterLayout, filterCategory])

  const countries = ['ALL', ...new Set(Object.values(tracks).map(t => t.country || '').filter(Boolean))]
  const layouts = ['ALL', ...new Set(Object.values(tracks).map(t => t.layoutCategory || '').filter(Boolean))]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Track Directory</h1>
        <p className="text-zinc-400 text-sm mt-1">{Object.keys(tracks).length} UK/IRE courses — handedness, bias, layout, APEX insights</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="Search tracks..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-amber-500/50 w-64" />
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          {countries.map(c => <option key={c} value={c}>{c === 'ALL' ? 'All Countries' : c}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          <option value="ALL">All Types</option>
          <option value="All-Weather">All-Weather</option>
          <option value="Flat">Flat</option>
          <option value="Jumps">Jumps (Hurdle/Chase)</option>
          <option value="Dual-Purpose">Dual-Purpose</option>
          <option value="Cross-Country">Cross-Country</option>
        </select>
        <select value={filterHandedness} onChange={e => setFilterHandedness(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          <option value="ALL">All Handedness</option>
          <option value="Left">Left-Handed</option>
          <option value="Right">Right-Handed</option>
          <option value="Straight">Straight</option>
        </select>
        <select value={filterLayout} onChange={e => setFilterLayout(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          {layouts.map(l => <option key={l} value={l}>{l === 'ALL' ? 'All Layouts' : l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm">
          <option value="ALL">All Categories</option>
          <option value="tactical">Tactical</option>
          <option value="galloping">Ability</option>
          <option value="stamina">Stamina</option>
          <option value="specialist">Specialist</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {trackEntries.map(([name, track]) => {
          const winnerProfile = getWinnerProfile(name, track)
          const trackCategory = (track as any).trackCategory
          const keyFactors = (track as any).keyFactors as string[] | undefined

          return (
          <div key={name}>
            {expanded === name ? (
              <div className="relative">
                <button onClick={() => setExpanded(null)}
                  className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-zinc-800 border border-zinc-600 text-zinc-400 text-xs flex items-center justify-center hover:text-white hover:border-zinc-400 transition">
                  ×
                </button>
                <TrackCard name={name} track={track} />
              </div>
            ) : (
              <button onClick={() => setExpanded(name)}
                className="apex-card p-4 w-full text-left hover:border-amber-500/30 transition cursor-pointer">
                {/* Track name + handedness */}
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-white">{name}</h3>
                  <span className={`text-[11px] font-bold ${
                    track.handedness?.includes('Left') ? 'text-blue-400' :
                    track.handedness?.includes('Right') ? 'text-amber-400' : 'text-zinc-500'
                  }`}>
                    {track.handedness?.includes('Left') ? '↺ Left' : track.handedness?.includes('Right') ? '↻ Right' : '↑ Straight'}
                  </span>
                </div>

                {/* Tags row — properly spaced */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {classifyDiscipline(track).map(cat => (
                    <span key={cat} className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      cat === 'All-Weather' ? 'bg-amber-500/20 text-amber-300' :
                      cat === 'Flat' ? 'bg-green-500/20 text-green-300' :
                      cat === 'Jumps' ? 'bg-blue-500/20 text-blue-300' :
                      cat === 'Dual-Purpose' ? 'bg-purple-500/20 text-purple-300' :
                      'bg-orange-500/20 text-orange-300'
                    }`}>{cat}</span>
                  ))}
                  {track.layoutCategory && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                      track.layoutCategory === 'sharp' ? 'border-red-500/30 bg-red-500/10 text-red-300' :
                      track.layoutCategory === 'galloping' ? 'border-green-500/30 bg-green-500/10 text-green-300' :
                      track.layoutCategory === 'stiff' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
                      track.layoutCategory === 'tactical' ? 'border-purple-500/30 bg-purple-500/10 text-purple-300' :
                      'border-zinc-500/30 bg-zinc-500/10 text-zinc-400'
                    }`}>{track.layoutCategory}</span>
                  )}
                </div>

                {/* Track category + key factors */}
                {trackCategory && (
                  <div className="mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      trackCategory === 'tactical' ? 'bg-purple-500/20 text-purple-300' :
                      trackCategory === 'galloping' ? 'bg-green-500/20 text-green-300' :
                      trackCategory === 'stamina' ? 'bg-blue-500/20 text-blue-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>{trackCategory}</span>
                  </div>
                )}

                {/* Key factors */}
                {keyFactors && keyFactors.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {keyFactors.slice(0, 3).map((f, i) => (
                      <span key={i} className="text-[10px] text-zinc-500">{i > 0 && '· '}{f}</span>
                    ))}
                  </div>
                )}

                {/* Winner profile — top 3 */}
                {winnerProfile.length > 0 && (
                  <div>
                    {winnerProfile.slice(0, 3).map((tip, i) => (
                      <div key={i} className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-green-400 text-[10px]">✓</span>
                        <span className="text-[10px] text-zinc-400">{tip}</span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            )}
          </div>
          )
        })}
      </div>

      {trackEntries.length === 0 && (
        <div className="text-center py-12 text-zinc-500">No tracks match your filters.</div>
      )}
    </div>
  )
}
