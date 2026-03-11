import { dateKey } from './date'

/**
 * Calculate current streak for a member.
 * A day counts as "checked in" if at least 1 task is completed.
 * If today has no check-in yet, start counting from yesterday.
 */
export function getStreak(memberId, data) {
  let streak = 0
  const d = new Date()
  d.setHours(0, 0, 0, 0)

  // Check if today has any check-in
  const todayKey = `${memberId}_${dateKey(d)}`
  const todayEntry = data[todayKey]
  const todayHasCheckin = todayEntry?.tasks && Object.values(todayEntry.tasks).some(Boolean)

  if (!todayHasCheckin) {
    // Start from yesterday
    d.setDate(d.getDate() - 1)
  }

  while (true) {
    const key = `${memberId}_${dateKey(d)}`
    const entry = data[key]
    const hasCheckin = entry?.tasks && Object.values(entry.tasks).some(Boolean)
    if (!hasCheckin) break
    streak++
    d.setDate(d.getDate() - 1)
  }

  return streak
}

/**
 * Get month calendar data for a member.
 * Returns array of { date, dayNum, hasCheckin, allDone, isToday, isFuture }
 */
export function getMonthData(memberId, data, tasks, year, month) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const days = []

  // Padding for days before the 1st
  for (let i = 0; i < startDow; i++) {
    days.push(null)
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    date.setHours(0, 0, 0, 0)
    const key = `${memberId}_${dateKey(date)}`
    const entry = data[key]

    const completedTasks = entry?.tasks
      ? Object.values(entry.tasks).filter(Boolean).length
      : 0
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
 * Get month stats
 */
export function getMonthStats(monthData) {
  const validDays = monthData.filter(d => d !== null && !d.isFuture)
  const checkinDays = validDays.filter(d => d.hasCheckin).length
  const perfectDays = validDays.filter(d => d.allDone).length
  return { checkinDays, perfectDays }
}
