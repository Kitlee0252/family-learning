import { useRef, useCallback } from 'react'
import { useSwipe } from '../hooks/useSwipe'
import { useToast } from './Toast'
import DayNav from './DayNav'
import ProgressRing from './ProgressRing'
import CheckItem from './CheckItem'
import styles from './PersonPage.module.css'

export default function PersonPage({
  member, currentDay, personData, expandedTask, tasks,
  onChangeDay, onSetExpandedTask, onToggleTask,
  onUpdateNote, onUpdateTaskContent,
}) {
  const wrapRef = useRef(null)
  const showToast = useToast()

  const onSwipeLeft = useCallback(() => onChangeDay(1), [onChangeDay])
  const onSwipeRight = useCallback(() => onChangeDay(-1), [onChangeDay])
  useSwipe(wrapRef, { onSwipeLeft, onSwipeRight })

  const pd = personData
  const doneCount = tasks.reduce((c, t) => c + (pd.tasks[t.key] ? 1 : 0), 0)

  return (
    <div ref={wrapRef}>
      <DayNav
        day={currentDay}
        onPrev={() => onChangeDay(-1)}
        onNext={() => onChangeDay(1)}
      />

      <div className={styles.card}>
        <ProgressRing done={doneCount} total={tasks.length} memberName={member.name} />

        <div className={styles.checkList}>
          {tasks.map(task => {
            const isDone = !!pd.tasks[task.key]
            const contentKey = task.key + 'Content'
            return (
              <CheckItem
                key={task.key}
                task={task}
                isDone={isDone}
                isExpanded={expandedTask === task.key}
                content={pd[contentKey]}
                onToggleExpand={() => onSetExpandedTask(expandedTask === task.key ? null : task.key)}
                onConfirm={() => {
                  onToggleTask(task.key, true)
                  onSetExpandedTask(null)
                  const newDone = tasks.reduce((c, t) =>
                    c + ((t.key === task.key ? true : pd.tasks[t.key]) ? 1 : 0), 0)
                  if (newDone === tasks.length) showToast('🎉 全部完成！太棒了')
                }}
                onUndo={() => {
                  onToggleTask(task.key, false)
                  onSetExpandedTask(null)
                }}
                onContentChange={(val) => onUpdateTaskContent(contentKey, val)}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
