import { useRef } from 'react'
import { useToast } from './Toast'
import styles from './SettingsPage.module.css'

export default function SettingsPage({
  members, onAddMember, onRemoveMember, onUpdateMemberName,
  onExport, onImport,
}) {
  const fileRef = useRef(null)
  const showToast = useToast()

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
