import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useStore } from './hooks/useStore'
import { useAuth } from './hooks/useAuth'
import { formatDate } from './utils/date'
import { ToastProvider } from './components/Toast'
import TabBar from './components/TabBar'
import PersonPage from './components/PersonPage'
import RankPage from './components/RankPage'
import SettingsPage from './components/SettingsPage'
import StreakPage from './components/StreakPage'
import StatsPage from './components/StatsPage'
import './App.css'

function AppContent() {
  // Read ?size=N and ?layout=a|b|c from URL
  const calendarLayout = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    const layout = params.get('layout')
    if (layout && ['a', 'b', 'c', 'd'].includes(layout)) return layout
    return 'b' // default
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const size = params.get('size')
    if (size && ['1', '2', '3', '4', '5'].includes(size)) {
      document.documentElement.setAttribute('data-size', size)
    } else {
      document.documentElement.removeAttribute('data-size')
    }
  }, [])

  const store = useStore()
  const {
    members, data, tasks, currentTab, currentDay, weekOffset, expandedTask,
    getPersonData, toggleTask, updateNote, updateTaskContent,
    changeDay, changeWeek, switchTab, setExpandedTask,
    addMember, removeMember, updateMemberName, updateMemberEmoji,
    addTask, removeTask, updateTask,
    handleLoginSuccess, handleLogout,
  } = store
  const auth = useAuth()

  // Drive cloud sync based on auth state
  const hasSynced = useRef(false)
  useEffect(() => {
    if (auth.loading) return
    if (auth.user && !hasSynced.current) {
      hasSynced.current = true
      handleLoginSuccess(auth.user)
    }
    if (!auth.user) {
      hasSynced.current = false
      handleLogout()
    }
  }, [auth.loading, auth.user, handleLoginSuccess, handleLogout])

  // Tab transition animation
  const [animating, setAnimating] = useState(false)
  const prevTabRef = useRef(currentTab)
  const [slideDir, setSlideDir] = useState(null)

  useEffect(() => {
    if (prevTabRef.current !== currentTab) {
      setSlideDir(currentTab > prevTabRef.current ? 'left' : 'right')
      setAnimating(true)
      prevTabRef.current = currentTab
      window.scrollTo(0, 0)
      const t = setTimeout(() => setAnimating(false), 250)
      return () => clearTimeout(t)
    }
  }, [currentTab])

  // Layout C inserts a streak tab; Layout D merges streak+rank into one "stats" tab
  const hasStreakTab = calendarLayout === 'c'
  const hasStatsTab = calendarLayout === 'd'
  const streakTabIdx = hasStreakTab ? members.length : -1
  const statsTabIdx = hasStatsTab ? members.length : -1
  const rankTabIdx = hasStatsTab ? -1 : members.length + (hasStreakTab ? 1 : 0)
  const settingsTabIdx = hasStatsTab
    ? members.length + 1
    : rankTabIdx + 1

  const isPerson = currentTab < members.length
  const isStreak = hasStreakTab && currentTab === streakTabIdx
  const isStats = hasStatsTab && currentTab === statsTabIdx
  const isRank = !hasStatsTab && currentTab === rankTabIdx
  const isSettings = currentTab === settingsTabIdx

  const member = isPerson ? members[currentTab] : null
  const personData = isPerson ? getPersonData(member.id, currentDay) : null

  const handleToggleTask = useCallback((taskKey, value) => {
    if (!member) return
    toggleTask(member.id, currentDay, taskKey, value)
  }, [member, currentDay, toggleTask])

  const handleUpdateNote = useCallback((fieldKey, value) => {
    if (!member) return
    updateNote(member.id, currentDay, fieldKey, value)
  }, [member, currentDay, updateNote])

  const handleUpdateTaskContent = useCallback((contentKey, value) => {
    if (!member) return
    updateTaskContent(member.id, currentDay, contentKey, value)
  }, [member, currentDay, updateTaskContent])

  return (
    <div className="app">
      <div className="header">
        <h1>📚 家庭共学记录</h1>
        <div className="date">{formatDate(new Date())}</div>
      </div>

      <div className={`pageContent ${animating ? (slideDir === 'left' ? 'slideInLeft' : 'slideInRight') : ''}`}>
        {isPerson && (
          <PersonPage
            member={member}
            currentDay={currentDay}
            personData={personData}
            expandedTask={expandedTask}
            tasks={tasks}
            onChangeDay={changeDay}
            onSetExpandedTask={setExpandedTask}
            onToggleTask={handleToggleTask}
            onUpdateNote={handleUpdateNote}
            onUpdateTaskContent={handleUpdateTaskContent}
            data={data}
            calendarLayout={calendarLayout}
          />
        )}

        {isStreak && (
          <StreakPage members={members} data={data} tasks={tasks} />
        )}

        {isStats && (
          <StatsPage
            members={members}
            data={data}
            tasks={tasks}
            weekOffset={weekOffset}
            onChangeWeek={changeWeek}
          />
        )}

        {isRank && (
          <RankPage
            members={members}
            data={data}
            tasks={tasks}
            weekOffset={weekOffset}
            onChangeWeek={changeWeek}
          />
        )}

        {isSettings && (
          <SettingsPage
            members={members}
            tasks={tasks}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onUpdateMemberName={updateMemberName}
            onUpdateMemberEmoji={updateMemberEmoji}
            onAddTask={addTask}
            onRemoveTask={removeTask}
            onUpdateTask={updateTask}
            auth={auth}
          />
        )}
      </div>

      <TabBar
        members={members}
        currentTab={currentTab}
        onTabChange={switchTab}
        hasStreakTab={hasStreakTab}
        hasStatsTab={hasStatsTab}
      />
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
