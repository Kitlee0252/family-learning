export const STORAGE_KEY_MEMBERS = 'flt_members'
export const STORAGE_KEY_DATA = 'flt_data'
export const STORAGE_KEY_TASKS = 'flt_tasks'
export const STORAGE_KEY_MIGRATED = 'flt_migrated_v2'

export const DEFAULT_TASKS = [
  { id: 'english', key: 'english', label: '学英语（多邻国）', emoji: '🦉', type: 'english' },
  { id: 'read', key: 'read', label: '做阅读', emoji: '📖', type: 'read' },
  { id: 'note', key: 'note', label: '记笔记', emoji: '✏️', type: 'note' },
]

export const NOTE_FIELDS = [
  { key: 'see', label: '看到了', dotClass: 'dotSee', fieldClass: 'fieldSee', placeholder: '今天看到了什么...' },
  { key: 'know', label: '知道了', dotClass: 'dotKnow', fieldClass: 'fieldKnow', placeholder: '今天学到了什么...' },
  { key: 'do', label: '做到了', dotClass: 'dotDo', fieldClass: 'fieldDo', placeholder: '今天做到了什么...' },
]

export const MSGS = [
  '还没开始哦，加油 💤',
  '好的开始！继续 💪',
  '就差一个啦 🚀',
  '全部完成！太棒了 🎉',
]

export const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export const MEMBER_EMOJIS = ['🧑', '👩', '👦', '👧', '🧒', '👴', '👵']

export const TASK_EMOJIS = ['✏️', '🦉', '📖', '🎵', '🏃', '🧮', '🎨', '🔬', '🎯', '💻', '🌍', '🧠', '📝', '🎹', '🏊', '⚽', '🧩', '📐', '🔭', '🎤']

export const DEFAULT_MEMBERS = [
  { id: 'm_1', name: '爸爸', emoji: '🧑' },
  { id: 'm_2', name: '妈妈', emoji: '👩' },
  { id: 'm_3', name: '宝贝', emoji: '👦' },
]
