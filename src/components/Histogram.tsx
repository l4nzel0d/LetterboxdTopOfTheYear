import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GroupMode, MovieGroup } from '../types'

const BAR_AREA = 150 // px tall plotting area for the bars (keep in sync with CSS .hist-bar-area)
const MIN_BAR = 3 // px floor so a non-empty year is always visible
const GAP = 8 // horizontal tooltip offset / viewport margin
const BAR_GAP = 16 // vertical gap between the tooltip and the top of the bar

const DECADE_FIRST = 10 // decade graph: one low line at 10, then every DECADE_STEP
const DECADE_STEP = 50
const YEAR_STEP = 10 // the year graph gets a line every YEAR_STEP films

interface HoverState {
  label: string
  count: number
}

/** Scroll the page to the group row matching a bar (id set in YearRow). */
function scrollToGroup(key: number) {
  document
    .getElementById(`group-${key}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function Histogram({
  groups,
  mode,
}: {
  groups: MovieGroup[]
  mode: GroupMode
}) {
  const swiperRef = useRef<HTMLDivElement>(null)
  const barElRef = useRef<HTMLElement | null>(null) // the .hist-bar span, so the tooltip tracks the bar's top
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState<HoverState | null>(null)

  // Bars run left -> right oldest -> newest; groups arrive newest-first.
  const bars = [...groups].sort((a, b) => a.key - b.key)
  const max = Math.max(1, ...bars.map((g) => g.movies.length))
  // Decades: 10, 50, 100, 150, ... up to and including the tallest bar.
  // Years: every YEAR_STEP, strictly below the tallest bar.
  const milestones =
    mode === 'decade'
      ? [
          DECADE_FIRST,
          ...Array.from(
            { length: Math.floor(max / DECADE_STEP) },
            (_, i) => (i + 1) * DECADE_STEP,
          ),
        ].filter((m) => m <= max)
      : Array.from({ length: Math.floor(max / YEAR_STEP) }, (_, i) => (i + 1) * YEAR_STEP).filter(
          (m) => m < max,
        )

  // Position the portalled tooltip from the hovered bar's rect + its own width.
  const place = useCallback(() => {
    const el = barElRef.current
    const tip = tooltipRef.current
    if (!el || !tip) return
    const rect = el.getBoundingClientRect()
    const width = tip.offsetWidth
    const left = Math.min(
      Math.max(rect.left + rect.width / 2 - width / 2, GAP),
      window.innerWidth - width - GAP,
    )
    tip.style.left = `${left}px`
    tip.style.bottom = `${window.innerHeight - rect.top + BAR_GAP}px`
  }, [])

  useLayoutEffect(() => {
    if (!hovered) return
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [hovered, place])

  // Start fully scrolled to the right (newest years) on load; run again next
  // frame to override the browser's scroll restoration.
  useLayoutEffect(() => {
    const el = swiperRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
    const id = requestAnimationFrame(() => {
      el.scrollLeft = el.scrollWidth
    })
    return () => cancelAnimationFrame(id)
  }, [bars.length])

  return (
    <div
      className={`histogram${mode === 'decade' ? ' is-decade' : ''}`}
      ref={swiperRef}
    >
      <div className="hist-track">
        <div className="hist-grid" aria-hidden="true">
          {milestones.map((m) => (
            <div
              key={m}
              className="hist-line"
              style={{ bottom: (m / max) * BAR_AREA }}
            >
              <span className="hist-line-label">{m}</span>
            </div>
          ))}
        </div>
        {bars.map((g) => {
          const count = g.movies.length
          const height = count === 0 ? 0 : Math.max(MIN_BAR, (count / max) * BAR_AREA)
          const isDecade = g.key % 10 === 0
          return (
            <button
              key={g.key}
              className="hist-col"
              onClick={() => scrollToGroup(g.key)}
              onMouseEnter={(e) => {
                // Decade bars reveal their count in place instead of a tooltip.
                if (mode === 'decade') return
                barElRef.current =
                  e.currentTarget.querySelector('.hist-bar') ?? e.currentTarget
                setHovered({ label: g.label, count })
              }}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="hist-bar-area">
                <span
                  className={`hist-bar${count === 0 ? ' is-empty' : ''}`}
                  style={{ height }}
                >
                  {mode === 'decade' && count > 0 && (
                    <span className="hist-count">{count}</span>
                  )}
                </span>
              </span>
              <span className="hist-axis">
                {isDecade && (
                  <>
                    <span className="hist-tick" />
                    <span className="hist-tick-label">{g.label}</span>
                  </>
                )}
              </span>
            </button>
          )
        })}
      </div>

      {hovered &&
        createPortal(
          <div className="hist-tooltip" ref={tooltipRef}>
            <div className="hist-tooltip-year">{hovered.label}</div>
            <div className="hist-tooltip-count">
              {hovered.count} {hovered.count === 1 ? 'movie' : 'movies'}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
