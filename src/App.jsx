import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from './hooks/useStore'
import { formatDate } from './utils/date'
import { ToastProvider } from './components/Toast'
import TabBar from './components/TabBar'
import PersonPage from './components/PersonPage'
import RankPage from './components/RankPage'
import SettingsPage from './components/SettingsPage'
import './App.css'

function AppContent() {
  // Read ?size=N from URL and apply to <html> for CSS preset switching
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
    addMember, removeMember, updateMemberName,
    addTask, removeTask, updateTask,
    exportData, importData,
  } = store

  // Tab transition animation
  const [animating, setAnimating] = useState(false)
  const prevTabRef = useRef(currentTab)
  const [slideDir, setSlideDir] = useState(null)

  useEffect(() => {
    if (prevTabRef.current !== currentTab) {
      setSlideDir(currentTab > prevTabRef.current ? 'left' : 'right')
      setAnimating(true)
      prevTabRef.current = currentTab
      const t = setTimeout(() => setAnimating(false), 250)
      return () => clearTimeout(t)
    }
  }, [currentTab])

  const isPerson = currentTab < members.length
  const isRank = currentTab === members.length
  const isSettings = currentTab === members.length + 1

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
        <h1>📚 全家学习打卡</h1>
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
            householdId={store.householdId}
            onAddMember={addMember}
            onRemoveMember={removeMember}
            onUpdateMemberName={updateMemberName}
            onAddTask={addTask}
            onRemoveTask={removeTask}
            onUpdateTask={updateTask}
            onExport={exportData}
            onImport={importData}
          />
        )}
      </div>

      <TabBar
        members={members}
        currentTab={currentTab}
        onTabChange={switchTab}
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
