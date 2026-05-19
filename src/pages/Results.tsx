import { useRef, useState } from 'react'

export default function Results() {
  const fileInputRef = useRef(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleUpload(event) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      setLoading(true)
      setMessage('Processing results...')

      const text = await file.text()
      const json = JSON.parse(text)

      const races = Array.isArray(json)
        ? json
        : json.races || json.results || json.racecards || []

      const response = await fetch('http://localhost:3000/api/upload-results', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(races)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      setMessage(`Successfully processed ${data.processedRaces || 0} races`)
    } catch (error) {
      console.error(error)
      setMessage(error.message || 'Invalid JSON file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '40px', color: 'white' }}>
      <div style={{ background: '#111', border: '1px solid #333', borderRadius: '24px', padding: '40px', maxWidth: '900px' }}>
        <h1 style={{ fontSize: '42px', fontWeight: '700', marginBottom: '20px' }}>
          Upload Official Results
        </h1>

        <p style={{ color: '#999', marginBottom: '30px', fontSize: '18px' }}>
          Choose your Racing API results JSON file
        </p>

        <button
          type='button'
          disabled={loading}
          onClick={() => fileInputRef.current?.click()}
          style={{ background: '#f59e0b', color: '#000', border: 'none', borderRadius: '14px', padding: '18px 30px', fontSize: '20px', fontWeight: '700', cursor: 'pointer' }}
        >
          {loading ? 'Processing...' : 'Choose Results JSON'}
        </button>

        <input
          ref={fileInputRef}
          type='file'
          accept='.json,application/json'
          style={{ display: 'none' }}
          onChange={handleUpload}
        />

        {message && (
          <div style={{ marginTop: '30px', background: '#181818', border: '1px solid #333', borderRadius: '14px', padding: '20px', fontSize: '18px' }}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
