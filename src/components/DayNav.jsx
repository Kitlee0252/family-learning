import { formatDate, isToday } from '../utils/date'
import styles from './DayNav.module.css'

export default function DayNav({ day, onPrev, onNext }) {
  const today = isToday(day)

  return (
    <div className={styles.dayNav}>
      <button className={styles.navBtn} onClick={onPrev}>‹</button>
      <div className={styles.label}>
        {today && <span className={styles.todayBadge}>今天</span>}
        {formatDate(day)}
      </div>
      <button
        className={`${styles.navBtn} ${today ? styles.disabled : ''}`}
        onClick={onNext}
      >
        ›
      </button>
    </div>
  )
}
