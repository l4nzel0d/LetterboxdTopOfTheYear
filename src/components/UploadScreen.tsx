import { useRef, useState } from 'react'
import { extractExport } from '../lib/zip'
import { showToast } from '../lib/toast'

interface Props {
  onSubmit: (watched: File, ratings: File, watchlist: File | null) => void
}

export function UploadScreen({ onSubmit }: Props) {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setBusy(true)
    try {
      const { watched, ratings, watchlist } = await extractExport(file)
      onSubmit(watched, ratings, watchlist)
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not read that file.',
        'error',
      )
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="upload">
      <div className="upload-card">
        <h1>Top of the Year</h1>
        <p className="upload-sub">
          Upload your Letterboxd export to see which decade you watched the
          most, find your highest-rated films from any year, and spot the gaps
          in the history of your watches. If your export includes a watchlist,
          it fills those gaps with films to watch next.
        </p>

        <label
          className={`file-picker drop-zone ${dragging ? 'dragging' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            if (f && !busy) handleFile(f)
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />
          <span className="drop-title">
            {busy ? 'Reading export…' : 'Drop your Letterboxd export here'}
          </span>
          <span className="file-name">
            {busy ? 'This only takes a moment' : 'or click to choose the .zip file'}
          </span>
        </label>
      </div>
    </div>
  )
}
