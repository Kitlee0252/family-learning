import { useState, useCallback, useRef, useEffect } from 'react'
import { STORAGE_KEY_MEMBERS, STORAGE_KEY_DATA, STORAGE_KEY_TASKS, DEFAULT_MEMBERS, DEFAULT_TASKS, MEMBER_EMOJIS, TASK_EMOJIS } from '../utils/constants'
import { dataKey } from '../utils/date'
import { isFutureDay } from '../utils/date'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('Load error:', key, e)
  }
  return fallback
}

export function useStore() {
  const [members, setMembers] = useState(() => loadJSON(STORAGE_KEY_MEMBERS, DEFAULT_MEMBERS))
  const [data, setData] = useState(() => loadJSON(STORAGE_KEY_DATA, {}))
  const [tasks, setTasks] = useState(() => loadJSON(STORAGE_KEY_TASKS, DEFAULT_TASKS))
  const [currentTab, setCurrentTab] = useState(0)
  const [currentDay, setCurrentDay] = useState(() => new Date())
  const [weekOffset, setWeekOffset] = useState(0)
  const [expandedTask, setExpandedTask] = useState(null)

  // Debounced persist
  const persistTimer = useRef(null)
  const membersRef = useRef(members)
  const dataRef = useRef(data)
  const tasksRef = useRef(tasks)
  membersRef.current = members
  dataRef.current = data
  tasksRef.current = tasks

  const persist = useCallback(() => {
    clearTimeout(persistTimer.current)
    persistTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(membersRef.current))
        localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(dataRef.current))
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasksRef.current))
      } catch (e) {
        console.warn('Save error:', e)
      }
    }, 300)
  }, [])

  // Persist on changes
  useEffect(() => { persist() }, [members, data, tasks, persist])

  const getPersonData = useCallback((memberId, date) => {
    const key = dataKey(memberId, date)
    if (!data[key]) {
      const newEntry = { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' }
      setData(prev => ({ ...prev, [key]: newEntry }))
      return newEntry
    }
    const entry = data[key]
    // Ensure fields exist
    if (entry.notes?.see === undefined) {
      entry.notes = { see: entry.notes?.content || '', know: '', do: '' }
    }
    if (entry.readContent === undefined) entry.readContent = ''
    if (entry.noteContent === undefined) entry.noteContent = ''
    // Migrate structured notes to noteContent
    if (!entry.noteContent && entry.notes) {
      const parts = []
      if (entry.notes.see) parts.push(`看到了：${entry.notes.see}`)
      if (entry.notes.know) parts.push(`知道了：${entry.notes.know}`)
      if (entry.notes.do) parts.push(`做到了：${entry.notes.do}`)
      if (parts.length > 0) {
        entry.noteContent = parts.join('\n')
      }
    }
    return entry
  }, [data])

  const toggleTask = useCallback((memberId, date, taskKey, value) => {
    const key = dataKey(memberId, date)
    setData(prev => {
      const entry = prev[key] || { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' }
      return {
        ...prev,
        [key]: {
          ...entry,
          tasks: { ...entry.tasks, [taskKey]: value },
        },
      }
    })
  }, [])

  const updateNote = useCallback((memberId, date, fieldKey, value) => {
    const key = dataKey(memberId, date)
    setData(prev => {
      const entry = prev[key] || { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' }
      return {
        ...prev,
        [key]: {
          ...entry,
          notes: { ...entry.notes, [fieldKey]: value },
        },
      }
    })
  }, [])

  const updateTaskContent = useCallback((memberId, date, contentKey, value) => {
    const key = dataKey(memberId, date)
    setData(prev => {
      const entry = prev[key] || { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' }
      return {
        ...prev,
        [key]: {
          ...entry,
          [contentKey]: value,
        },
      }
    })
  }, [])

  const changeDay = useCallback((delta) => {
    setCurrentDay(prev => {
      const newDay = new Date(prev.getTime() + delta * 86400000)
      if (delta > 0 && isFutureDay(newDay)) return prev
      return newDay
    })
    setExpandedTask(null)
  }, [])

  const changeWeek = useCallback((delta) => {
    setWeekOffset(prev => prev + delta)
  }, [])

  const switchTab = useCallback((index) => {
    setCurrentTab(index)
    setExpandedTask(null)
  }, [])

  const addMember = useCallback(() => {
    setMembers(prev => {
      const nextId = 'm_' + (Date.now() % 100000)
      const emojiIdx = prev.length % MEMBER_EMOJIS.length
      return [...prev, { id: nextId, name: '成员' + (prev.length + 1), emoji: MEMBER_EMOJIS[emojiIdx] }]
    })
  }, [])

  const removeMember = useCallback((index) => {
    setMembers(prev => {
      if (prev.length <= 1) return prev
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
    setCurrentTab(prev => {
      if (prev >= members.length - 1) return 0
      return prev
    })
  }, [members.length])

  const updateMemberName = useCallback((index, name) => {
    setMembers(prev => {
      const next = [...prev]
      next[index] = { ...next[index], name }
      return next
    })
  }, [])

  const addTask = useCallback(() => {
    setTasks(prev => {
      const nextKey = 'task_' + (Date.now() % 100000)
      const emojiIdx = prev.length % TASK_EMOJIS.length
      return [...prev, { id: nextKey, key: nextKey, label: '新项目', emoji: TASK_EMOJIS[emojiIdx], type: 'custom' }]
    })
  }, [])

  const removeTask = useCallback((taskKey) => {
    setTasks(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(t => t.key !== taskKey)
    })
  }, [])

  const updateTask = useCallback((taskKey, field, value) => {
    setTasks(prev => prev.map(t =>
      t.key === taskKey ? { ...t, [field]: value } : t
    ))
  }, [])

  const exportData = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ version: 2, members: membersRef.current, data: dataRef.current, tasks: tasksRef.current }, null, 2)],
      { type: 'application/json' }
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    a.download = `学习打卡备份_${y}-${m}-${d}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    return true
  }, [])

  const importData = useCallback((jsonObj) => {
    if (jsonObj.members && jsonObj.data) {
      setMembers(jsonObj.members)
      setData(jsonObj.data)
      if (jsonObj.tasks) setTasks(jsonObj.tasks)
      setCurrentTab(0)
      return true
    }
    return false
  }, [])

  return {
    members, data, tasks, currentTab, currentDay, weekOffset, expandedTask,
    getPersonData, toggleTask, updateNote, updateTaskContent,
    changeDay, changeWeek, switchTab, setExpandedTask,
    addMember, removeMember, updateMemberName,
    addTask, removeTask, updateTask,
    exportData, importData,
  }
}
