# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (binds IPv6 ::1 by default)
npm run build    # tsc -b (type-check) then vite build -> dist/
npm run preview  # serve the production build
```

There is no test runner or linter configured. `npm run build` is the only gate — it type-checks (`tsc -b`) before bundling, so a failing type-check fails the build. For a fast type-check without bundling, run `npx tsc --noEmit`.

Posters in dev need a key: put `TMDB_API_KEY=<key>` in `.env.local` (gitignored). Without it `/api/tmdb` answers `503` and the app runs poster-less. `npm run dev` serves the proxy itself, so the Vercel CLI is not required.

Dev server access note: Vite binds `::1` (IPv6) only, which `curl`/PowerShell on Windows often can't reach. **Always start it with `npm run dev -- --host 127.0.0.1`, not plain `npm run dev`**, so it is reachable over IPv4.

## Big picture

A Vite + React 18 + TypeScript SPA that turns two Letterboxd CSV exports into a poster wall grouped by year or decade. **All user data stays in the browser** — CSVs are parsed in-memory and results live in `localStorage`; nothing about a user's library is ever sent anywhere. The only server-side piece is a thin TMDB proxy (step 5) that exists purely so the API key isn't published to every visitor.

Data flows in one direction through `src/lib/`, then into components:

1. **`lib/csv.ts` — `buildMovies(watched, ratings)`**: Parses both Letterboxd CSVs (PapaParse) and merges them by `Letterboxd URI` (the unique join key). `watched.csv` is the master list; `ratings.csv` only contributes a score. Films present only in ratings are still kept. Produces `Movie[]`.
2. **`lib/storage.ts`**: Persists the `Movie[]` to `localStorage` (`movies:v1`) so reloads skip the upload screen. **Posters are deliberately stored as `null`** — they re-resolve from the TMDB cache on load to keep the payload small.
3. **`lib/group.ts` — `groupMovies(movies, mode)`**: Buckets by year or decade and **gap-fills** every year/decade between the min and max film year (so empty groups render too). Bounding to actual film years guarantees the first and last groups are non-empty. Within a group, sorted by rating desc, unrated last, then alphabetical. Returns newest-first.
4. **`lib/tmdb.ts` — `resolvePosters(...)`**: Resolves posters via the same-origin `/api/tmdb` proxy (which signs each request with the server-side key) with bounded concurrency (default 8) and a progressive `onResolve` callback, so cards fill in as results arrive rather than all at once. Every lookup (including confirmed misses, via a `__miss__` sentinel) is cached in `localStorage` keyed by `name|year`, so re-runs are effectively free.
5. **`api/tmdb.js` + `api/_tmdb.js`** (outside `src/`, not part of the Vite build): a Vercel Function that forwards `search/movie` and `search/tv` to TMDB with the key read at request time from `process.env.TMDB_API_KEY`. `_tmdb.js` holds the shared `proxyTmdb()` helper — the leading `_` is what keeps Vercel from also turning it into an endpoint. `vite.config.ts` mounts the *same* helper as dev middleware, because Vite's dev server does not execute `api/`.

**Watchlist (optional third CSV).** `buildWatchlist` in `lib/csv.ts` parses `watchlist.csv` into `WatchlistItem[]` (a `Movie` plus `dateAdded`, so `MovieCard` and `resolvePosters` are reused), dropping films already watched and rows with no year. It persists separately under `watchlist:v1` (cleared together with `movies:v1`). `groupMovies` attaches `group.watchlist` per bucket but **never widens the min/max bounds**, which stay on watched films only. `YearRow` renders watchlist films as `ghost` cards only when a group has zero watched films. `App` resolves posters only for watchlist items in years with nothing watched, and the "Gaps only" filter applies in year mode only (the histogram still gets all groups).

`App.tsx` is the orchestrator: it restores movies on mount, memoizes `groupMovies`, and runs a poster-resolution effect whenever movies are present (re-running cheaply thanks to the cache).

## Conventions that aren't obvious from a single file

- **The TMDB API key is server-side and must stay that way.** It lives in the unprefixed `TMDB_API_KEY` env var — Vercel project settings in production, `.env.local` (already gitignored via `*.local`) in dev — and is read only inside `api/_tmdb.js` and the dev middleware. **Never move it to a `VITE_`-prefixed variable**: Vite statically inlines `VITE_*` values into the production bundle, which would publish the key in `dist/assets/*.js` and make rotation require a rebuild. The client has no key-entry path at all any more; `fetch` targets the relative `/api/tmdb`, never `api.themoviedb.org`. Poster *images* (`image.tmdb.org`) need no key and are still fetched directly.

- **The proxy is an allowlist, not a passthrough.** `ALLOWED_PATHS` in `api/_tmdb.js` is deliberately limited to the two search endpoints, and the handler overwrites any caller-supplied `api_key`. The endpoint is public, so widening it hands strangers our TMDB quota. A missing server key returns `503`, which the client surfaces as one standing "Posters are unavailable right now." toast rather than an error per film.

- **Tooltips are portalled to `document.body` with `position: fixed`, positioned imperatively.** Card hover tooltips (`MovieCard.tsx`), histogram bar tooltips (`Histogram.tsx`, year mode only — decade bars show their count in place via `.hist-count` on hover instead), and the rating-breakdown tooltip on group titles (`YearRow.tsx`) all use the same pattern: `createPortal` to `body`, then a `place()`/`recompute()` callback that reads `getBoundingClientRect()` + the tooltip's measured `offsetWidth`, clamps to the viewport, and re-runs on capture-phase `scroll` (third arg `true`, to catch nested scroll containers) and `resize`. This exists specifically to escape the swipers' `overflow: auto` clipping — keep new tooltips on this pattern rather than CSS-positioned children.

- **Swipers reset `scrollLeft` in `useLayoutEffect` + a `requestAnimationFrame`.** The browser restores nested scroll-container positions on reload; the double reset (now, then next frame) overrides that. `YearRow` resets to 0 (leftmost); `Histogram` resets to `scrollWidth` (rightmost / newest). If you add a scroll container, replicate this or it will land mid-scroll on reload.

- **Histogram bar height constant `BAR_AREA` (150) must stay in sync with CSS `.hist-bar-area` height *and* `.hist-grid` height (both 150px).** They are coupled by hand; the milestone lines are positioned with `bottom: (m / max) * BAR_AREA`, so a mismatch misaligns the lines against the bars.

- **Histogram milestone lines** (`.hist-grid` / `.hist-line`, a pointer-transparent layer inside the position-relative `.hist-track`, behind the bars): year mode draws a dashed line every `YEAR_STEP` (10) films strictly below the tallest bar; decade mode draws one at `DECADE_FIRST` (10) then every `DECADE_STEP` (50) up to and including the tallest. Labels are `position: sticky` so they stay visible while the histogram scrolls. In decade mode the track fills the swiper-width area (`min-width: 100%`, columns `flex: 1 0 72px`) and scrolls only once columns hit their minimum. Zero-film groups get an `.is-empty` stub bar.

- **Group rows carry `id={`group-${group.key}`}`** so the histogram can `scrollIntoView` the matching row on bar click. The key is the year (e.g. `2024`) or decade-start year (e.g. `2020`), matching the histogram bar keys in either mode.

- **Ratings are half-stars** (0.5–5 in 0.5 steps) or `null`. Sort treats `null` as `-1`. UI that summarizes ratings uses a fixed half-star scale.

- **Toasts go through a module-level pub/sub (`lib/toast.ts`), not React state/props.** Call `showToast(message, kind)` from anywhere — including library code like `tmdb.ts` — and the single `<Toaster />` (rendered once at the `App` root, portalled to body, bottom-right) picks it up via `subscribeToasts`. Identical message+kind toasts are **de-duplicated** (the existing timer just restarts), which is what keeps a burst of concurrent poster-fetch failures from stacking. Use this channel for new notifications rather than threading error state through props. Note `tmdb.ts` deliberately distinguishes a `503` from the proxy (one standing "posters unavailable" message) from other HTTP failures (transient, "some may be missing"), and treats a "no poster found" result as a non-error rather than a failure.

## Hosting

**No longer pure-static**: posters depend on the `api/tmdb.js` serverless function, so the app needs a host that runs it. Vercel works at the root with no config — it auto-detects the Vite preset for `dist/` and picks up `api/` in the same deployment, no `vercel.json` needed. Set `TMDB_API_KEY` in Project → Settings → Environment Variables (mark it Sensitive for Production/Preview) and redeploy; env var changes only apply to *new* deployments. The key can then be rotated from the dashboard with no code change or rebuild.

The build itself still contains no secrets, so the static output can go anywhere — but on a host without serverless functions (GitHub Pages, `file://`) every `/api/tmdb` call 404s and cards fall back to titles only, with no way for a visitor to supply their own key. For GitHub Pages (served under a subpath) you would also need `base: '/LetterboxdTopOfTheYear/'` in `vite.config.ts`. There is no client-side router, so no SPA 404-rewrite is needed.
