import { MSGS } from '../utils/constants'
import styles from './ProgressRing.module.css'

export default function ProgressRing({ done, total, memberName }) {
  const pct = done / total
  const offset = 175.9 * (1 - pct)

  return (
    <div className={styles.section}>
      <div className={styles.ringWrap}>
        <svg width="68" height="68" viewBox="0 0 68 68">
          <circle className={styles.ringBg} cx="34" cy="34" r="28" />
          <circle
            className={styles.ringFg}
            cx="34" cy="34" r="28"
            strokeDasharray="175.9"
            strokeDashoffset={offset}
          />
        </svg>
        <div className={styles.ringText}>{done}/{total}</div>
      </div>
      <div className={styles.msg}>
        <strong>{memberName}</strong>
        <br />
        {done === 0 ? MSGS[0] : done === total ? MSGS[3] : done >= total - 1 ? MSGS[2] : MSGS[1]}
      </div>
    </div>
  )
}
