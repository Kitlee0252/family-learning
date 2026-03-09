import { useRef, useEffect } from 'react'
import styles from './CheckItem.module.css'

export default function CheckItem({
  task, isDone, isExpanded, content,
  onToggleExpand, onConfirm, onUndo, onContentChange,
}) {
  const isNote = task.type === 'note'
  const hasTextArea = task.type === 'read' || task.type === 'note' || task.type === 'custom'
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!isExpanded || !textareaRef.current) return
    const el = textareaRef.current

    // Wait for expand animation (250ms) to finish before focusing
    const focusTimer = setTimeout(() => {
      el.focus({ preventScroll: true })

      // Use visualViewport resize to detect keyboard settled, then scroll
      const vv = window.visualViewport
      if (vv) {
        let scrollTimer = null
        const onResize = () => {
          clearTimeout(scrollTimer)
          // Wait for viewport to stabilize (keyboard animation done)
          scrollTimer = setTimeout(() => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            vv.removeEventListener('resize', onResize)
          }, 120)
        }
        vv.addEventListener('resize', onResize)
        // Fallback: if keyboard is already open (switching tasks), viewport won't resize
        setTimeout(() => {
          vv.removeEventListener('resize', onResize)
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 400)
      } else {
        // Fallback for browsers without visualViewport
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 300)
      }
    }, 260)

    return () => clearTimeout(focusTimer)
  }, [isExpanded])

  const placeholder = isNote
    ? '自由书写今天的所见、所学、所得…'
    : task.type === 'read'
      ? '今天读了什么...'
      : '记录一下...'

  return (
    <div>
      <div
        className={`${styles.item} ${isDone ? styles.done : ''} ${isExpanded ? styles.expanded : ''}`}
        data-type={task.type}
        onClick={onToggleExpand}
      >
        <div className={styles.icon}>{isDone ? '✓' : ''}</div>
        <span className={styles.label}>{task.label}</span>
        <span className={styles.emoji}>{task.emoji}</span>
        <span className={styles.arrow}>▸</span>
      </div>

      <div className={`${styles.detail} ${isExpanded ? styles.open : ''} ${isNote && isExpanded ? styles.openNote : ''}`}>
        <div className={styles.detailInner}>
          {isNote && (
            <div className={styles.noteHeader}>
              <span className={styles.noteTitle}>📝 今日笔记</span>
              <div className={styles.noteTags}>
                <span className={`${styles.noteTag} ${styles.tagSee}`}>看到了</span>
                <span className={`${styles.noteTag} ${styles.tagKnow}`}>知道了</span>
                <span className={`${styles.noteTag} ${styles.tagDo}`}>做到了</span>
              </div>
            </div>
          )}
          {hasTextArea && (
            <textarea
              ref={textareaRef}
              className={`${styles.textarea} ${isNote ? styles.textareaNote : ''}`}
              placeholder={placeholder}
              value={content || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onContentChange?.(e.target.value)}
            />
          )}
          <div className={styles.actions}>
            {!isDone ? (
              <button
                className={`${styles.btn} ${styles.btnDone}`}
                onClick={(e) => { e.stopPropagation(); onConfirm() }}
              >
                完成
              </button>
            ) : (
              <button
                className={`${styles.btn} ${styles.btnUndo}`}
                onClick={(e) => { e.stopPropagation(); onUndo() }}
              >
                取消完成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
