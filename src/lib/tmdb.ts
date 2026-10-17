import { showToast } from './toast'
import type { Movie } from '../types'

/**
 * Same-origin proxy (`api/tmdb.js`) that signs TMDB search requests with a
 * server-side key, so no key ever reaches the browser. Poster *images* need no
 * key, so those still come straight from TMDB.
 */
const PROXY_URL = '/api/tmdb'
const SEARCH_MOVIE_PATH = 'search/movie'
const SEARCH_TV_PATH = 'search/tv'
const IMG_BASE = 'https://image.tmdb.org/t/p/w342'
const CACHE_PREFIX = 'tmdb:poster:'

/** Sentinel stored in the cache for a confirmed "no poster found" so we don't re-query. */
const MISS = '__miss__'

// Posters used to need a key the user pasted in, kept in localStorage. One-time
// cleanup so returning visitors don't keep a stale secret in their browser.
try {
  localStorage.removeItem('tmdb:apiKey')
} catch {
  // Best-effort: a blocked localStorage just means there's nothing to clean up.
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

/** Run a single search endpoint (movie or TV) through the proxy and classify the result. */
async function search(
  path: string,
  name: string,
  year: number | null,
  yearParam: string,
): Promise<SearchOutcome> {
  const params = new URLSearchParams({ path, query: name })
  if (year != null) params.set(yearParam, String(year))

  let res: Response
  try {
    res = await fetch(`${PROXY_URL}?${params}`)
  } catch {
    // Network failure: surface it (deduped to one toast) and don't cache, so a
    // later attempt can retry once connectivity is back.
    showToast("Couldn't reach TMDB to load posters.", 'error')
    return { status: 'error' }
  }

  if (!res.ok) {
    // 503 means this host has no TMDB key configured, so posters simply aren't
    // available here — one standing message, not a transient hiccup. Anything
    // else (rate limits, outages) can clear up, so report it and skip caching
    // so it can retry. Both toasts are deduped by `lib/toast.ts`, which keeps a
    // burst of concurrent failures from stacking.
    if (res.status === 503) {
      showToast('Posters are unavailable right now.', 'error')
    } else {
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
    const posterPath = exact?.poster_path ?? results[0].poster_path
    return {
      status: exact ? 'found' : 'fuzzy',
      url: `${IMG_BASE}${posterPath}`,
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
async function fetchPoster(name: string, year: number | null): Promise<string | null> {
  const cached = readCache(name, year)
  if (cached !== undefined) return cached

  const movie = await search(SEARCH_MOVIE_PATH, name, year, 'year')
  if (movie.status === 'error') return null // transient — don't cache, allow retry
  if (movie.status === 'found') {
    writeCache(name, year, movie.url)
    return movie.url
  }

  // No exact movie match: try TV (year lives in first_air_date there).
  const tv = await search(SEARCH_TV_PATH, name, year, 'first_air_date_year')
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
  onResolve: (uri: string, posterUrl: string | null) => void,
  concurrency = 8,
): Promise<void> {
  const queue = [...movies]

  const worker = async () => {
    while (queue.length) {
      const movie = queue.shift()!
      const url = await fetchPoster(movie.name, movie.year)
      onResolve(movie.uri, url)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, worker),
  )
}
