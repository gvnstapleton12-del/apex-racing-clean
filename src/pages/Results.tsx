import { useEffect, useRef, useState } from 'react'
import { fetchResults, saveResults } from '@/lib/racingApi'

export default function Results() {
  const [results, setResults] = useState<any[]>([])
  const [uploadMessage, setUploadMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const saved = await fetchResults()
        setResults(saved || [])
      } catch (error) {
        console.error(error)
      }
    }

    load()
  }, [])

  async function handleUpload(event: any) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      setUploadMessage('Uploading results...')

      const text = await file.text()
      const json = JSON.parse(text)

      const parsed = json.racecards || json.results || json

      setResults(Array.isArray(parsed) ? parsed : [])

      await saveResults(parsed)

      setUploadMessage(
        `Imported ${Array.isArray(parsed) ? parsed.length : 0} races successfully`
      )

      event.target.value = ''
    } catch (err) {
      console.error(err)
      setUploadMessage('Invalid JSON file')
    }
  }

  return (
    <div className='p-6 text-white'>
      <div className='max-w-5xl rounded-3xl border border-zinc-800 bg-zinc-950 p-8'>
        <h1 className='text-4xl font-bold mb-2'>
          Upload Official Results
        </h1>

        <p className='text-zinc-400 mb-6'>
          Drag & drop OR click to upload results JSON
        </p>

        <button
          onClick={() => fileInputRef.current?.click()}
          className='rounded-xl bg-amber-500 px-6 py-4 text-lg font-bold text-black hover:bg-amber-400 transition'
        >
          Choose Results JSON
        </button>

        <input
          ref={fileInputRef}
          type='file'
          accept='.json'
          className='hidden'
          onChange={handleUpload}
        />

        {uploadMessage && (
          <div className='mt-6 rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-lg'>
            {uploadMessage}
          </div>
        )}

        <div className='mt-10 grid gap-4'>
          {results.length === 0 ? (
            <div className='rounded-2xl border border-zinc-800 bg-black p-6 text-zinc-400'>
              No uploaded results yet.
            </div>
          ) : (
            results.map((race: any, index: number) => (
              <div
                key={race.race_id || index}
                className='flex items-center justify-between rounded-2xl border border-zinc-800 bg-black p-5'
              >
                <div>
                  <h2 className='text-xl font-semibold'>
                    {race.race_name || 'Race Result'}
                  </h2>

                  <p className='text-zinc-400'>
                    {race.course || 'Unknown Course'} · {race.off_time || 'Unknown Time'}
                  </p>
                </div>

                <div className='text-right'>
                  <p>{race.field_size || 0} runners</p>
                  <p className='text-amber-400'>Processed</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
