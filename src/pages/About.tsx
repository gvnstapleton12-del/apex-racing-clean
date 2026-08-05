export default function About() {
  return (
    <div className='dashboard-page max-w-7xl mx-auto space-y-6'>
      {/* System Overview */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-3'>System Overview</h2>
        <p className='text-zinc-400 text-sm leading-relaxed'>
          APEX Racing Intelligence is a data-driven horse racing prediction platform that identifies
          horses most likely to win based on conditions fit — course, ground, distance, pace, and class.
          The system uses a multi-layered scoring engine that combines personal affinity signals,
          trainer form, ground conditions, and class modelling to surface value bets where the
          model's probability diverges from the market.
        </p>
      </section>

      {/* How It Works */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-4'>How It Works</h2>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          <div className='rounded-xl bg-black/20 border border-white/5 p-4'>
            <div className='text-amber-400 text-xs font-bold uppercase tracking-wider mb-2'>1. Data Layer</div>
            <p className='text-zinc-400 text-sm'>
              Live racecards scraped from Sporting Life. Historical odds from Betfair's public promo directory.
              Horse memory built from 632K+ runs across 5 years of racing.
            </p>
          </div>
          <div className='rounded-xl bg-black/20 border border-white/5 p-4'>
            <div className='text-amber-400 text-xs font-bold uppercase tracking-wider mb-2'>2. Intelligence Engine</div>
            <p className='text-zinc-400 text-sm'>
              Pure functions — scoring, grading, filtering. Personal affinity, trainer form, ground,
              class model, and pace compatibility combined into a winner probability via Platt scaling.
            </p>
          </div>
          <div className='rounded-xl bg-black/20 border border-white/5 p-4'>
            <div className='text-amber-400 text-xs font-bold uppercase tracking-wider mb-2'>3. Presentation</div>
            <p className='text-zinc-400 text-sm'>
              Dashboard with racecards, full card picks, evidence tracking, backtesting,
              and a shadow sandbox for close-miss monitoring.
            </p>
          </div>
        </div>
      </section>

      {/* PA Gate */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-3'>The PA Gate</h2>
        <p className='text-zinc-400 text-sm leading-relaxed mb-4'>
          Personal Affinity (PA) is the primary signal gate. It measures how well a horse's historical
          profile fits the specific race conditions using Bayesian position-based analysis across
          five sub-components: track, direction, distance, going, and draw/style.
        </p>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3'>
          <div className='rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 text-center'>
            <div className='text-emerald-400 text-xs font-bold'>PA ELITE</div>
            <div className='text-emerald-300 text-lg font-black'>+302% ROI</div>
            <div className='text-zinc-500 text-xs'>50% WR</div>
          </div>
          <div className='rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-center'>
            <div className='text-blue-400 text-xs font-bold'>PA TARGET</div>
            <div className='text-blue-300 text-lg font-black'>+198% ROI</div>
            <div className='text-zinc-500 text-xs'>28% WR</div>
          </div>
          <div className='rounded-xl bg-zinc-500/10 border border-zinc-500/20 p-3 text-center'>
            <div className='text-zinc-400 text-xs font-bold'>PA VALUE</div>
            <div className='text-zinc-300 text-lg font-black'>+63% ROI</div>
            <div className='text-zinc-500 text-xs'>15% WR</div>
          </div>
          <div className='rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-center'>
            <div className='text-red-400 text-xs font-bold'>PA NEGATIVE</div>
            <div className='text-red-300 text-lg font-black'>Damped</div>
            <div className='text-zinc-500 text-xs'>Filtered</div>
          </div>
        </div>
        <p className='text-zinc-500 text-xs mt-3'>
          Horses with PA {'≤'} 0 are blocked from value bets. Backtest confirmed: 0.03% WR from 3,642 PA {'≤'} 0 selections.
        </p>
      </section>

      {/* Data Sources */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-3'>Data Sources</h2>
        <div className='space-y-2 text-sm text-zinc-400'>
          <div className='flex items-start gap-2'>
            <span className='text-amber-400 font-bold mt-0.5'>●</span>
            <span><strong className='text-zinc-300'>Sporting Life</strong> — Live racecards, results, runner details, form, OR/RPR ratings. Primary data source for UK &amp; Irish racing.</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='text-amber-400 font-bold mt-0.5'>●</span>
            <span><strong className='text-zinc-300'>Betfair SP</strong> — Historical starting prices via the public promo directory (632K+ runs, 2021–2026). Used for odds-based value detection and backtesting.</span>
          </div>
          <div className='flex items-start gap-2'>
            <span className='text-amber-400 font-bold mt-0.5'>●</span>
            <span><strong className='text-zinc-300'>Horse Memory</strong> — SQLite database of horse runs enriched with going, distance, class, and race profiles. Powers personal affinity and form analysis.</span>
          </div>
        </div>
      </section>

      {/* Model Status */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-3'>Model Status</h2>
        <div className='grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm'>
          <div>
            <div className='text-zinc-500 text-xs mb-1'>Course Multiplier</div>
            <div className='text-white font-bold'>2.5x</div>
          </div>
          <div>
            <div className='text-zinc-500 text-xs mb-1'>Going Filter</div>
            <div className='text-white font-bold'>Disabled</div>
          </div>
          <div>
            <div className='text-zinc-500 text-xs mb-1'>Distance Affinity</div>
            <div className='text-white font-bold'>1.0x</div>
          </div>
          <div>
            <div className='text-zinc-500 text-xs mb-1'>Status</div>
            <div className='text-amber-400 font-bold'>Frozen</div>
          </div>
        </div>
        <p className='text-zinc-500 text-xs mt-3'>
          The model is frozen. Single-component weight scaling has no effect — the engine's edge
          comes from multi-component interactions (PA + trainer form + ground). Any new scoring
          change must be judged against the validated baseline.
        </p>
      </section>

      {/* Validated Findings */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-3'>Validated Findings</h2>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm text-left'>
            <thead>
              <tr className='text-zinc-500 text-xs border-b border-white/5'>
                <th className='pb-2 font-medium'>Signal</th>
                <th className='pb-2 font-medium'>Winner Better</th>
                <th className='pb-2 font-medium'>Avg Delta</th>
                <th className='pb-2 font-medium'>Verdict</th>
              </tr>
            </thead>
            <tbody className='text-zinc-400'>
              <tr className='border-b border-white/5'>
                <td className='py-2 text-zinc-300'>personalAffinity</td>
                <td className='py-2'>89%</td>
                <td className='py-2'>+4.47</td>
                <td className='py-2 text-emerald-400'>Proven — embedded in engine</td>
              </tr>
              <tr className='border-b border-white/5'>
                <td className='py-2 text-zinc-300'>ground</td>
                <td className='py-2'>25%</td>
                <td className='py-2'>+6.59</td>
                <td className='py-2 text-emerald-400'>Strong — highest avg delta</td>
              </tr>
              <tr className='border-b border-white/5'>
                <td className='py-2 text-zinc-300'>trainerForm</td>
                <td className='py-2'>35%</td>
                <td className='py-2'>+0.25</td>
                <td className='py-2 text-emerald-400'>Frequent small positive</td>
              </tr>
              <tr className='border-b border-white/5'>
                <td className='py-2 text-zinc-300'>rprORGap</td>
                <td className='py-2'>55%</td>
                <td className='py-2'>+1.32</td>
                <td className='py-2 text-blue-400'>Moderate consistent signal</td>
              </tr>
              <tr className='border-b border-white/5'>
                <td className='py-2 text-zinc-300'>paceCompat</td>
                <td className='py-2'>3%</td>
                <td className='py-2'>+0.13</td>
                <td className='py-2 text-zinc-500'>Weak — barely differentiates</td>
              </tr>
              <tr>
                <td className='py-2 text-zinc-300'>raceShape</td>
                <td className='py-2'>1%</td>
                <td className='py-2'>+0.01</td>
                <td className='py-2 text-zinc-500'>Effectively dead</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Disclaimer */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-6'>
        <h2 className='text-xl font-bold text-white mb-3'>Disclaimer</h2>
        <div className='text-zinc-500 text-xs leading-relaxed space-y-2'>
          <p>
            APEX Racing Intelligence is for informational and educational purposes only.
            It is not financial advice, and nothing in this system should be construed as
            a recommendation to place bets.
          </p>
          <p>
            Past performance is not indicative of future results. Horse racing is inherently
            unpredictable. All betting carries risk, and you should never wager more than you
            can afford to lose.
          </p>
          <p>
            The system uses publicly available data. Odds, ratings, and form data are sourced
            from third parties and may contain inaccuracies. Always verify with official sources.
          </p>
          <p>
            Must be 18 or over to bet on horse racing in the UK. If you or someone you know
            has a gambling problem, call the National Gambling Helpline on 0808 8020 133.
          </p>
        </div>
      </section>

      {/* Version */}
      <section className='bg-white/[0.02] rounded-2xl border border-white/5 p-4 flex items-center justify-between'>
        <div className='text-zinc-500 text-xs'>APEX Racing Intelligence v1.1.0</div>
        <div className='text-zinc-500 text-xs'>Last updated June 2026</div>
      </section>
    </div>
  )
}
