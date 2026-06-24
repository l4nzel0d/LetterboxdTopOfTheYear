import { useEffect, useMemo, useState } from 'react'
import { UploadScreen } from './components/UploadScreen'
import { YearRow } from './components/YearRow'
import { buildMovies } from './lib/csv'
import { groupMovies } from './lib/group'
import { clearMovies, loadMovies, saveMovies } from './lib/storage'
import { getApiKey, resolvePosters, setApiKey } from './lib/tmdb'
import type { GroupMode, Movie } from './types'

export default function App() {
  // Restore a previously uploaded list so reloads skip the upload step.
  const [movies, setMovies] = useState<Movie[] | null>(() => loadMovies())
  const [mode, setMode] = useState<GroupMode>('year')
  const [apiKey, setKey] = useState(getApiKey())
  const [error, setError] = useState<string | null>(null)

  const groups = useMemo(
    () => (movies ? groupMovies(movies, mode) : []),
    [movies, mode],
  )

  // Resolve posters whenever we have movies and a key. Re-runs if the key is
  // entered after upload; cached lookups make repeat runs effectively free.
  useEffect(() => {
    if (!movies || !apiKey) return
    let cancelled = false
    const pending = movies.filter((m) => !m.posterUrl)
    if (pending.length === 0) return

    resolvePosters(pending, apiKey, (uri, posterUrl) => {
      if (cancelled || !posterUrl) return
      setMovies((prev) =>
        prev
          ? prev.map((m) => (m.uri === uri ? { ...m, posterUrl } : m))
          : prev,
      )
    })

    return () => {
      cancelled = true
    }
  }, [movies, apiKey])

  async function handleUpload(watched: File, ratings: File) {
    setError(null)
    try {
      const built = await buildMovies(watched, ratings)
      saveMovies(built)
      setMovies(built)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse CSV files.')
    }
  }

  function handleReupload() {
    clearMovies()
    setMovies(null)
  }

  function handleKeyChange(value: string) {
    setKey(value)
    setApiKey(value)
  }

  if (!movies) {
    return (
      <>
        <UploadScreen onSubmit={handleUpload} />
        {error && <div className="toast-error">{error}</div>}
      </>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <button className="link-btn" onClick={handleReupload}>
            ← Upload new files
          </button>
          <div className="toggle">
            <button
              className={mode === 'year' ? 'active' : ''}
              onClick={() => setMode('year')}
            >
              By Year
            </button>
            <button
              className={mode === 'decade' ? 'active' : ''}
              onClick={() => setMode('decade')}
            >
              By Decade
            </button>
          </div>
        </div>

        <input
          className="key-input"
          type="password"
          placeholder="TMDB API key (for posters)"
          value={apiKey}
          onChange={(e) => handleKeyChange(e.target.value)}
        />
      </header>

      <main className="rows">
        {groups.map((group) => (
          <YearRow key={group.key} group={group} />
        ))}
      </main>
    </div>
  )
}
