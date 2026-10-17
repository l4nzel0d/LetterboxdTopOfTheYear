import { proxyTmdb } from './_tmdb.js'

/**
 * GET /api/tmdb?path=search/movie&query=Dune&year=2021
 *
 * Same-origin proxy for TMDB search that keeps the API key on the server: it
 * lives in the `TMDB_API_KEY` environment variable (Vercel project settings,
 * or `.env.local` in dev) and is never shipped to the browser. Poster *images*
 * need no key, so the client still loads those straight from image.tmdb.org.
 */
export default {
  async fetch(request) {
    const url = new URL(request.url)
    const path = url.searchParams.get('path') ?? ''
    url.searchParams.delete('path')

    const { status, body } = await proxyTmdb(
      path,
      url.searchParams,
      process.env.TMDB_API_KEY,
    )

    return Response.json(body, {
      status,
      // Let Vercel's CDN absorb lookups repeated across visitors; a single
      // visitor's repeats are already served from their localStorage cache.
      headers:
        status === 200 ? { 'Cache-Control': 'public, s-maxage=86400' } : {},
    })
  },
}
