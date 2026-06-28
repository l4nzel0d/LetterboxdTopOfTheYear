import { useState } from 'react'

interface Props {
  /** Continue into the app. An empty string means the user skipped. */
  onContinue: (key: string) => void
}

export function ApiKeyScreen({ onContinue }: Props) {
  const [key, setKey] = useState('')
  const [pasteFailed, setPasteFailed] = useState(false)

  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setKey(text.trim())
        setPasteFailed(false)
      }
    } catch {
      // Clipboard API blocked (no permission / insecure context): nudge to Ctrl+V.
      setPasteFailed(true)
    }
  }

  return (
    <div className="upload">
      <div className="upload-card">
        <h1>Add posters</h1>
        <p className="upload-sub">
          Paste a free TMDB API key to show movie posters on every card. It's
          optional and stored only in your browser — you can add or change it
          later from the top bar. Without one, cards just show film titles.
        </p>

        <div className="key-field">
          <input
            className="key-field-input"
            type="text"
            placeholder="TMDB API key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
          />
          <button type="button" className="key-paste" onClick={handlePaste}>
            Paste
          </button>
        </div>

        <a
          className="key-link"
          href="https://www.themoviedb.org/settings/api"
          target="_blank"
          rel="noopener noreferrer"
        >
          Where do I get a key? →
        </a>

        {pasteFailed && (
          <p className="key-paste-hint">
            Couldn't read the clipboard — paste manually with Ctrl/Cmd + V.
          </p>
        )}

        <button
          className="upload-go"
          disabled={!key.trim()}
          onClick={() => onContinue(key.trim())}
        >
          Save key &amp; continue
        </button>
        <button className="key-skip" onClick={() => onContinue('')}>
          Skip for now
        </button>
      </div>
    </div>
  )
}
