import { useRef, useState } from 'react'

interface Props {
  onSubmit: (watched: File, ratings: File) => void
}

export function UploadScreen({ onSubmit }: Props) {
  const [watched, setWatched] = useState<File | null>(null)
  const [ratings, setRatings] = useState<File | null>(null)
  const watchedRef = useRef<HTMLInputElement>(null)
  const ratingsRef = useRef<HTMLInputElement>(null)

  const ready = watched && ratings

  return (
    <div className="upload">
      <div className="upload-card">
        <h1>Top of the Year</h1>
        <p className="upload-sub">
          Upload your Letterboxd exports to browse every film you've watched,
          grouped by year or decade and sorted by your rating within each group.
        </p>

        <div className="upload-fields">
          <FilePicker
            label="watched.csv"
            file={watched}
            inputRef={watchedRef}
            onPick={setWatched}
          />
          <FilePicker
            label="ratings.csv"
            file={ratings}
            inputRef={ratingsRef}
            onPick={setRatings}
          />
        </div>

        <button
          className="upload-go"
          disabled={!ready}
          onClick={() => ready && onSubmit(watched!, ratings!)}
        >
          Build my year
        </button>
      </div>
    </div>
  )
}

function FilePicker({
  label,
  file,
  inputRef,
  onPick,
}: {
  label: string
  file: File | null
  inputRef: React.RefObject<HTMLInputElement>
  onPick: (file: File) => void
}) {
  return (
    <label className={`file-picker ${file ? 'picked' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
        }}
      />
      <span className="file-label">{label}</span>
      <span className="file-name">{file ? file.name : 'Choose file…'}</span>
    </label>
  )
}
