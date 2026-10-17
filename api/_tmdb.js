const TMDB_BASE = 'https://api.themoviedb.org/3'

/**
 * The only endpoints the client needs. The proxy signs every request with our
 * own key, so an open-ended passthrough would let anyone drive the whole TMDB
 * API on our quota.
 */
const ALLOWED_PATHS = new Set(['search/movie', 'search/tv'])

/**
 * Forward one read-only TMDB request, signing it with a server-side key.
 *
 * Returns `{ status, body }` instead of throwing: an upstream failure is a
 * response to pass along, not an exception. Shared by the Vercel function
 * (`api/tmdb.js`) and the Vite dev middleware so local dev and production
 * can't drift apart.
 *
 * @param {string} path                 TMDB path, e.g. `search/movie`
 * @param {URLSearchParams} params      query params from the caller
 * @param {string | undefined} apiKey   server-side TMDB key
 */
export async function proxyTmdb(path, params, apiKey) {
  if (!apiKey) {
    // No key configured on this host. The client turns this into a single
    // "posters unavailable" toast rather than one error per film.
    return { status: 503, body: { error: 'posters_unconfigured' } }
  }
  if (!ALLOWED_PATHS.has(path)) {
    return { status: 400, body: { error: 'unsupported_path' } }
  }

  // Overwrite rather than append, so a caller-supplied key is never honoured.
  params.set('api_key', apiKey)

  try {
    const res = await fetch(`${TMDB_BASE}/${path}?${params}`)
    if (res.status === 401) {
      // The configured key was rejected. That's a deployment problem, not a
      // transient one, so report it like a missing key rather than letting the
      // client suggest the user retry.
      return { status: 503, body: { error: 'posters_unconfigured' } }
    }
    return { status: res.status, body: await res.json() }
  } catch {
    return { status: 502, body: { error: 'tmdb_unreachable' } }
  }
}
