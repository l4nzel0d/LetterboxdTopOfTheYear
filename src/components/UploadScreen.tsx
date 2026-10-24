import { useRef, useState } from 'react'

interface Props {
  onSubmit: (watched: File, ratings: File, watchlist: File | null) => void
}

export function UploadScreen({ onSubmit }: Props) {
  const [watched, setWatched] = useState<File | null>(null)
  const [ratings, setRatings] = useState<File | null>(null)
  const [watchlist, setWatchlist] = useState<File | null>(null)
  const watchedRef = useRef<HTMLInputElement>(null)
  const ratingsRef = useRef<HTMLInputElement>(null)
  const watchlistRef = useRef<HTMLInputElement>(null)

  const ready = watched && ratings

  return (
    <div className="upload">
      <div className="upload-card">
        <h1>Top of the Year</h1>
        <p className="upload-sub">
          Upload your Letterboxd exports to see which decade you watched the
          most, find your highest-rated films from any year, and spot the gaps
          in the history of your watches. Add your watchlist to fill those gaps with films to
          watch next.
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
          <FilePicker
            label="watchlist.csv"
            optional
            file={watchlist}
            inputRef={watchlistRef}
            onPick={setWatchlist}
          />
        </div>

        <button
          className="upload-go"
          disabled={!ready}
          onClick={() => ready && onSubmit(watched!, ratings!, watchlist)}
        >
          Visualize my data
        </button>
      </div>
    </div>
  )
}

function FilePicker({
  label,
  optional = false,
  file,
  inputRef,
  onPick,
}: {
  label: string
  optional?: boolean
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
      <span className="file-name">{file ? file.name : optional ? 'Optional: fills gap years' : 'Choose file…'}</span>
    </label>
  )
}
