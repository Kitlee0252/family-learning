import { useCallback } from 'react'
import { useStore } from './hooks/useStore'
import { formatDate } from './utils/date'
import { ToastProvider } from './components/Toast'
import TabBar from './components/TabBar'
import PersonPage from './components/PersonPage'
import RankPage from './components/RankPage'
import SettingsPage from './components/SettingsPage'
import './App.css'

function AppContent() {
  const store = useStore()
  const {
    members, data, tasks, currentTab, currentDay, weekOffset, expandedTask,
    getPersonData, toggleTask, updateNote, updateTaskContent,
    changeDay, changeWeek, switchTab, setExpandedTask,
    addMember, removeMember, updateMemberName,
    addTask, removeTask, updateTask,
    exportData, importData,
  } = store

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
