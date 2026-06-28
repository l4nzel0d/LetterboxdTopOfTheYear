import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { dismissToast, subscribeToasts, type Toast } from '../lib/toast'

/** Bottom-right toast stack, portalled to body. Click a toast to dismiss it. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return createPortal(
    <div className="toaster">
      {toasts.map((t) => (
        <button
          key={t.id}
          className={`toast toast-${t.kind}`}
          onClick={() => dismissToast(t.id)}
          title="Dismiss"
        >
          {t.message}
        </button>
      ))}
    </div>,
    document.body,
  )
}
