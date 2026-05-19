import { useRef, useState } from 'react'

export default function Results() {
  const fileInputRef = useRef(null)

  const [message, setMessage] = useState('')

  async function handleUpload(event) {
    const file = event.target.files?.[0]

    if (!file) return

    try {
      setMessage('Uploading results...')

      const text = await file.text()

      JSON.parse(text)

      setMessage(`Uploaded: ${file.name}`)
    } catch (error) {
      console.error(error)

      setMessage('Invalid JSON file')
    }
  }

  return (
    <div style={{ padding: '40px', color: 'white' }}>
      <div
        style={{
          background: '#111111',
          border: '1px solid #333333',
          borderRadius: '24px',
          padding: '40px',
          maxWidth: '900px'
        }}
      >
        <h1
          style={{
            fontSize: '42px',
            fontWeight: '700',
            marginBottom: '20px'
          }}
        >
          Upload Official Results
        </h1>

        <p
          style={{
            color: '#999999',
            marginBottom: '30px',
            fontSize: '18px'
          }}
        >
          Choose your Racing API results JSON file
        </p>

        <button
          type='button'
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: '#f59e0b',
            color: '#000000',
            border: 'none',
            borderRadius: '14px',
            padding: '18px 30px',
            fontSize: '20px',
            fontWeight: '700',
            cursor: 'pointer'
          }}
        >
          Choose Results JSON
        </button>

        <input
          ref={fileInputRef}
          type='file'
          accept='.json'
          style={{ display: 'none' }}
          onChange={handleUpload}
        />

        {message && (
          <div
            style={{
              marginTop: '30px',
              background: '#181818',
              border: '1px solid #333333',
              borderRadius: '14px',
              padding: '20px',
              fontSize: '18px'
            }}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  )
}
