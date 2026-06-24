import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Movie } from '../types'

const GAP = 8 // space above the card, and the minimum margin from viewport edges

/** Render a 0.5–5 rating as Letterboxd-style stars with a trailing half. */
function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="stars">
      {'★'.repeat(full)}
      {half && <span className="half">½</span>}
    </span>
  )
}

export function MovieCard({ movie }: { movie: Movie }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  // Position the (content-sized) tooltip imperatively from the card's rect and
  // the tooltip's own measured width, clamped to stay within the viewport.
  const recompute = useCallback(() => {
    const card = cardRef.current
    const tip = tooltipRef.current
    if (!card || !tip) return
    const rect = card.getBoundingClientRect()
    const width = tip.offsetWidth // natural width: a few px wider than the text
    const center = rect.left + rect.width / 2
    const left = Math.min(
      Math.max(center - width / 2, GAP),
      window.innerWidth - width - GAP,
    )
    tip.style.left = `${left}px`
    // Anchor by the bottom edge so the box grows upward as the title wraps.
    tip.style.bottom = `${window.innerHeight - rect.top + GAP}px`
  }, [])

  // Layout effect runs before paint, so the tooltip is positioned before it's
  // ever shown. While hovered, keep it glued to the card on scroll/resize
  // (capture phase catches scroll from the nested swiper too).
  useLayoutEffect(() => {
    if (!visible) return
    recompute()
    window.addEventListener('scroll', recompute, true)
    window.addEventListener('resize', recompute)
    return () => {
      window.removeEventListener('scroll', recompute, true)
      window.removeEventListener('resize', recompute)
    }
  }, [visible, recompute])

  return (
    <div
      className="card"
      ref={cardRef}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <div className="card-poster">
        {movie.posterUrl ? (
          <img src={movie.posterUrl} alt={movie.name} loading="lazy" />
        ) : (
          <div className="card-placeholder">
            <span>{movie.name}</span>
          </div>
        )}
        <div className="card-outline" />
      </div>

      {visible &&
        createPortal(
          <div className="card-tooltip" ref={tooltipRef}>
            <div className="tooltip-title">
              {movie.name}
              {movie.year != null && ` (${movie.year})`}
            </div>
            {movie.rating != null && (
              <div className="tooltip-meta">
                <Stars rating={movie.rating} />
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
