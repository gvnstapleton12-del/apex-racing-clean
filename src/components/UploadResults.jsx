import { useState } from 'react'

export default function UploadResults() {
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [stats, setStats] = useState(null)

  async function handleFile(file) {
    if (!file) return

    setUploading(true)
    setMessage('Uploading results...')

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
      setMessage('Failed to upload results')
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

  return (
    <div className='p-6'>
      <div
        onDragOver={onDragOver}
        onDrop={onDrop}
        className='border-2 border-dashed rounded-2xl p-12 text-center bg-zinc-900 border-zinc-700'
      >
        <h2 className='text-2xl font-bold mb-4'>
          Upload Official Results
        </h2>

        <p className='text-zinc-400 mb-6'>
          Drag & drop results JSON files here
        </p>

        {uploading && (
          <p className='text-blue-400'>
            Processing results...
          </p>
        )}

        {message && (
          <p className='mt-4 text-green-400'>
            {message}
          </p>
        )}
      </div>

      {stats && (
        <div className='mt-8 grid grid-cols-2 md:grid-cols-4 gap-4'>
          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Races
            </p>
            <h3 className='text-2xl font-bold'>
              {stats.processedRaces}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Results
            </p>
            <h3 className='text-2xl font-bold'>
              {stats.updatedRecords}
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              ROI
            </p>
            <h3 className='text-2xl font-bold'>
              {stats.roi}%
            </h3>
          </div>

          <div className='bg-zinc-900 p-4 rounded-xl'>
            <p className='text-zinc-400 text-sm'>
              Strike Rate
            </p>
            <h3 className='text-2xl font-bold'>
              {stats.strikeRate}%
            </h3>
          </div>
        </div>
      )}
    </div>
  )
}
