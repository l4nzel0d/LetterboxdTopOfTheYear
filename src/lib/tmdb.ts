import { showToast } from './toast'
import type { Movie } from '../types'

const SEARCH_URL = 'https://api.themoviedb.org/3/search/movie'
const CONFIG_URL = 'https://api.themoviedb.org/3/configuration'
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

export type KeyCheck = 'valid' | 'invalid' | 'unreachable'

/**
 * Check an API key against TMDB without side effects. `configuration` requires
 * a valid key, so a 200 means accepted and a 401 means rejected; anything else
 * (network failure, outage) is reported as unreachable rather than invalid.
 */
export async function validateApiKey(apiKey: string): Promise<KeyCheck> {
  try {
    const res = await fetch(`${CONFIG_URL}?api_key=${encodeURIComponent(apiKey)}`)
    if (res.ok) return 'valid'
    if (res.status === 401) return 'invalid'
    return 'unreachable'
  } catch {
    return 'unreachable'
  }
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

  let res: Response
  try {
    res = await fetch(`${SEARCH_URL}?${params}`)
  } catch {
    // Network failure: surface it (deduped to one toast) and don't cache, so a
    // later attempt can retry once connectivity is back.
    showToast("Couldn't reach TMDB to load posters.", 'error')
    return null
  }

  if (!res.ok) {
    // 401 means a bad key, which key validation already reports — don't repeat
    // it here. Other non-ok responses (rate limits, outages) are transient, so
    // report them and skip caching so they can retry.
    if (res.status !== 401) {
      showToast('TMDB had trouble loading posters. Some may be missing.', 'error')
    }
    return null
  }

  let url: string | null = null
  try {
    const data = (await res.json()) as { results?: { poster_path?: string }[] }
    const path = data.results?.find((r) => r.poster_path)?.poster_path
    if (path) url = `${IMG_BASE}${path}`
  } catch {
    return null
  }

  // Cache only confirmed lookups (a real URL or a genuine "no poster"); errors
  // above bail out before here so a transient failure never poisons the cache.
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
