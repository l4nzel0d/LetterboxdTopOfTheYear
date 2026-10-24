import type { Movie, WatchlistItem } from '../types'

const KEY = 'movies:v1'
const WATCHLIST_KEY = 'watchlist:v1'

/** Restore the previously uploaded movie list, or null if none/invalid. */
export function loadMovies(): Movie[] | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return Array.isArray(data) ? (data as Movie[]) : null
  } catch {
    return null
  }
}

export function saveMovies(movies: Movie[]): void {
  try {
    // Posters are re-resolved from the TMDB cache on load, so persist only the
    // core fields and keep the payload small.
    const slim: Movie[] = movies.map(({ uri, name, year, rating }) => ({
      uri,
      name,
      year,
      rating,
      posterUrl: null,
    }))
    localStorage.setItem(KEY, JSON.stringify(slim))
  } catch {
    // Ignore quota/serialization errors — persistence is best-effort.
  }
}

export function clearMovies(): void {
  localStorage.removeItem(KEY)
  localStorage.removeItem(WATCHLIST_KEY)
}

/** Restore the previously uploaded watchlist, or an empty list if none/invalid. */
export function loadWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY)
    if (!raw) return []
    const data = JSON.parse(raw)
    return Array.isArray(data) ? (data as WatchlistItem[]) : []
  } catch {
    return []
  }
}

export function saveWatchlist(items: WatchlistItem[]): void {
  try {
    if (items.length === 0) {
      localStorage.removeItem(WATCHLIST_KEY)
      return
    }
    // Posters re-resolve from the TMDB cache on load, as with movies.
    const slim: WatchlistItem[] = items.map(
      ({ uri, name, year, dateAdded }) => ({
        uri,
        name,
        year,
        rating: null,
        posterUrl: null,
        dateAdded,
      }),
    )
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(slim))
  } catch {
    // Ignore quota/serialization errors — persistence is best-effort.
  }
}
