import { dateKey } from './date'

/**
 * Check if a day has at least 1 current task completed.
 */
function dayHasCheckin(entry, tasks) {
  if (!entry?.tasks) return false
  return tasks.some(t => entry.tasks[t.key])
}

/**
 * Count completed tasks for a day, filtered by current task list.
 */
function countCompleted(entry, tasks) {
  if (!entry?.tasks) return 0
  return tasks.filter(t => entry.tasks[t.key]).length
}

/**
 * Calculate current streak for a member.
 * A day counts as "checked in" if at least 1 current task is completed.
 * If today has no check-in yet, start counting from yesterday.
 */
export function getStreak(memberId, data, tasks) {
  let streak = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)

  const todayKey = `${memberId}_${dateKey(d)}`
  if (!dayHasCheckin(data[todayKey], tasks)) {
    d.setDate(d.getDate() - 1)
  }

  while (true) {
    const key = `${memberId}_${dateKey(d)}`
    if (!dayHasCheckin(data[key], tasks)) break
    streak++
    d.setDate(d.getDate() - 1)
  }

  return streak
}

/**
 * Get month calendar data for a member.
 * Counts only tasks in the current task list.
 */
export function getMonthData(memberId, data, tasks, year, month) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = []

  for (let i = 0; i < startDow; i++) {
    days.push(null)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    date.setHours(0, 0, 0, 0)
    const key = `${memberId}_${dateKey(date)}`
    const entry = data[key]

    const completedTasks = countCompleted(entry, tasks)
    const totalTasks = tasks.length
    const hasCheckin = completedTasks > 0
    const allDone = totalTasks > 0 && completedTasks === totalTasks

    days.push({
      date,
      dayNum: d,
      hasCheckin,
      allDone,
      completedTasks,
      totalTasks,
      isToday: date.getTime() === today.getTime(),
      isFuture: date > today,
    })
  }

  return days
}

/**
 * Get month stats.
 */
export function getMonthStats(monthData) {
  const validDays = monthData.filter(d => d !== null && !d.isFuture)
  const checkinDays = validDays.filter(d => d.hasCheckin).length
  const perfectDays = validDays.filter(d => d.allDone).length
  return { checkinDays, perfectDays }
}
