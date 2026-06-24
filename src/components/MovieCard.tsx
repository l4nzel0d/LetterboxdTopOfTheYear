import type { Movie } from '../types'

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
  return (
    <div className="card">
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

      <div className="card-tooltip">
        <div className="tooltip-title">{movie.name}</div>
        <div className="tooltip-meta">
          {movie.year ?? '—'}
          {movie.rating != null && (
            <>
              {' '}
              <Stars rating={movie.rating} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
