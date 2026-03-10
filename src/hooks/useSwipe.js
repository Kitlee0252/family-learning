import { useEffect, useRef } from 'react'

export function useSwipe(ref, { onSwipeLeft, onSwipeRight }) {
  const startRef = useRef({ x: 0, y: 0 })
  const skipRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const isInteractive = (target) => {
      const tag = target.tagName
      return tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'
    }

    const onTouchStart = (e) => {
      skipRef.current = isInteractive(e.target)
      startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }

    const onTouchEnd = (e) => {
      if (skipRef.current) return
      const dx = e.changedTouches[0].clientX - startRef.current.x
      const dy = e.changedTouches[0].clientY - startRef.current.y
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx > 0) onSwipeRight?.()
        else onSwipeLeft?.()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [ref, onSwipeLeft, onSwipeRight])
}
