import { WEEKDAYS } from './constants'

export function dateKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function dataKey(memberId, date) {
  return `${memberId}_${dateKey(date)}`
}

export function formatDate(d) {
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`
}

export function isToday(d) {
  const t = new Date()
  return d.getFullYear() === t.getFullYear()
    && d.getMonth() === t.getMonth()
    && d.getDate() === t.getDate()
}

export function isFutureDay(d) {
  const t = new Date()
  t.setHours(0, 0, 0, 0)
  const check = new Date(d)
  check.setHours(0, 0, 0, 0)
  return check > t
}

export function getWeekDates(offset) {
  const today = new Date()
  const dayOfWeek = today.getDay() || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - dayOfWeek + 1 + offset * 7)

  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    dates.push(d)
  }
  return dates
}
