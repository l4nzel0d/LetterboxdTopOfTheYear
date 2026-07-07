import { showToast } from './toast'
import type { Movie } from '../types'

const SEARCH_MOVIE_URL = 'https://api.themoviedb.org/3/search/movie'
const SEARCH_TV_URL = 'https://api.themoviedb.org/3/search/tv'
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

/**
 * Drop every cached poster lookup (hits and `__miss__` sentinels alike) so the
 * next `resolvePosters` re-queries TMDB from scratch. Used by the manual
 * "refresh posters" action.
 */
export function clearPosterCache(): void {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(CACHE_PREFIX)) keys.push(key)
  }
  for (const key of keys) localStorage.removeItem(key)
}

function readCache(name: string, year: number | null): string | null | undefined {
  const raw = localStorage.getItem(cacheKey(name, year))
  if (raw == null) return undefined // never looked up
  return raw === MISS ? null : raw // null = looked up, no poster
}

function writeCache(name: string, year: number | null, url: string | null): void {
  localStorage.setItem(cacheKey(name, year), url ?? MISS)
}

/** A single TMDB search hit, across movie (`title`) and TV (`name`) shapes. */
interface SearchResult {
  poster_path?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
}

/**
 * Outcome of one TMDB search:
 *  - `found`: a result whose title exactly matches the query has a poster.
 *  - `fuzzy`: no exact-title match, but some result has a poster (best guess).
 *  - `none`:  reached TMDB, no result had a poster at all.
 *  - `error`: network/HTTP failure (toast already surfaced).
 */
type SearchOutcome =
  | { status: 'found'; url: string }
  | { status: 'fuzzy'; url: string }
  | { status: 'none' }
  | { status: 'error' }

/** Normalize a title for comparison: strip diacritics/punctuation, fold case, collapse spaces. */
function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Every title-ish field on a result (English + original, movie + TV). */
function titlesOf(r: SearchResult): string[] {
  return [r.title, r.name, r.original_title, r.original_name].filter(
    (t): t is string => typeof t === 'string',
  )
}

/** Run a single search endpoint (movie or TV) and classify the result. */
async function search(
  apiKey: string,
  endpoint: string,
  name: string,
  year: number | null,
  yearParam: string,
): Promise<SearchOutcome> {
  const params = new URLSearchParams({ api_key: apiKey, query: name })
  if (year != null) params.set(yearParam, String(year))

  let res: Response
  try {
    res = await fetch(`${endpoint}?${params}`)
  } catch {
    // Network failure: surface it (deduped to one toast) and don't cache, so a
    // later attempt can retry once connectivity is back.
    showToast("Couldn't reach TMDB to load posters.", 'error')
    return { status: 'error' }
  }

  if (!res.ok) {
    // 401 means a bad key, which key validation already reports — don't repeat
    // it here. Other non-ok responses (rate limits, outages) are transient, so
    // report them and skip caching so they can retry.
    if (res.status !== 401) {
      showToast('TMDB had trouble loading posters. Some may be missing.', 'error')
    }
    return { status: 'error' }
  }

  try {
    const data = (await res.json()) as { results?: SearchResult[] }
    const results = (data.results ?? []).filter((r) => r.poster_path)
    if (results.length === 0) return { status: 'none' }

    // Prefer a result whose title actually matches the query — TMDB's fuzzy
    // search otherwise lets e.g. "Shogun" match "Shogun's Samurai".
    const q = normalizeTitle(name)
    const exact = results.find((r) => titlesOf(r).some((t) => normalizeTitle(t) === q))
    const path = exact?.poster_path ?? results[0].poster_path
    return {
      status: exact ? 'found' : 'fuzzy',
      url: `${IMG_BASE}${path}`,
    }
  } catch {
    return { status: 'error' }
  }
}

/**
 * Resolve a single poster URL, consulting the cache first. Returns null on miss.
 * Searches movies first, then TV so miniseries/shows that Letterboxd logs (e.g.
 * limited series) resolve too. An exact-title match on either wins; only if
 * neither has one do we fall back to a fuzzy best-guess poster.
 */
async function fetchPoster(
  apiKey: string,
  name: string,
  year: number | null,
): Promise<string | null> {
  const cached = readCache(name, year)
  if (cached !== undefined) return cached

  const movie = await search(apiKey, SEARCH_MOVIE_URL, name, year, 'year')
  if (movie.status === 'error') return null // transient — don't cache, allow retry
  if (movie.status === 'found') {
    writeCache(name, year, movie.url)
    return movie.url
  }

  // No exact movie match: try TV (year lives in first_air_date there).
  const tv = await search(apiKey, SEARCH_TV_URL, name, year, 'first_air_date_year')
  if (tv.status === 'error') return null
  if (tv.status === 'found') {
    writeCache(name, year, tv.url)
    return tv.url
  }

  // Neither index had an exact-title match. Fall back to a fuzzy poster if one
  // exists (movie preferred over TV), otherwise a confirmed miss.
  const url =
    movie.status === 'fuzzy'
      ? movie.url
      : tv.status === 'fuzzy'
        ? tv.url
        : null

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
