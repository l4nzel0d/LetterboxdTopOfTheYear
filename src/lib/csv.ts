import Papa from 'papaparse'
import type { Movie } from '../types'

/** Shape of a row in either Letterboxd export; Rating is only present in ratings.csv. */
interface RawRow {
  Date?: string
  Name?: string
  Year?: string
  'Letterboxd URI'?: string
  Rating?: string
}

function parse(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => resolve(result.data),
      error: reject,
    })
  })
}

/**
 * Merge a Letterboxd `watched.csv` (the full diary) with `ratings.csv` (the
 * rated subset). Watched is the master list; ratings contribute a score where
 * the Letterboxd URI matches. Films that appear only in ratings are still
 * included, so a stray rated-but-not-watched entry is never dropped.
 */
export async function buildMovies(
  watchedFile: File,
  ratingsFile: File,
): Promise<Movie[]> {
  const [watched, ratings] = await Promise.all([
    parse(watchedFile),
    parse(ratingsFile),
  ])

  const ratingByUri = new Map<string, number>()
  for (const row of ratings) {
    const uri = row['Letterboxd URI']?.trim()
    const rating = row.Rating ? Number(row.Rating) : NaN
    if (uri && !Number.isNaN(rating)) ratingByUri.set(uri, rating)
  }

  const byUri = new Map<string, Movie>()

  const ingest = (row: RawRow) => {
    const uri = row['Letterboxd URI']?.trim()
    const name = row.Name?.trim()
    if (!uri || !name) return
    if (byUri.has(uri)) return
    const year = row.Year ? Number(row.Year) : NaN
    byUri.set(uri, {
      uri,
      name,
      year: Number.isNaN(year) ? null : year,
      rating: ratingByUri.has(uri) ? ratingByUri.get(uri)! : null,
      posterUrl: null,
    })
  }

  // Watched first so it defines the canonical entries, then any ratings-only rows.
  watched.forEach(ingest)
  ratings.forEach(ingest)

  return [...byUri.values()]
}
