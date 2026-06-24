import type { Movie } from '../types'

const KEY = 'movies:v1'

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
}
