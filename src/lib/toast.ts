export type ToastKind = 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

type Listener = (toasts: Toast[]) => void

const DEFAULT_DURATION = 4000

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<Listener>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function emit() {
  const snapshot = [...toasts]
  for (const listener of listeners) listener(snapshot)
}

/** Subscribe to the toast list; the listener is called immediately and on every change. */
export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener([...toasts])
  return () => {
    listeners.delete(listener)
  }
}

export function dismissToast(id: number): void {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function scheduleDismiss(id: number, duration: number) {
  const existing = timers.get(id)
  if (existing) clearTimeout(existing)
  timers.set(
    id,
    setTimeout(() => dismissToast(id), duration),
  )
}

/**
 * Show a toast in the bottom-right stack. Identical (message + kind) toasts are
 * de-duplicated: rather than stacking a copy we restart the existing toast's
 * timer. This collapses a burst of identical errors (e.g. one per failed poster
 * fetch) into a single message.
 */
export function showToast(
  message: string,
  kind: ToastKind = 'success',
  duration = DEFAULT_DURATION,
): number {
  const existing = toasts.find((t) => t.message === message && t.kind === kind)
  if (existing) {
    scheduleDismiss(existing.id, duration)
    return existing.id
  }
  const id = nextId++
  toasts = [...toasts, { id, message, kind }]
  emit()
  scheduleDismiss(id, duration)
  return id
}
