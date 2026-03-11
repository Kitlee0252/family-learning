import styles from './TabBar.module.css'

export default function TabBar({ members, currentTab, onTabChange, hasStreakTab }) {
  const streakIdx = members.length
  const rankIdx = members.length + (hasStreakTab ? 1 : 0)
  const settingsIdx = rankIdx + 1

  return (
    <div className={styles.tabBar}>
      <div className={styles.inner}>
        {members.map((m, i) => (
          <button
            key={m.id}
            className={`${styles.tab} ${currentTab === i ? styles.active : ''}`}
            onClick={() => onTabChange(i)}
          >
            <span className={styles.icon}>{m.emoji}</span>
            {m.name}
          </button>
        ))}
        {hasStreakTab && (
          <button
            className={`${styles.tab} ${currentTab === streakIdx ? styles.active : ''}`}
            onClick={() => onTabChange(streakIdx)}
          >
            <span className={styles.icon}>🔥</span>
            打卡
          </button>
        )}
        <button
          className={`${styles.tab} ${styles.tabRank} ${currentTab === rankIdx ? styles.active : ''}`}
          onClick={() => onTabChange(rankIdx)}
        >
          <span className={styles.icon}>🏆</span>
          排行
        </button>
        <button
          className={`${styles.tab} ${currentTab === settingsIdx ? styles.active : ''}`}
          onClick={() => onTabChange(settingsIdx)}
        >
          <span className={styles.icon}>⚙️</span>
          设置
        </button>
      </div>
    </div>
  )
}
