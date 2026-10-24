import { useEffect, useMemo, useState } from 'react'
import { Histogram } from './components/Histogram'
import { Toaster } from './components/Toaster'
import { UploadScreen } from './components/UploadScreen'
import { YearRow } from './components/YearRow'
import { buildMovies, buildWatchlist } from './lib/csv'
import { groupMovies } from './lib/group'
import {
  clearMovies,
  loadMovies,
  loadWatchlist,
  saveMovies,
  saveWatchlist,
} from './lib/storage'
import { showToast } from './lib/toast'
import { clearPosterCache, resolvePosters } from './lib/tmdb'
import type { GroupMode, Movie, WatchlistItem } from './types'

export default function App() {
  // Restore a previously uploaded list so reloads skip the upload step.
  const [movies, setMovies] = useState<Movie[] | null>(() => loadMovies())
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() =>
    loadWatchlist(),
  )
  const [mode, setMode] = useState<GroupMode>('year')
  const [gapsOnly, setGapsOnly] = useState(false)

  const groups = useMemo(
    () => (movies ? groupMovies(movies, mode, watchlist) : []),
    [movies, mode, watchlist],
  )

  // "Gaps only" is a year-mode view: a decade with zero films is too rare to filter on.
  const showGapsOnly = gapsOnly && mode === 'year'
  const visibleGroups = showGapsOnly
    ? groups.filter((g) => g.movies.length === 0)
    : groups

  // Resolve posters whenever we have movies. The key lives server-side behind
  // the /api/tmdb proxy, so there's nothing to ask the user for; cached lookups
  // make repeat runs effectively free. Watchlist posters are only needed for
  // years with nothing watched, since those are the only ones rendered.
  useEffect(() => {
    if (!movies) return
    let cancelled = false
    const watchedYears = new Set(movies.map((m) => m.year))
    const pending = [
      ...movies,
      ...watchlist.filter((w) => !watchedYears.has(w.year)),
    ].filter((m) => !m.posterUrl)
    if (pending.length === 0) return

    resolvePosters(pending, (uri, posterUrl) => {
      if (cancelled || !posterUrl) return
      // URIs are disjoint between the two lists, so patching both is safe.
      setMovies((prev) =>
        prev
          ? prev.map((m) => (m.uri === uri ? { ...m, posterUrl } : m))
          : prev,
      )
      setWatchlist((prev) =>
        prev.map((w) => (w.uri === uri ? { ...w, posterUrl } : w)),
      )
    })

    return () => {
      cancelled = true
    }
  }, [movies, watchlist])

  async function handleUpload(
    watched: File,
    ratings: File,
    watchlistFile: File | null,
  ) {
    try {
      const built = await buildMovies(watched, ratings)
      const builtWatchlist = watchlistFile
        ? await buildWatchlist(watchlistFile, built)
        : []
      saveMovies(built)
      saveWatchlist(builtWatchlist)
      setMovies(built)
      setWatchlist(builtWatchlist)
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
    setWatchlist([])
    setGapsOnly(false)
  }

  // Wipe the poster cache and clear every resolved poster so the resolution
  // effect re-queries TMDB for the whole list from scratch.
  function handleRefreshPosters() {
    clearPosterCache()
    setMovies((prev) =>
      prev ? prev.map((m) => ({ ...m, posterUrl: null })) : prev,
    )
    setWatchlist((prev) => prev.map((w) => ({ ...w, posterUrl: null })))
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
              <div className="toggle">
                <button
                  className={showGapsOnly ? 'active' : ''}
                  disabled={mode !== 'year'}
                  title={
                    mode === 'year'
                      ? 'Show only years with no watched films'
                      : 'Available when grouping by year'
                  }
                  onClick={() => setGapsOnly((v) => !v)}
                >
                  Gaps only
                </button>
              </div>
            </div>

          </header>

          <Histogram groups={groups} mode={mode} />

          <main className="rows">
            {visibleGroups.map((group) => (
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
