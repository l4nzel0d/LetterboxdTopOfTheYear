import { useEffect, useMemo, useState } from 'react'
import { Histogram } from './components/Histogram'
import { Toaster } from './components/Toaster'
import { UploadScreen } from './components/UploadScreen'
import { YearRow } from './components/YearRow'
import { buildMovies } from './lib/csv'
import { groupMovies } from './lib/group'
import { clearMovies, loadMovies, saveMovies } from './lib/storage'
import { showToast } from './lib/toast'
import { clearPosterCache, resolvePosters } from './lib/tmdb'
import type { GroupMode, Movie } from './types'

export default function App() {
  // Restore a previously uploaded list so reloads skip the upload step.
  const [movies, setMovies] = useState<Movie[] | null>(() => loadMovies())
  const [mode, setMode] = useState<GroupMode>('year')

  const groups = useMemo(
    () => (movies ? groupMovies(movies, mode) : []),
    [movies, mode],
  )

  // Resolve posters whenever we have movies. The key lives server-side behind
  // the /api/tmdb proxy, so there's nothing to ask the user for; cached lookups
  // make repeat runs effectively free.
  useEffect(() => {
    if (!movies) return
    let cancelled = false
    const pending = movies.filter((m) => !m.posterUrl)
    if (pending.length === 0) return

    resolvePosters(pending, (uri, posterUrl) => {
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
  }, [movies])

  async function handleUpload(watched: File, ratings: File) {
    try {
      const built = await buildMovies(watched, ratings)
      saveMovies(built)
      setMovies(built)
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Failed to parse CSV files.',
        'error',
      )
    }
  }

  function handleReupload() {
    clearMovies()
    setMovies(null)
  }

  // Wipe the poster cache and clear every resolved poster so the resolution
  // effect re-queries TMDB for the whole list from scratch.
  function handleRefreshPosters() {
    clearPosterCache()
    setMovies((prev) =>
      prev ? prev.map((m) => ({ ...m, posterUrl: null })) : prev,
    )
    showToast('Refreshing posters…', 'success')
  }

  return (
    <>
      {!movies ? (
        <UploadScreen onSubmit={handleUpload} />
      ) : (
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

          </header>

          <Histogram groups={groups} mode={mode} />

          <main className="rows">
            {groups.map((group) => (
              <YearRow key={group.key} group={group} />
            ))}
          </main>

          <footer className="app-footer">
            <button className="link-btn" onClick={handleRefreshPosters}>
              ↻ Refresh posters
            </button>
            <span className="tmdb-credit">
              This product uses the TMDB API but is not endorsed or certified by
              TMDB.
            </span>
          </footer>
        </div>
      )}

      <Toaster />
    </>
  )
}
