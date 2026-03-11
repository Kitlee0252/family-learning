import { useState } from 'react'
import StreakCalendar from './StreakCalendar'
import RankPage from './RankPage'
import styles from './StatsPage.module.css'

export default function StatsPage({ members, data, tasks, weekOffset, onChangeWeek }) {
  // Sub-tabs: one per member + rank tab at the end
  const [subTab, setSubTab] = useState(0)
  const isRank = subTab === members.length

  return (
    <div>
      {/* Sub-tab bar */}
      <div className={styles.subTabs}>
        {members.map((m, i) => (
          <button
            key={m.id}
            className={`${styles.subTab} ${subTab === i ? styles.active : ''}`}
            onClick={() => setSubTab(i)}
          >
            <span className={styles.subTabEmoji}>{m.emoji}</span>
            <span className={styles.subTabName}>{m.name}</span>
          </button>
        ))}
        <button
          className={`${styles.subTab} ${isRank ? styles.active : ''}`}
          onClick={() => setSubTab(members.length)}
        >
          <span className={styles.subTabEmoji}>🏆</span>
          <span className={styles.subTabName}>排行</span>
        </button>
      </div>

      {/* Content */}
      {!isRank && (
        <StreakCalendar
          memberId={members[subTab].id}
          data={data}
          tasks={tasks}
        />
      )}

      {isRank && (
        <RankPage
          members={members}
          data={data}
          tasks={tasks}
          weekOffset={weekOffset}
          onChangeWeek={onChangeWeek}
        />
      )}
    </div>
  )
}
