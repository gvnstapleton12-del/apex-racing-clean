import { useEffect, useState } from 'react'
import { fetchResults, saveResults } from '@/lib/racingApi'

export default function Results() {
  const [results, setResults] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const saved = await fetchResults()
      setResults(saved)
    }

    load()
  }, [])

  async function handleUpload(event: any) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      const text = await file.text()
      const json = JSON.parse(text)

      const parsed = json.racecards || json.results || json

      setResults([...parsed])

      await saveResults(parsed)

      event.target.value = ''

      alert('Results uploaded successfully')
    } catch (err) {
      console.error(err)
      alert('Invalid JSON file')
    }
  }

  return (
    <div className='p-6 space-y-6'>
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-3xl font-bold'>Results Archive</h1>
          <p className='text-muted-foreground'>Upload Racing API JSON results files</p>
        </div>

        <label className='px-4 py-2 rounded-lg bg-amber-500 text-black font-semibold cursor-pointer'>
          Upload Results

          <input
            type='file'
            accept='.json'
            className='hidden'
            onChange={handleUpload}
          />
        </label>
      </div>

      <div className='grid gap-4'>
        {results.length === 0 ? (
          <div className='border rounded-xl p-6 bg-card'>
            No uploaded results yet.
          </div>
        ) : (
          results.map((race: any, index: number) => (
            <div
              key={race.race_id || index}
              className='border rounded-xl p-5 bg-card flex items-center justify-between'
            >
              <div>
                <h2 className='font-semibold text-xl'>
                  {race.race_name}
                </h2>

                <p className='text-muted-foreground'>
                  {race.course} · {race.off_time}
                </p>
              </div>

              <div className='text-right'>
                <p>{race.field_size || 0} runners</p>
                <p className='text-amber-400'>Result</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
