# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Vite dev server (binds IPv6 ::1 by default)
npm run build    # tsc -b (type-check) then vite build -> dist/
npm run preview  # serve the production build
```

There is no test runner or linter configured. `npm run build` is the only gate — it type-checks (`tsc -b`) before bundling, so a failing type-check fails the build. For a fast type-check without bundling, run `npx tsc --noEmit`.

Dev server access note: Vite binds `::1` (IPv6) only, which `curl`/PowerShell on Windows often can't reach. To hit it over IPv4, run `npm run dev -- --host 127.0.0.1`.

## Big picture

A client-side-only SPA (Vite + React 18 + TypeScript) that turns two Letterboxd CSV exports into a poster wall grouped by year or decade. There is **no backend** — all data lives in the browser (uploaded files parsed in-memory, results in `localStorage`). This is what makes it deployable to any static host.

Data flows in one direction through `src/lib/`, then into components:

1. **`lib/csv.ts` — `buildMovies(watched, ratings)`**: Parses both Letterboxd CSVs (PapaParse) and merges them by `Letterboxd URI` (the unique join key). `watched.csv` is the master list; `ratings.csv` only contributes a score. Films present only in ratings are still kept. Produces `Movie[]`.
2. **`lib/storage.ts`**: Persists the `Movie[]` to `localStorage` (`movies:v1`) so reloads skip the upload screen. **Posters are deliberately stored as `null`** — they re-resolve from the TMDB cache on load to keep the payload small.
3. **`lib/group.ts` — `groupMovies(movies, mode)`**: Buckets by year or decade and **gap-fills** every year/decade between the min and max film year (so empty groups render too). Bounding to actual film years guarantees the first and last groups are non-empty. Within a group, sorted by rating desc, unrated last, then alphabetical. Returns newest-first.
4. **`lib/tmdb.ts` — `resolvePosters(...)`**: Resolves posters via the TMDB search API with bounded concurrency (default 8) and a progressive `onResolve` callback, so cards fill in as results arrive rather than all at once. Every lookup (including confirmed misses, via a `__miss__` sentinel) is cached in `localStorage` keyed by `name|year`, so re-runs are effectively free.

`App.tsx` is the orchestrator: it restores movies on mount, memoizes `groupMovies`, and runs a poster-resolution effect whenever movies + an API key are present (re-running cheaply thanks to the cache).

## Conventions that aren't obvious from a single file

- **TMDB API key is runtime-only.** Entered in the UI, stored in `localStorage` (`tmdb:apiKey`), never in the repo or build. Posters are optional — the app works without a key (placeholders shown). Do not introduce a build-time/env-var key; it would break the "pure static, no secrets" hosting model.

- **Tooltips are portalled to `document.body` with `position: fixed`, positioned imperatively.** Card hover tooltips (`MovieCard.tsx`), histogram bar tooltips (`Histogram.tsx`), and the rating-breakdown tooltip on group titles (`YearRow.tsx`) all use the same pattern: `createPortal` to `body`, then a `place()`/`recompute()` callback that reads `getBoundingClientRect()` + the tooltip's measured `offsetWidth`, clamps to the viewport, and re-runs on capture-phase `scroll` (third arg `true`, to catch nested scroll containers) and `resize`. This exists specifically to escape the swipers' `overflow: auto` clipping — keep new tooltips on this pattern rather than CSS-positioned children.

- **Swipers reset `scrollLeft` in `useLayoutEffect` + a `requestAnimationFrame`.** The browser restores nested scroll-container positions on reload; the double reset (now, then next frame) overrides that. `YearRow` resets to 0 (leftmost); `Histogram` resets to `scrollWidth` (rightmost / newest). If you add a scroll container, replicate this or it will land mid-scroll on reload.

- **Histogram bar height constant `BAR_AREA` (150) must stay in sync with CSS `.hist-bar-area` height.** They are coupled by hand.

- **Group rows carry `id={`group-${group.key}`}`** so the histogram can `scrollIntoView` the matching row on bar click. The key is the year (e.g. `2024`) or decade-start year (e.g. `2020`), matching the histogram bar keys in either mode.

- **Ratings are half-stars** (0.5–5 in 0.5 steps) or `null`. Sort treats `null` as `-1`. UI that summarizes ratings uses a fixed half-star scale.

- **Toasts go through a module-level pub/sub (`lib/toast.ts`), not React state/props.** Call `showToast(message, kind)` from anywhere — including library code like `tmdb.ts` — and the single `<Toaster />` (rendered once at the `App` root, portalled to body, bottom-right) picks it up via `subscribeToasts`. Identical message+kind toasts are **de-duplicated** (the existing timer just restarts), which is what keeps a burst of concurrent poster-fetch failures from stacking. Use this channel for new notifications rather than threading error state through props. Note `tmdb.ts` deliberately raises poster-fetch toasts but **suppresses 401s** (key validation already reports a bad key) and treats a "no poster found" result as a non-error.

## Hosting

Pure static client-side app, no secrets in the build. Vercel works at the root with no config. For GitHub Pages (served under a subpath), set `base: '/LetterboxdTopOfTheYear/'` in `vite.config.ts`. There is no client-side router, so no SPA 404-rewrite is needed.
