import { useRef, useEffect, useCallback } from 'react'
import styles from './CheckItem.module.css'

function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(44, el.scrollHeight) + 'px'
}

export default function CheckItem({
  task, isDone, isExpanded, content,
  onToggleExpand, onConfirm, onUndo, onContentChange,
}) {
  const needsText = task.key === 'read' || task.key === 'note'
  const textareaRef = useRef(null)

  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      autoGrow(textareaRef.current)
    }
  }, [isExpanded])

  const handleContentChange = useCallback((e) => {
    autoGrow(e.target)
    onContentChange?.(e.target.value)
  }, [onContentChange])

  const placeholder = task.key === 'read' ? '今天读了什么...' : '简要记录笔记内容...'

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

      <div className={`${styles.detail} ${isExpanded ? styles.open : ''}`}>
        <div className={styles.detailInner}>
          {needsText && (
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              placeholder={placeholder}
              value={content || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={handleContentChange}
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
