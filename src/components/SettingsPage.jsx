import { useRef, useState } from 'react'
import { TASK_EMOJIS } from '../utils/constants'
import { useToast } from './Toast'
import styles from './SettingsPage.module.css'

function EmojiPicker({ current, onSelect, onClose }) {
  return (
    <div className={styles.emojiPickerBackdrop} onClick={onClose}>
      <div className={styles.emojiPicker} onClick={(e) => e.stopPropagation()}>
        <div className={styles.emojiGrid}>
          {TASK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={`${styles.emojiOption} ${emoji === current ? styles.emojiSelected : ''}`}
              onClick={() => { onSelect(emoji); onClose() }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function TaskRow({ task, onRemove, onUpdate, pickerOpen, onTogglePicker }) {
  return (
    <div className={styles.taskRowWrap}>
      <div className={styles.taskRow}>
        <button
          className={styles.taskEmojiBtn}
          onClick={() => onTogglePicker(task.key)}
          title="选择图标"
        >
          {task.emoji}
        </button>
        <input
          className={styles.memberInput}
          value={task.label}
          placeholder="项目名称"
          onChange={(e) => onUpdate(task.key, 'label', e.target.value)}
        />
        <button className={styles.btnDel} onClick={() => onRemove(task.key)}>
          ✕
        </button>
      </div>
      {pickerOpen && (
        <EmojiPicker
          current={task.emoji}
          onSelect={(emoji) => onUpdate(task.key, 'emoji', emoji)}
          onClose={() => onTogglePicker(null)}
        />
      )}
    </div>
  )
}

export default function SettingsPage({
  members, tasks, householdId,
  onAddMember, onRemoveMember, onUpdateMemberName,
  onAddTask, onRemoveTask, onUpdateTask,
  onExport, onImport,
}) {
  const fileRef = useRef(null)
  const showToast = useToast()
  const [emojiPickerFor, setEmojiPickerFor] = useState(null)

  const handleExport = () => {
    if (onExport()) showToast('✅ 已导出备份文件')
  }

  const handleImport = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target.result)
        if (onImport(obj)) {
          showToast('✅ 数据已恢复')
        } else {
          showToast('❌ 文件格式不正确')
        }
      } catch {
        showToast('❌ 文件读取失败')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const togglePicker = (taskKey) => {
    setEmojiPickerFor(prev => prev === taskKey ? null : taskKey)
  }

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>👨‍👩‍👧‍👦 家庭成员</div>
        <div className={styles.memberList}>
          {members.map((m, i) => (
            <div key={m.id} className={styles.memberRow}>
              <input
                className={styles.memberInput}
                value={m.name}
                placeholder="姓名"
                onChange={(e) => onUpdateMemberName(i, e.target.value)}
              />
              <button
                className={styles.btnDel}
                onClick={() => onRemoveMember(i)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className={styles.btnAdd} onClick={onAddMember}>
          ＋ 添加成员
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>📋 学习项目</div>
        <div className={styles.memberList}>
          {tasks.map((task) => (
            <TaskRow
              key={task.key}
              task={task}
              onRemove={onRemoveTask}
              onUpdate={onUpdateTask}
              pickerOpen={emojiPickerFor === task.key}
              onTogglePicker={togglePicker}
            />
          ))}
        </div>
        <button className={styles.btnAdd} onClick={onAddTask}>
          ＋ 添加项目
        </button>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>🔗 多设备同步</div>
        <p className={styles.syncHint}>在其他设备打开以下链接，即可同步数据</p>
        <div className={styles.dataActions}>
          <button className={styles.btnAction} onClick={() => {
            const url = `${window.location.origin}${window.location.pathname}?h=${householdId}`
            navigator.clipboard.writeText(url).then(
              () => showToast('✅ 同步链接已复制'),
              () => showToast('❌ 复制失败，请手动复制')
            )
          }}>📋 复制同步链接</button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardTitle}>💾 数据管理</div>
        <div className={styles.dataActions}>
          <button className={styles.btnAction} onClick={handleExport}>📤 导出备份</button>
          <button className={styles.btnAction} onClick={() => fileRef.current?.click()}>📥 导入恢复</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleImport}
          />
        </div>
      </div>
    </div>
  )
}
