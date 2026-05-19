/**
 * Prevents background scroll when overlays (modals) are open without shifting layout:
 * toggling overflow alone removes the scrollbar and narrows the viewport (~15px on Windows).
 */
let lockCount = 0
let previousPaddingRight = ''
let previousOverflow = ''

export function lockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount === 0) {
    const scrollbarGap = Math.max(0, window.innerWidth - document.documentElement.clientWidth)
    previousOverflow = document.body.style.overflow
    previousPaddingRight = document.body.style.paddingRight
    document.body.style.overflow = 'hidden'
    if (scrollbarGap > 0) {
      document.body.style.paddingRight = `${scrollbarGap}px`
    }
  }
  lockCount++
}

export function unlockBodyScroll(): void {
  if (typeof document === 'undefined') return
  if (lockCount === 0) return
  lockCount--
  if (lockCount > 0) return
  document.body.style.overflow = previousOverflow
  document.body.style.paddingRight = previousPaddingRight
}
