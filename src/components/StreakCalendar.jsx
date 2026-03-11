import { useState, useMemo } from 'react'
import { getStreak, getMonthData, getMonthStats } from '../utils/streak'
import styles from './StreakCalendar.module.css'

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']

export default function StreakCalendar({ memberId, data, tasks }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const streak = useMemo(() => getStreak(memberId, data), [memberId, data])
  const monthData = useMemo(
    () => getMonthData(memberId, data, tasks, viewYear, viewMonth),
    [memberId, data, tasks, viewYear, viewMonth]
  )
  const stats = useMemo(() => getMonthStats(monthData), [monthData])

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth()

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1)
      setViewMonth(11)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    if (isCurrentMonth) return
    if (viewMonth === 11) {
      setViewYear(viewYear + 1)
      setViewMonth(0)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  // Detect consecutive streaks for connected styling
  const isConsecutive = (index) => {
    const day = monthData[index]
    if (!day || !day.hasCheckin) return { left: false, right: false }

    const row = Math.floor(index / 7)
    const col = index % 7

    // Check left neighbor (same row)
    const leftIdx = index - 1
    const leftInRow = col > 0
    const leftCheckin = leftInRow && monthData[leftIdx]?.hasCheckin

    // Check right neighbor (same row)
    const rightIdx = index + 1
    const rightInRow = col < 6
    const rightCheckin = rightInRow && monthData[rightIdx]?.hasCheckin

    return { left: leftCheckin, right: rightCheckin }
  }

  return (
    <div className={styles.container}>
      {/* Streak badge */}
      <div className={styles.streakRow}>
        <span className={styles.fireIcon}>🔥</span>
        <span className={styles.streakNum}>{streak}</span>
        <span className={styles.streakLabel}>天连续打卡</span>
      </div>

      {/* Month header */}
      <div className={styles.monthHeader}>
        <button className={styles.monthBtn} onClick={prevMonth}>‹</button>
        <span className={styles.monthTitle}>{viewYear}年{MONTH_NAMES[viewMonth]}</span>
        <button
          className={`${styles.monthBtn} ${isCurrentMonth ? styles.disabled : ''}`}
          onClick={nextMonth}
        >›</button>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statNum}>{stats.checkinDays}</span>
          <span className={styles.statLabel}>天已打卡</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statNum}>{stats.perfectDays}</span>
          <span className={styles.statLabel}>天全勤</span>
        </div>
      </div>

      {/* Weekday headers */}
      <div className={styles.grid}>
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className={styles.weekday}>{w}</div>
        ))}

        {/* Day cells */}
        {monthData.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className={styles.cell} />

          const { left, right } = isConsecutive(i)
          const cellClass = [
            styles.cell,
            day.hasCheckin ? styles.checkedIn : '',
            day.allDone ? styles.allDone : '',
            day.isToday ? styles.today : '',
            day.isFuture ? styles.future : '',
            left ? styles.connLeft : '',
            right ? styles.connRight : '',
          ].filter(Boolean).join(' ')

          return (
            <div key={day.dayNum} className={cellClass}>
              <span className={styles.dayNum}>{day.dayNum}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
