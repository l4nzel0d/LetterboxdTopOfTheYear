import type { Movie } from '../types'

const SEARCH_URL = 'https://api.themoviedb.org/3/search/movie'
const IMG_BASE = 'https://image.tmdb.org/t/p/w342'
const CACHE_PREFIX = 'tmdb:poster:'
const KEY_STORAGE = 'tmdb:apiKey'

/** Sentinel stored in the cache for a confirmed "no poster found" so we don't re-query. */
const MISS = '__miss__'

export function getApiKey(): string {
  return localStorage.getItem(KEY_STORAGE) ?? ''
}

export function setApiKey(key: string): void {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim())
  else localStorage.removeItem(KEY_STORAGE)
}

function cacheKey(name: string, year: number | null): string {
  return `${CACHE_PREFIX}${name.toLowerCase()}|${year ?? ''}`
}

function readCache(name: string, year: number | null): string | null | undefined {
  const raw = localStorage.getItem(cacheKey(name, year))
  if (raw == null) return undefined // never looked up
  return raw === MISS ? null : raw // null = looked up, no poster
}

function writeCache(name: string, year: number | null, url: string | null): void {
  localStorage.setItem(cacheKey(name, year), url ?? MISS)
}

/** Resolve a single poster URL, consulting the cache first. Returns null on miss. */
async function fetchPoster(
  apiKey: string,
  name: string,
  year: number | null,
): Promise<string | null> {
  const cached = readCache(name, year)
  if (cached !== undefined) return cached

  const params = new URLSearchParams({ api_key: apiKey, query: name })
  if (year != null) params.set('year', String(year))

  let url: string | null = null
  try {
    const res = await fetch(`${SEARCH_URL}?${params}`)
    if (res.ok) {
      const data = (await res.json()) as { results?: { poster_path?: string }[] }
      const path = data.results?.find((r) => r.poster_path)?.poster_path
      if (path) url = `${IMG_BASE}${path}`
    }
  } catch {
    // Network/parse failure: don't cache, so a later attempt can retry.
    return null
  }

  writeCache(name, year, url)
  return url
}

/**
 * Resolve posters for many movies with bounded concurrency. Calls `onResolve`
 * as each poster comes in so the UI can fill cards progressively rather than
 * waiting for the whole batch.
 */
export async function resolvePosters(
  movies: Movie[],
  apiKey: string,
  onResolve: (uri: string, posterUrl: string | null) => void,
  concurrency = 8,
): Promise<void> {
  const queue = [...movies]

  const worker = async () => {
    while (queue.length) {
      const movie = queue.shift()!
      const url = await fetchPoster(apiKey, movie.name, movie.year)
      onResolve(movie.uri, url)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker),
  )
}
