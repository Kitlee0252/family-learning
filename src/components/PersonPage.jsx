import { useRef, useCallback } from 'react'
import { TASKS } from '../utils/constants'
import { useSwipe } from '../hooks/useSwipe'
import { useToast } from './Toast'
import DayNav from './DayNav'
import ProgressRing from './ProgressRing'
import CheckItem from './CheckItem'
import NoteFields from './NoteFields'
import styles from './PersonPage.module.css'

export default function PersonPage({
  member, currentDay, personData, expandedTask,
  onChangeDay, onSetExpandedTask, onToggleTask,
  onUpdateNote, onUpdateTaskContent,
}) {
  const wrapRef = useRef(null)
  const showToast = useToast()

  const onSwipeLeft = useCallback(() => onChangeDay(1), [onChangeDay])
  const onSwipeRight = useCallback(() => onChangeDay(-1), [onChangeDay])
  useSwipe(wrapRef, { onSwipeLeft, onSwipeRight })

  const pd = personData
  const doneCount = TASKS.reduce((c, t) => c + (pd.tasks[t.key] ? 1 : 0), 0)

  return (
    <div ref={wrapRef}>
      <DayNav
        day={currentDay}
        onPrev={() => onChangeDay(-1)}
        onNext={() => onChangeDay(1)}
      />

      <div className={styles.card}>
        <ProgressRing done={doneCount} total={TASKS.length} memberName={member.name} />

        <div className={styles.checkList}>
          {TASKS.map(task => {
            const isDone = !!pd.tasks[task.key]
            const contentKey = task.key === 'read' ? 'readContent' : 'noteContent'
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
                  const newDone = TASKS.reduce((c, t) =>
                    c + ((t.key === task.key ? true : pd.tasks[t.key]) ? 1 : 0), 0)
                  if (newDone === TASKS.length) showToast('🎉 全部完成！太棒了')
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

      <div className={styles.card}>
        <div className={styles.cardTitle}>📝 今日笔记</div>
        <NoteFields
          notes={pd.notes}
          onNoteChange={onUpdateNote}
        />
      </div>
    </div>
  )
}
