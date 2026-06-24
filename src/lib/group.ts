import type { GroupMode, Movie, MovieGroup } from '../types'

/** Highest rating first; unrated films sink to the end, then alphabetical. */
function compareMovies(a: Movie, b: Movie): number {
  const ra = a.rating ?? -1
  const rb = b.rating ?? -1
  if (ra !== rb) return rb - ra
  return a.name.localeCompare(b.name)
}

/**
 * Bucket movies by year or decade and sort within each bucket. Groups are
 * returned newest-first. Movies with no year are skipped.
 */
export function groupMovies(movies: Movie[], mode: GroupMode): MovieGroup[] {
  const step = mode === 'decade' ? 10 : 1
  const buckets = new Map<number, Movie[]>()

  for (const movie of movies) {
    if (movie.year == null) continue
    const key = mode === 'decade' ? Math.floor(movie.year / 10) * 10 : movie.year
    const bucket = buckets.get(key)
    if (bucket) bucket.push(movie)
    else buckets.set(key, [movie])
  }

  if (buckets.size === 0) return []

  const keys = [...buckets.keys()]
  const min = Math.min(...keys)
  const max = Math.max(...keys)

  // Walk newest -> oldest in fixed steps so every year/decade in range gets a
  // group, including empty ones. Bounding to the film years means the first and
  // last groups always contain at least one movie.
  const groups: MovieGroup[] = []
  for (let key = max; key >= min; key -= step) {
    const list = buckets.get(key) ?? []
    groups.push({
      key,
      label: mode === 'decade' ? `${key}s` : String(key),
      movies: list.sort(compareMovies),
    })
  }
  return groups
}
