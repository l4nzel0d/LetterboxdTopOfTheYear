import type { MovieGroup } from '../types'
import { MovieCard } from './MovieCard'

export function YearRow({ group }: { group: MovieGroup }) {
  return (
    <section className="year-row">
      <div className="year-label">{group.label}</div>
      {group.movies.length === 0 ? (
        <div className="year-empty">No movies to show here yet</div>
      ) : (
        <div className="swiper">
          {group.movies.map((movie) => (
            <MovieCard key={movie.uri} movie={movie} />
          ))}
        </div>
      )}
    </section>
  )
}
