export interface Movie {
  /** Canonical Letterboxd short URL, used as the join key between the two CSVs. */
  uri: string
  name: string
  year: number | null
  /** 0.5–5 in half-star steps, or null if the film was watched but never rated. */
  rating: number | null
  /** Resolved TMDB poster URL, or null until/unless one is found. */
  posterUrl: string | null
}

/** A group of movies sharing a year (or a decade), already sorted. */
export interface MovieGroup {
  /** Display label, e.g. "2024" or "2020s". */
  label: string
  /** Numeric key used for descending sort of the groups themselves. */
  key: number
  movies: Movie[]
}

export type GroupMode = 'year' | 'decade'
