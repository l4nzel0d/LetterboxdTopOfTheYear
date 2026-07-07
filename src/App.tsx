import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiKeyScreen } from './components/ApiKeyScreen'
import { Histogram } from './components/Histogram'
import { Toaster } from './components/Toaster'
import { UploadScreen } from './components/UploadScreen'
import { YearRow } from './components/YearRow'
import { buildMovies } from './lib/csv'
import { groupMovies } from './lib/group'
import { clearMovies, loadMovies, saveMovies } from './lib/storage'
import { showToast } from './lib/toast'
import {
  clearPosterCache,
  getApiKey,
  resolvePosters,
  setApiKey,
  validateApiKey,
} from './lib/tmdb'
import type { GroupMode, Movie } from './types'

export default function App() {
  // Restore a previously uploaded list so reloads skip the upload step.
  const [movies, setMovies] = useState<Movie[] | null>(() => loadMovies())
  const [mode, setMode] = useState<GroupMode>('year')
  const [apiKey, setKey] = useState(getApiKey())
  // After a fresh upload we pause on the key-entry step; reloads with a stored
  // list (or an already-saved key) go straight to the grid.
  const [phase, setPhase] = useState<'apikey' | 'grid'>('grid')
  // Seed with the stored key so we don't re-validate (and re-toast) it on every
  // reload — only a key the user actually changes gets checked.
  const lastCheckedKey = useRef<string>(getApiKey().trim())

  const groups = useMemo(
    () => (movies ? groupMovies(movies, mode) : []),
    [movies, mode],
  )

  // Validate a newly entered key against TMDB and toast the outcome. Debounced
  // so we check once the user stops typing/pasting rather than per keystroke.
  useEffect(() => {
    const key = apiKey.trim()
    if (!key || key === lastCheckedKey.current) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await validateApiKey(key)
      if (cancelled) return
      lastCheckedKey.current = key
      if (result === 'valid') showToast('TMDB API key accepted.', 'success')
      else if (result === 'invalid') showToast('Invalid TMDB API key.', 'error')
      else showToast("Couldn't reach TMDB to verify the key.", 'error')
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [apiKey])

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
    try {
      const built = await buildMovies(watched, ratings)
      saveMovies(built)
      setMovies(built)
      // Prompt for a key next, unless one is already saved.
      setPhase(getApiKey().trim() ? 'grid' : 'apikey')
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Failed to parse CSV files.',
        'error',
      )
    }
  }

  function handleKeyContinue(key: string) {
    if (key) handleKeyChange(key)
    setPhase('grid')
  }

  function handleReupload() {
    clearMovies()
    setMovies(null)
  }

  // Wipe the poster cache and clear every resolved poster so the resolution
  // effect re-queries TMDB for the whole list from scratch.
  function handleRefreshPosters() {
    if (!apiKey.trim()) {
      showToast('Add a TMDB API key to load posters.', 'error')
      return
    }
    clearPosterCache()
    setMovies((prev) =>
      prev ? prev.map((m) => ({ ...m, posterUrl: null })) : prev,
    )
    showToast('Refreshing posters…', 'success')
  }

  function handleKeyChange(value: string) {
    setKey(value)
    setApiKey(value)
  }

  return (
    <>
      {!movies ? (
        <UploadScreen onSubmit={handleUpload} />
      ) : phase === 'apikey' ? (
        <ApiKeyScreen onContinue={handleKeyContinue} />
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

            <input
              className="key-input"
              type="password"
              placeholder="TMDB API key (for posters)"
              value={apiKey}
              onChange={(e) => handleKeyChange(e.target.value)}
            />
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
          </footer>
        </div>
      )}

      <Toaster />
    </>
  )
}
