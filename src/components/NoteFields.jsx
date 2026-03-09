import { useCallback, useRef, useEffect } from 'react'
import { NOTE_FIELDS } from '../utils/constants'
import styles from './NoteFields.module.css'

function AutoTextarea({ value, placeholder, fieldClass, onChange }) {
  const ref = useRef(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.max(60, ref.current.scrollHeight) + 'px'
    }
  }, [value])

  const handleInput = useCallback((e) => {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.max(60, el.scrollHeight) + 'px'
    onChange(e.target.value)
  }, [onChange])

  return (
    <textarea
      ref={ref}
      className={`${styles.textarea} ${styles[fieldClass] || ''}`}
      placeholder={placeholder}
      value={value}
      onChange={handleInput}
    />
  )
}

export default function NoteFields({ notes, onNoteChange }) {
  return (
    <div>
      {NOTE_FIELDS.map(field => (
        <div key={field.key} className={styles.field}>
          <div className={styles.header}>
            <span className={`${styles.dot} ${styles[field.dotClass]}`} />
            <span className={styles.label}>{field.label}</span>
          </div>
          <AutoTextarea
            value={notes[field.key] || ''}
            placeholder={field.placeholder}
            fieldClass={field.fieldClass}
            onChange={(val) => onNoteChange(field.key, val)}
          />
        </div>
      ))}
    </div>
  )
}
