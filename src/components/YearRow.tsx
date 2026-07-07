import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Movie, MovieGroup } from '../types'
import { MovieCard } from './MovieCard'

const GAP = 8

interface RatingStat {
  /** Half-star tier 5, 4.5, 4, … 0.5, or null for the unrated row. */
  rating: number | null
  count: number
}

/** Render a half-star rating as filled stars plus an optional half. */
function ratingStars(rating: number) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return '★'.repeat(full) + (half ? '½' : '')
}

/**
 * Fixed 10-slot scale: always one row per half-star tier (5, 4.5, … 0.5),
 * plus an Unrated row when present. Off-grid ratings snap to the nearest half.
 */
function ratingBreakdown(movies: Movie[]): RatingStat[] {
  const counts = new Map<number, number>() // half-star tier -> count
  for (let tier = 0.5; tier <= 5; tier += 0.5) counts.set(tier, 0)
  let unrated = 0
  for (const m of movies) {
    if (m.rating == null) {
      unrated++
      continue
    }
    const tier = Math.min(5, Math.max(0.5, Math.round(m.rating * 2) / 2))
    counts.set(tier, (counts.get(tier) ?? 0) + 1)
  }
  const stats: RatingStat[] = []
  for (let tier = 5; tier >= 0.5; tier -= 0.5) {
    stats.push({ rating: tier, count: counts.get(tier) ?? 0 })
  }
  if (unrated > 0) stats.push({ rating: null, count: unrated })
  return stats
}

export function YearRow({ group }: { group: MovieGroup }) {
  const swiperRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [statsVisible, setStatsVisible] = useState(false)

  // The browser restores each scroll container's previous scrollLeft on reload
  // (only visible where the row is wide enough to scroll, e.g. decade groups).
  // Reset on mount, then again next frame in case restoration lands after this.
  useLayoutEffect(() => {
    const el = swiperRef.current
    if (!el) return
    el.scrollLeft = 0
    const id = requestAnimationFrame(() => {
      el.scrollLeft = 0
    })
    return () => cancelAnimationFrame(id)
  }, [group.key, group.movies.length])

  // Position the portalled stats tooltip just above the group title.
  const placeStats = useCallback(() => {
    const head = headRef.current
    const tip = tooltipRef.current
    if (!head || !tip) return
    const rect = head.getBoundingClientRect()
    const width = tip.offsetWidth
    const left = Math.min(
      Math.max(rect.right - width, GAP),
      window.innerWidth - width - GAP,
    )
    tip.style.left = `${left}px`
    tip.style.bottom = `${window.innerHeight - rect.top + GAP}px`
  }, [])

  useLayoutEffect(() => {
    if (!statsVisible) return
    placeStats()
    window.addEventListener('scroll', placeStats, true)
    window.addEventListener('resize', placeStats)
    return () => {
      window.removeEventListener('scroll', placeStats, true)
      window.removeEventListener('resize', placeStats)
    }
  }, [statsVisible, placeStats])

  const hasFilms = group.movies.length > 0
  const stats = ratingBreakdown(group.movies)

  return (
    <section className="year-row" id={`group-${group.key}`}>
      <div
        className="year-head"
        ref={headRef}
        onMouseEnter={() => hasFilms && setStatsVisible(true)}
        onMouseLeave={() => setStatsVisible(false)}
      >
        <div className="year-label">{group.label}</div>
        <div className="year-count">
          {group.movies.length} {group.movies.length === 1 ? 'film' : 'films'}
        </div>
        {statsVisible &&
          hasFilms &&
          createPortal(
            <div className="rating-tooltip" ref={tooltipRef}>
              {stats.map((s) => (
                <div className="rating-row" key={s.rating ?? 'unrated'}>
                  <span className="rating-stars">
                    {s.rating != null ? ratingStars(s.rating) : 'Unrated'}
                  </span>
                  <span className="rating-num">{s.count}</span>
                </div>
              ))}
            </div>,
            document.body,
          )}
      </div>
      {group.movies.length === 0 ? (
        <div className="year-empty">No movies to show here yet</div>
      ) : (
        <div className="swiper" ref={swiperRef}>
          {group.movies.map((movie) => (
            <MovieCard key={movie.uri} movie={movie} />
          ))}
        </div>
      )}
    </section>
  )
}
