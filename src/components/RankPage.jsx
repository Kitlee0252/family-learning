import { TASKS } from '../utils/constants'
import { dataKey, getWeekDates } from '../utils/date'
import styles from './RankPage.module.css'

export default function RankPage({ members, data, weekOffset, onChangeWeek }) {
  const dates = getWeekDates(weekOffset)
  const monday = dates[0]
  const sunday = dates[6]

  const weekLabel = `${monday.getMonth() + 1}/${monday.getDate()} — ${sunday.getMonth() + 1}/${sunday.getDate()}`

  const scores = members.map(member => {
    let total = 0
    dates.forEach(d => {
      const key = dataKey(member.id, d)
      const pd = data[key]
      if (pd && pd.tasks) {
        total += Object.values(pd.tasks).filter(Boolean).length
      }
    })
    return { name: member.name, emoji: member.emoji, score: total }
  })

  scores.sort((a, b) => b.score - a.score)
  const maxScore = Math.max(...scores.map(s => s.score), 1)
  const badges = ['🥇', '🥈', '🥉']

  return (
    <div>
      <div className={styles.dayNav}>
        <button className={styles.navBtn} onClick={() => onChangeWeek(-1)}>‹</button>
        <div className={styles.navLabel}>{weekLabel}</div>
        <button className={styles.navBtn} onClick={() => onChangeWeek(1)}>›</button>
      </div>

      <div>
        {scores.map((s, i) => {
          const isFirst = i === 0
          const isLast = i === scores.length - 1 && scores.length > 1
          const badge = badges[i] || (isLast ? '🎁' : '')
          const barWidth = (s.score / maxScore) * 100

          return (
            <div
              key={s.name}
              className={`${styles.rankItem} ${isFirst ? styles.rankFirst : ''} ${isLast ? styles.rankLast : ''}`}
            >
              <div className={styles.rankNum}>{i + 1}</div>
              <div className={styles.rankInfo}>
                <div className={styles.rankName}>{s.emoji} {s.name}</div>
                <div className={styles.rankScore}>本周 {s.score} / {7 * TASKS.length} 项</div>
                <div className={styles.barBg}>
                  <div className={styles.bar} style={{ width: `${barWidth}%` }} />
                </div>
              </div>
              <div className={styles.rankBadge}>{badge}</div>
            </div>
          )
        })}
      </div>

      <div className={styles.note}>🏆 最后一名给第一名发奖品<br />具体奖品家庭会议决定！</div>
    </div>
  )
}
