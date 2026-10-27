import { unzip } from 'fflate'

export interface ExportFiles {
  watched: File
  ratings: File
  watchlist: File | null
}

const WANTED = new Set(['watched.csv', 'ratings.csv', 'watchlist.csv'])

/** Lower-cased final path segment, or '' for junk entries we never want. */
function wantedBasename(path: string): string {
  const parts = path.toLowerCase().split(/[\\/]/)
  if (parts.includes('__macosx') || parts.includes('lists')) return ''
  const base = parts[parts.length - 1]
  return WANTED.has(base) ? base : ''
}

function unzipAsync(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    // The filter keeps the rest of the export (diary, reviews, lists, ...) from
    // ever being inflated.
    unzip(data, { filter: (f) => wantedBasename(f.name) !== '' }, (err, out) =>
      err ? reject(err) : resolve(out),
    )
  })
}

/**
 * Pull `watched.csv`, `ratings.csv` and `watchlist.csv` out of a Letterboxd
 * export zip. Matches by file name so a wrapping folder doesn't matter; if a
 * name appears more than once the shallowest path wins.
 */
export async function extractExport(zip: File): Promise<ExportFiles> {
  let entries: Record<string, Uint8Array>
  try {
    entries = await unzipAsync(new Uint8Array(await zip.arrayBuffer()))
  } catch {
    throw new Error("That doesn't look like a valid zip file.")
  }

  const best = new Map<string, { depth: number; bytes: Uint8Array }>()
  for (const [path, bytes] of Object.entries(entries)) {
    const base = wantedBasename(path)
    const depth = path.split(/[\\/]/).length
    if (base && (!best.has(base) || depth < best.get(base)!.depth)) {
      best.set(base, { depth, bytes })
    }
  }

  const toFile = (name: string, bytes: Uint8Array) =>
    new File([bytes as BlobPart], name, { type: 'text/csv' })

  const watched = best.get('watched.csv')
  if (!watched) {
    throw new Error(
      "This zip doesn't contain watched.csv. Is it your Letterboxd export?",
    )
  }
  const ratings = best.get('ratings.csv')
  const watchlist = best.get('watchlist.csv')

  return {
    watched: toFile('watched.csv', watched.bytes),
    // Someone who never rated a film may have no ratings.csv at all.
    ratings: ratings
      ? toFile('ratings.csv', ratings.bytes)
      : new File([''], 'ratings.csv', { type: 'text/csv' }),
    watchlist: watchlist ? toFile('watchlist.csv', watchlist.bytes) : null,
  }
}
