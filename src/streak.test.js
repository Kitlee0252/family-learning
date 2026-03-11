/**
 * TDD tests for streak + calendar heatmap feature
 *
 * 1. getStreak — consecutive days with at least 1 task completed
 * 2. getMonthData — calendar grid data for a given month
 * 3. getMonthStats — aggregated stats (checkin days, perfect days)
 * 4. Integration: PersonPage renders StreakCalendar below task list
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')

// ========== 1. getStreak ==========

describe('getStreak — consecutive check-in days', () => {
  let getStreak, dateKeyFn

  beforeEach(async () => {
    const mod = await import('./utils/streak.js')
    getStreak = mod.getStreak
    const dateMod = await import('./utils/date.js')
    dateKeyFn = dateMod.dateKey
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeData(memberId, datesWithTasks) {
    const data = {}
    for (const [dateStr, tasks] of Object.entries(datesWithTasks)) {
      data[`${memberId}_${dateStr}`] = { tasks }
    }
    return data
  }

  it('returns 0 when no data exists', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11)) // March 11
    expect(getStreak('m_1', {})).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-11': { english: true },
      '2026-03-10': { english: true },
      '2026-03-09': { read: true },
      '2026-03-08': { english: false }, // no task done — streak breaks
    })
    expect(getStreak('m_1', data)).toBe(3)
  })

  it('starts from yesterday if today has no check-in', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      // no entry for 2026-03-11
      '2026-03-10': { english: true },
      '2026-03-09': { read: true },
    })
    expect(getStreak('m_1', data)).toBe(2)
  })

  it('returns 0 when yesterday and today both have no check-in', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-08': { english: true },
    })
    expect(getStreak('m_1', data)).toBe(0)
  })

  it('only counts days where at least 1 task is true', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-11': { english: true, read: false },
      '2026-03-10': { english: false, read: false }, // all false — breaks
      '2026-03-09': { english: true },
    })
    expect(getStreak('m_1', data)).toBe(1)
  })

  it('isolates streaks per member', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = {
      ...makeData('m_1', {
        '2026-03-11': { english: true },
        '2026-03-10': { english: true },
      }),
      ...makeData('m_2', {
        '2026-03-11': { english: true },
      }),
    }
    expect(getStreak('m_1', data)).toBe(2)
    expect(getStreak('m_2', data)).toBe(1)
  })

  it('handles long streak (30+ days)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const entries = {}
    for (let i = 0; i < 40; i++) {
      const d = new Date(2026, 2, 11 - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      entries[key] = { english: true }
    }
    const data = makeData('m_1', entries)
    expect(getStreak('m_1', data)).toBe(40)
  })
})

// ========== 2. getMonthData ==========

describe('getMonthData — calendar grid for a month', () => {
  let getMonthData

  beforeEach(async () => {
    const mod = await import('./utils/streak.js')
    getMonthData = mod.getMonthData
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const TASKS = [
    { id: 'english', key: 'english' },
    { id: 'read', key: 'read' },
    { id: 'note', key: 'note' },
  ]

  it('returns null padding for days before the 1st', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    // March 2026 starts on Sunday (day 0), so 0 padding
    const days = getMonthData('m_1', {}, TASKS, 2026, 2)
    expect(days[0]).not.toBeNull() // March 1 is Sunday, no padding
    expect(days[0].dayNum).toBe(1)
  })

  it('returns 31 day entries for March', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const days = getMonthData('m_1', {}, TASKS, 2026, 2)
    const realDays = days.filter(d => d !== null)
    expect(realDays).toHaveLength(31)
  })

  it('marks days with check-ins correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = {
      'm_1_2026-03-05': { tasks: { english: true, read: false, note: false } },
    }
    const days = getMonthData('m_1', data, TASKS, 2026, 2)
    const day5 = days.find(d => d && d.dayNum === 5)
    expect(day5.hasCheckin).toBe(true)
    expect(day5.allDone).toBe(false)
    expect(day5.completedTasks).toBe(1)
  })

  it('marks all-done days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = {
      'm_1_2026-03-05': { tasks: { english: true, read: true, note: true } },
    }
    const days = getMonthData('m_1', data, TASKS, 2026, 2)
    const day5 = days.find(d => d && d.dayNum === 5)
    expect(day5.allDone).toBe(true)
    expect(day5.completedTasks).toBe(3)
  })

  it('marks today correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const days = getMonthData('m_1', {}, TASKS, 2026, 2)
    const day11 = days.find(d => d && d.dayNum === 11)
    expect(day11.isToday).toBe(true)
    const day10 = days.find(d => d && d.dayNum === 10)
    expect(day10.isToday).toBe(false)
  })

  it('marks future days', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const days = getMonthData('m_1', {}, TASKS, 2026, 2)
    const day12 = days.find(d => d && d.dayNum === 12)
    expect(day12.isFuture).toBe(true)
    const day11 = days.find(d => d && d.dayNum === 11)
    expect(day11.isFuture).toBe(false)
  })

  it('handles months starting mid-week (padding)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 15)) // April 2026
    // April 2026 starts on Wednesday (day 3), so 3 null pads
    const days = getMonthData('m_1', {}, TASKS, 2026, 3)
    expect(days[0]).toBeNull()
    expect(days[1]).toBeNull()
    expect(days[2]).toBeNull()
    expect(days[3]).not.toBeNull()
    expect(days[3].dayNum).toBe(1)
  })
})

// ========== 3. getMonthStats ==========

describe('getMonthStats — month-level aggregation', () => {
  let getMonthStats

  beforeEach(async () => {
    const mod = await import('./utils/streak.js')
    getMonthStats = mod.getMonthStats
  })

  it('counts checkin days and perfect days', () => {
    const monthData = [
      null, // padding
      { dayNum: 1, hasCheckin: true, allDone: true, isFuture: false },
      { dayNum: 2, hasCheckin: true, allDone: false, isFuture: false },
      { dayNum: 3, hasCheckin: false, allDone: false, isFuture: false },
      { dayNum: 4, hasCheckin: false, allDone: false, isFuture: true },
    ]
    const stats = getMonthStats(monthData)
    expect(stats.checkinDays).toBe(2)
    expect(stats.perfectDays).toBe(1)
  })

  it('excludes future days from stats', () => {
    const monthData = [
      { dayNum: 1, hasCheckin: true, allDone: true, isFuture: false },
      { dayNum: 2, hasCheckin: true, allDone: true, isFuture: true }, // future
    ]
    const stats = getMonthStats(monthData)
    expect(stats.checkinDays).toBe(1)
    expect(stats.perfectDays).toBe(1)
  })
})

// ========== 4. Integration: PersonPage + StreakCalendar ==========

describe('Integration: PersonPage renders StreakCalendar (layout B)', () => {
  it('PersonPage imports StreakCalendar', () => {
    const code = readFileSync(resolve(root, 'src/components/PersonPage.jsx'), 'utf-8')
    expect(code).toContain("import StreakCalendar from './StreakCalendar'")
  })

  it('PersonPage accepts data prop', () => {
    const code = readFileSync(resolve(root, 'src/components/PersonPage.jsx'), 'utf-8')
    // Should destructure `data` from props
    expect(code).toMatch(/\bdata\b/)
  })

  it('PersonPage renders StreakCalendar below the task card', () => {
    const code = readFileSync(resolve(root, 'src/components/PersonPage.jsx'), 'utf-8')
    // StreakCalendar should appear AFTER the closing </div> of the card
    const cardCloseIdx = code.lastIndexOf('</div>')
    const calendarIdx = code.indexOf('<StreakCalendar')
    expect(calendarIdx).toBeGreaterThan(-1)
    // Calendar should be after checkList
    const checkListIdx = code.indexOf('checkList')
    expect(calendarIdx).toBeGreaterThan(checkListIdx)
  })

  it('PersonPage passes memberId, data, and tasks to StreakCalendar', () => {
    const code = readFileSync(resolve(root, 'src/components/PersonPage.jsx'), 'utf-8')
    expect(code).toMatch(/memberId=\{member\.id\}/)
    expect(code).toMatch(/data=\{data\}/)
    expect(code).toMatch(/tasks=\{tasks\}/)
  })

  it('App.jsx passes data prop to PersonPage', () => {
    const code = readFileSync(resolve(root, 'src/App.jsx'), 'utf-8')
    // Extract the PersonPage JSX block (between <PersonPage and the next />)
    const personPageBlock = code.match(/<PersonPage[\s\S]*?\/>/)?.[0]
    expect(personPageBlock).toBeTruthy()
    expect(personPageBlock).toContain('data={data}')
  })
})

// ========== 5. StreakCalendar component structure ==========

describe('StreakCalendar component file exists and has correct structure', () => {
  it('StreakCalendar.jsx exists', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toBeTruthy()
  })

  it('StreakCalendar.module.css exists', () => {
    const css = readFileSync(resolve(root, 'src/components/StreakCalendar.module.css'), 'utf-8')
    expect(css).toBeTruthy()
  })

  it('StreakCalendar imports getStreak and getMonthData from streak utils', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toContain('getStreak')
    expect(code).toContain('getMonthData')
    expect(code).toContain('getMonthStats')
  })

  it('StreakCalendar accepts memberId, data, tasks props', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toMatch(/\bmemberId\b/)
    expect(code).toMatch(/\bdata\b/)
    expect(code).toMatch(/\btasks\b/)
  })

  it('StreakCalendar renders streak count with fire emoji', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toContain('🔥')
    expect(code).toContain('连续打卡')
  })

  it('StreakCalendar renders weekday headers', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toMatch(/['"]日['"]/)
    expect(code).toMatch(/['"]一['"]/)
    expect(code).toMatch(/['"]六['"]/)
  })

  it('StreakCalendar has month navigation (prev/next)', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toContain('prevMonth')
    expect(code).toContain('nextMonth')
  })

  it('StreakCalendar prevents navigating to future months', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    expect(code).toContain('isCurrentMonth')
  })

  it('CSS has styles for checkedIn, allDone, today, and connected streak days', () => {
    const css = readFileSync(resolve(root, 'src/components/StreakCalendar.module.css'), 'utf-8')
    expect(css).toContain('.checkedIn')
    expect(css).toContain('.allDone')
    expect(css).toContain('.today')
    expect(css).toContain('.connLeft')
    expect(css).toContain('.connRight')
  })
})
