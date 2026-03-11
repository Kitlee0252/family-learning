import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { STORAGE_KEY_MEMBERS, STORAGE_KEY_DATA, STORAGE_KEY_TASKS, DEFAULT_MEMBERS, DEFAULT_TASKS, MEMBER_EMOJIS, TASK_EMOJIS } from '../utils/constants'
import { dataKey, dateKey } from '../utils/date'
import { isFutureDay } from '../utils/date'
import {
  getOrInitHouseholdId, ensureHousehold, setSyncEnabled, isSyncEnabled,
  pushMembers, pushTasks, pushCheckin, pushAllCheckins,
  pullAll, mergeCheckins,
  bindHouseholdToUser, findUserHousehold, switchHousehold,
  getFailedQueue,
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

  // Dirty map for text content sync — per-field debounce
  const dirtyFieldsRef = useRef(new Map())
  const dirtyTimersRef = useRef(new Map())

  const flushDirtyField = useCallback((dirtyId) => {
    const field = dirtyFieldsRef.current.get(dirtyId)
    if (!field) return
    dirtyFieldsRef.current.delete(dirtyId)
    if (dirtyTimersRef.current.has(dirtyId)) {
      clearTimeout(dirtyTimersRef.current.get(dirtyId))
      dirtyTimersRef.current.delete(dirtyId)
    }
    const { memberId, date, taskKey, value } = field
    const d = dateKey(date)
    const entry = dataRef.current[dataKey(memberId, date)]
    pushCheckin(householdId.current, memberId, d, taskKey, !!entry?.tasks?.[taskKey], value)
  }, [])

  const flushAllDirty = useCallback(() => {
    for (const [dirtyId] of dirtyFieldsRef.current) {
      flushDirtyField(dirtyId)
    }
  }, [flushDirtyField])

  // Flush dirty fields on page hide / beforeunload
  useEffect(() => {
    const onBeforeUnload = () => flushAllDirty()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushAllDirty])

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
    const now = new Date().toISOString()
    setData(prev => {
      const entry = prev[key] || { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '', _updatedAt: {} }
      return {
        ...prev,
        [key]: {
          ...entry,
          tasks: { ...entry.tasks, [taskKey]: value },
          _updatedAt: { ...(entry._updatedAt || {}), [taskKey]: now },
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

  const updateTaskContent = useCallback((memberId, date, contentKey, value) => {
    const key = dataKey(memberId, date)
    const taskKey = contentKey.replace(/Content$/, '')
    const now = new Date().toISOString()
    setData(prev => {
      const entry = prev[key] || { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '', _updatedAt: {} }
      return {
        ...prev,
        [key]: {
          ...entry,
          [contentKey]: value,
          _updatedAt: { ...(entry._updatedAt || {}), [taskKey]: now },
        },
      }
    })
    // Mark dirty for debounced sync (handled by dirty map — see Step 5)
    const dirtyId = `${key}_${contentKey}`
    dirtyFieldsRef.current.set(dirtyId, { memberId, date, taskKey, contentKey, value })
    // Per-field debounce
    if (dirtyTimersRef.current.has(dirtyId)) {
      clearTimeout(dirtyTimersRef.current.get(dirtyId))
    }
    dirtyTimersRef.current.set(dirtyId, setTimeout(() => {
      flushDirtyField(dirtyId)
    }, 2000))
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

      if (!existingHid) {
        // Path A: Brand new user — push local to cloud
        const hid = householdId.current
        await ensureHousehold(hid)
        await bindHouseholdToUser(hid, user.id)
        await pushMembers(hid, membersRef.current)
        await pushTasks(hid, tasksRef.current)
        await pushAllCheckins(hid, dataRef.current, tasksRef.current)
      } else if (existingHid === householdId.current) {
        // Path B: Same device refresh — bidirectional sync
        const hid = householdId.current
        await pushAllCheckins(hid, dataRef.current, tasksRef.current)
        const remote = await pullAll(hid)
        if (remote) {
          if (remote.members.length > 0) setMembers(remote.members)
          if (remote.tasks.length > 0) setTasks(remote.tasks)
          if (remote.checkins.length > 0) {
            setData(prev => mergeCheckins(prev, remote.checkins))
          }
        }
      } else {
        // Path C: New device joining existing household — PULL first, don't push config
        householdId.current = existingHid
        switchHousehold(existingHid)
        const remote = await pullAll(existingHid)
        if (remote) {
          if (remote.members.length > 0) setMembers(remote.members)
          if (remote.tasks.length > 0) setTasks(remote.tasks)
          if (remote.checkins.length > 0) {
            setData(prev => mergeCheckins(prev, remote.checkins))
          }
        }
        // Don't push local default data — cloud is authoritative
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

  // Bidirectional sync when page becomes visible (multi-device sync)
  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'hidden') {
        // Flush dirty fields when page goes hidden
        flushAllDirty()
        return
      }
      if (document.visibilityState !== 'visible') return
      if (!isSyncEnabled()) return
      const hid = householdId.current
      try {
        // Flush failed queue first (retry previously failed pushCheckins)
        const queue = getFailedQueue()
        while (queue.length > 0) {
          const item = queue.shift()
          if (item.type === 'checkin') {
            const { error } = await supabase
              .from('checkins')
              .upsert(item.row, { onConflict: 'household_id,member_id,date,task_key' })
            if (error) {
              console.warn('Failed queue retry error:', error)
              queue.unshift(item) // put it back
              break
            }
          }
        }
        // Push local checkins, then pull remote and merge
        await pushAllCheckins(hid, dataRef.current, tasksRef.current)
        const remote = await pullAll(hid)
        if (remote) {
          // Always take remote config (may have been updated from another device)
          if (remote.members.length > 0) setMembers(remote.members)
          if (remote.tasks.length > 0) setTasks(remote.tasks)
          // Merge checkins by updated_at
          if (remote.checkins.length > 0) {
            setData(prev => mergeCheckins(prev, remote.checkins))
          }
        }
      } catch (e) {
        console.warn('Visibility sync failed:', e)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [flushAllDirty])

  return {
    members, data, tasks, currentTab, currentDay, weekOffset, expandedTask, syncStatus,
    getPersonData, toggleTask, updateNote, updateTaskContent,
    changeDay, changeWeek, switchTab, setExpandedTask,
    addMember, removeMember, updateMemberName, updateMemberEmoji,
    addTask, removeTask, updateTask,
    handleLoginSuccess, handleLogout,
  }
}
