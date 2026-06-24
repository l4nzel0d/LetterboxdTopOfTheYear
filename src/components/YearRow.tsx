import { useLayoutEffect, useRef } from 'react'
import type { MovieGroup } from '../types'
import { MovieCard } from './MovieCard'

export function YearRow({ group }: { group: MovieGroup }) {
  const swiperRef = useRef<HTMLDivElement>(null)

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

  return (
    <section className="year-row">
      <div className="year-label">{group.label}</div>
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
