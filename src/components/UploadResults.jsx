import { useEffect, useRef, useState } from 'react'

export default function UploadResults() {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [stats, setStats] = useState(null)

  const inputRef = useRef(null)

  useEffect(() => {
    function preventDefaults(e) {
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('dragover', preventDefaults)
    window.addEventListener('drop', preventDefaults)

    loadSavedAnalytics()

    return () => {
      window.removeEventListener('dragover', preventDefaults)
      window.removeEventListener('drop', preventDefaults)
    }
  }, [])

  async function loadSavedAnalytics() {
    try {
      const response = await fetch(
        '/api/learning-stats'
      )

      const analytics = await response.json()

      setStats({
        processedRaces: analytics.totalBets || 0,
        updatedRecords: analytics.winners || 0,
        analytics,
      })
    } catch (error) {
      console.error(error)
    }
  }

  async function handleFile(file) {
    if (!file) {
      setMessage('No file detected')
      return
    }

    setUploading(true)
    setMessage(`Uploading ${file.name}...`)

    try {
      const text = await file.text()

      const parsed = JSON.parse(text)

      const response = await fetch(
        '/api/upload-results',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(
            parsed.results || parsed
          ),
        }
      )

      const data = await response.json()

      setStats(data)

      setMessage(
        `Imported ${data.processedRaces} races successfully`
      )
    } catch (error) {
      console.error(error)

      setMessage(
        `Failed to upload results: ${error.message}`
      )
    }

    setUploading(false)
  }

  function onDrop(event) {
    event.preventDefault()
    event.stopPropagation()

    const file = event.dataTransfer.files[0]

    handleFile(file)
  }

  function onDragOver(event) {
    event.preventDefault()
    event.stopPropagation()
  }

  function onFileChange(event) {
    const file = event.target.files?.[0]

    handleFile(file)
  }

  return (
    <div className='p-6'>
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className='border-2 border-dashed rounded-2xl p-12 text-center bg-zinc-900 border-zinc-700 cursor-pointer hover:border-orange-500 transition'
      >
        <input
          ref={inputRef}
          type='file'
          accept='.json'
          onChange={onFileChange}
          className='hidden'
        />

        <h2 className='text-2xl font-bold mb-4'>
          Upload Official Results
        </h2>

        <p className='text-zinc-400 mb-6'>
          Drag & drop OR click to upload results JSON
        </p>

        {uploading && (
          <p className='text-blue-400'>
            Processing results...
          </p>
        )}

        {message && (
          <p className='mt-4 text-green-400 break-all'>
            {message}
          </p>
        )}
      </div>

      {stats && (
        <div className='mt-8 grid grid-cols-2 md:grid-cols-4 gap-4'>
          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Total Bets
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.totalBets || 0}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Winners
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.winners || 0}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              ROI
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.roi || 0}%
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Strike Rate
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.strikeRate || 0}%
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Bankroll
            </p>

            <h3 className='text-2xl font-bold'>
              £{stats.analytics?.bankroll || 0}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Avg Confidence
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.averageConfidence || 0}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Best Win Streak
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.longestWinStreak || 0}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Worst Losing Streak
            </p>

            <h3 className='text-2xl font-bold'>
              {stats.analytics?.longestLoseStreak || 0}
            </h3>
          </div>
        </div>
      )}
    </div>
  )
}
