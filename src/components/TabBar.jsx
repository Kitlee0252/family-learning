import styles from './TabBar.module.css'

export default function TabBar({ members, currentTab, onTabChange }) {
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
        <button
          className={`${styles.tab} ${styles.tabRank} ${currentTab === members.length ? styles.active : ''}`}
          onClick={() => onTabChange(members.length)}
        >
          <span className={styles.icon}>🏆</span>
          排行
        </button>
        <button
          className={`${styles.tab} ${currentTab === members.length + 1 ? styles.active : ''}`}
          onClick={() => onTabChange(members.length + 1)}
        >
          <span className={styles.icon}>⚙️</span>
          设置
        </button>
      </div>
    </div>
  )
}
