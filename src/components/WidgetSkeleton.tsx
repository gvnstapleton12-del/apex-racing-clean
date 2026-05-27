interface WidgetSkeletonProps {
  title?: string
  lines?: number
  cols?: number
  variant?: 'card' | 'list' | 'grid' | 'stats'
}

export default function WidgetSkeleton({ title, lines = 3, cols = 2, variant = 'card' }: WidgetSkeletonProps) {
  if (variant === 'stats') {
    return (
      <div className='rounded-2xl border bg-card p-6 animate-pulse'>
        {title && <div className='h-6 w-40 bg-white/5 rounded-lg mb-4' />}
        <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className='rounded-xl border p-5'>
              <div className='h-4 w-20 bg-white/5 rounded mb-3' />
              <div className='h-8 w-16 bg-white/5 rounded' />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'grid') {
    return (
      <div className='rounded-2xl border bg-card p-6 animate-pulse'>
        {title && <div className='h-6 w-40 bg-white/5 rounded-lg mb-4' />}
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-4'>
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className='rounded-xl border p-4'>
              <div className='h-4 w-32 bg-white/5 rounded mb-2' />
              <div className='h-6 w-48 bg-white/5 rounded mb-2' />
              <div className='h-4 w-24 bg-white/5 rounded' />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'list') {
    return (
      <div className='rounded-2xl border bg-card p-6 animate-pulse'>
        {title && <div className='h-6 w-40 bg-white/5 rounded-lg mb-4' />}
        <div className='space-y-3'>
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className='rounded-xl border p-4 flex items-center justify-between'>
              <div className='flex-1'>
                <div className='h-4 w-24 bg-white/5 rounded mb-2' />
                <div className='h-6 w-40 bg-white/5 rounded mb-1' />
                <div className='h-4 w-32 bg-white/5 rounded' />
              </div>
              <div className='text-right'>
                <div className='h-8 w-16 bg-white/5 rounded' />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className='rounded-2xl border bg-card p-6 animate-pulse'>
      {title && <div className='h-6 w-40 bg-white/5 rounded-lg mb-4' />}
      <div className='space-y-3'>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className='h-12 bg-white/5 rounded-xl' />
        ))}
      </div>
    </div>
  )
}
