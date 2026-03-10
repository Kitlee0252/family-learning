import { useState, useCallback, useRef, useEffect } from 'react'
import { STORAGE_KEY_MEMBERS, STORAGE_KEY_DATA, STORAGE_KEY_TASKS, DEFAULT_MEMBERS, DEFAULT_TASKS, MEMBER_EMOJIS, TASK_EMOJIS } from '../utils/constants'
import { dataKey, dateKey } from '../utils/date'
import { isFutureDay } from '../utils/date'
import {
  getOrInitHouseholdId, ensureHousehold, setSyncEnabled,
  pushMembers, pushTasks, pushCheckin, pushAllCheckins,
  pullAll, checkinsToLocalFormat,
  bindHouseholdToUser, findUserHousehold, switchHousehold,
} from '../lib/sync'

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
  const [syncStatus, setSyncStatus] = useState('idle') // idle | syncing | done | error

  const householdId = useRef(getOrInitHouseholdId())

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
    // Sync to Supabase
    const d = dateKey(date)
    const entry = dataRef.current[key]
    pushCheckin(householdId.current, memberId, d, taskKey, value, entry?.[taskKey + 'Content'] || null)
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

  // Debounced content sync to avoid pushing on every keystroke
  const contentSyncTimer = useRef(null)
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
    // Debounced sync to Supabase
    clearTimeout(contentSyncTimer.current)
    contentSyncTimer.current = setTimeout(() => {
      const taskKey = contentKey.replace(/Content$/, '')
      const d = dateKey(date)
      const entry = dataRef.current[key]
      pushCheckin(householdId.current, memberId, d, taskKey, !!entry?.tasks?.[taskKey], value)
    }, 1000)
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
      const next = [...prev, { id: nextId, name: '成员' + (prev.length + 1), emoji: MEMBER_EMOJIS[emojiIdx] }]
      pushMembers(householdId.current, next)
      return next
    })
    // Keep settings tab active (its index shifts when members.length increases)
    setCurrentTab(prev => prev + 1)
  }, [])

  const removeMember = useCallback((index) => {
    setMembers(prev => {
      if (prev.length <= 1) return prev
      const next = [...prev]
      next.splice(index, 1)
      pushMembers(householdId.current, next)
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
      pushMembers(householdId.current, next)
      return next
    })
  }, [])

  const updateMemberEmoji = useCallback((index, emoji) => {
    setMembers(prev => {
      const next = [...prev]
      next[index] = { ...next[index], emoji }
      pushMembers(householdId.current, next)
      return next
    })
  }, [])

  const addTask = useCallback(() => {
    setTasks(prev => {
      const nextKey = 'task_' + (Date.now() % 100000)
      const emojiIdx = prev.length % TASK_EMOJIS.length
      const next = [...prev, { id: nextKey, key: nextKey, label: '新项目', emoji: TASK_EMOJIS[emojiIdx], type: 'custom' }]
      pushTasks(householdId.current, next)
      return next
    })
  }, [])

  const removeTask = useCallback((taskKey) => {
    setTasks(prev => {
      if (prev.length <= 1) return prev
      const next = prev.filter(t => t.key !== taskKey)
      pushTasks(householdId.current, next)
      return next
    })
  }, [])

  const updateTask = useCallback((taskKey, field, value) => {
    setTasks(prev => {
      const next = prev.map(t =>
        t.key === taskKey ? { ...t, [field]: value } : t
      )
      pushTasks(householdId.current, next)
      return next
    })
  }, [])

  const handleLoginSuccess = useCallback(async (user) => {
    setSyncEnabled(true)
    setSyncStatus('syncing')
    try {
      const existingHid = await findUserHousehold(user.id)
      if (existingHid && existingHid !== householdId.current) {
        // User already has a household — switch to it and pull
        householdId.current = existingHid
        switchHousehold(existingHid)
        const remote = await pullAll(existingHid)
        if (remote) {
          if (remote.members.length > 0) setMembers(remote.members)
          if (remote.tasks.length > 0) setTasks(remote.tasks)
          if (remote.checkins.length > 0) {
            setData(prev => ({ ...prev, ...checkinsToLocalFormat(remote.checkins) }))
          }
        }
      } else {
        // New user — bind household and push local data to cloud
        const hid = householdId.current
        await ensureHousehold(hid)
        await bindHouseholdToUser(hid, user.id)
        await pushMembers(hid, membersRef.current)
        await pushTasks(hid, tasksRef.current)
        await pushAllCheckins(hid, dataRef.current, tasksRef.current)
      }
      setSyncStatus('done')
    } catch (e) {
      console.warn('Sync after login failed:', e)
      setSyncStatus('error')
    }
  }, [])

  const handleLogout = useCallback(() => {
    setSyncEnabled(false)
    setSyncStatus('idle')
  }, [])

  // Pull latest data when page becomes visible (multi-device sync)
  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState !== 'visible') return
      if (!syncEnabled) return
      const hid = householdId.current
      try {
        const remote = await pullAll(hid)
        if (remote) {
          if (remote.members.length > 0) setMembers(remote.members)
          if (remote.tasks.length > 0) setTasks(remote.tasks)
          if (remote.checkins.length > 0) {
            setData(prev => ({ ...prev, ...checkinsToLocalFormat(remote.checkins) }))
          }
        }
      } catch (e) {
        console.warn('Visibility pull failed:', e)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  return {
    members, data, tasks, currentTab, currentDay, weekOffset, expandedTask, syncStatus,
    getPersonData, toggleTask, updateNote, updateTaskContent,
    changeDay, changeWeek, switchTab, setExpandedTask,
    addMember, removeMember, updateMemberName, updateMemberEmoji,
    addTask, removeTask, updateTask,
    handleLoginSuccess, handleLogout,
  }
}
