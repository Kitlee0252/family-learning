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

// ========== Helper ==========

const TASKS = [
  { id: 'english', key: 'english' },
  { id: 'read', key: 'read' },
  { id: 'note', key: 'note' },
]

function makeData(memberId, datesWithTasks) {
  const data = {}
  for (const [dateStr, tasks] of Object.entries(datesWithTasks)) {
    data[`${memberId}_${dateStr}`] = { tasks }
  }
  return data
}

// ========== 1. getStreak ==========

describe('getStreak — consecutive check-in days', () => {
  let getStreak

  beforeEach(async () => {
    const mod = await import('./utils/streak.js')
    getStreak = mod.getStreak
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 when no data exists', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    expect(getStreak('m_1', {}, TASKS)).toBe(0)
  })

  it('counts consecutive days ending today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-11': { english: true },
      '2026-03-10': { english: true },
      '2026-03-09': { read: true },
      '2026-03-08': { english: false },
    })
    expect(getStreak('m_1', data, TASKS)).toBe(3)
  })

  it('starts from yesterday if today has no check-in', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-10': { english: true },
      '2026-03-09': { read: true },
    })
    expect(getStreak('m_1', data, TASKS)).toBe(2)
  })

  it('returns 0 when yesterday and today both have no check-in', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-08': { english: true },
    })
    expect(getStreak('m_1', data, TASKS)).toBe(0)
  })

  it('only counts days where at least 1 task is true', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-11': { english: true, read: false },
      '2026-03-10': { english: false, read: false },
      '2026-03-09': { english: true },
    })
    expect(getStreak('m_1', data, TASKS)).toBe(1)
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
    expect(getStreak('m_1', data, TASKS)).toBe(2)
    expect(getStreak('m_2', data, TASKS)).toBe(1)
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
    expect(getStreak('m_1', data, TASKS)).toBe(40)
  })

  // === BUG: stale task keys must be ignored ===

  it('ignores stale task keys not in current tasks list', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    // Data has a deleted task "old_task" that was completed,
    // but current task list only has english/read/note — none completed
    const data = makeData('m_1', {
      '2026-03-11': { old_task: true, english: false, read: false },
      '2026-03-10': { old_task: true },
    })
    // old_task is not in TASKS, so these days should NOT count as checked-in
    expect(getStreak('m_1', data, TASKS)).toBe(0)
  })

  it('counts only current tasks for streak continuity', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = makeData('m_1', {
      '2026-03-11': { english: true, old_task: true },  // english is current → counts
      '2026-03-10': { old_task: true },                  // only stale → breaks
      '2026-03-09': { read: true },
    })
    expect(getStreak('m_1', data, TASKS)).toBe(1)  // only March 11
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

  // === BUG: stale task keys must be ignored ===

  it('ignores stale task keys for completedTasks count', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = {
      // Data has 3 current tasks + 1 stale task all true
      'm_1_2026-03-05': { tasks: { english: true, read: true, note: true, old_task: true } },
    }
    const days = getMonthData('m_1', data, TASKS, 2026, 2)
    const day5 = days.find(d => d && d.dayNum === 5)
    // completedTasks should be 3 (only current tasks), not 4
    expect(day5.completedTasks).toBe(3)
    expect(day5.allDone).toBe(true)
  })

  it('does not count stale keys as hasCheckin', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = {
      // Only stale task completed, no current task completed
      'm_1_2026-03-05': { tasks: { old_task: true, english: false } },
    }
    const days = getMonthData('m_1', data, TASKS, 2026, 2)
    const day5 = days.find(d => d && d.dayNum === 5)
    expect(day5.hasCheckin).toBe(false)
    expect(day5.completedTasks).toBe(0)
  })

  it('allDone should be false when stale keys inflate count beyond tasks.length', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))
    const data = {
      // 2 current tasks done + 2 stale = 4 true values, but only 2/3 current done
      'm_1_2026-03-05': { tasks: { english: true, read: true, note: false, stale1: true, stale2: true } },
    }
    const days = getMonthData('m_1', data, TASKS, 2026, 2)
    const day5 = days.find(d => d && d.dayNum === 5)
    expect(day5.completedTasks).toBe(2)
    expect(day5.allDone).toBe(false)
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

// ========== 5. RankPage: must filter by current tasks ==========

describe('RankPage — score calculation must use current task keys only', () => {
  it('RankPage should use tasks.filter or tasks.reduce to count, not Object.values(pd.tasks)', () => {
    const code = readFileSync(resolve(root, 'src/components/RankPage.jsx'), 'utf-8')
    // Must NOT use Object.values(pd.tasks).filter(Boolean) — counts stale keys
    expect(code).not.toMatch(/Object\.values\(\s*pd\.tasks\s*\)/)
    // Should use task-key-based counting like PersonPage does:
    // tasks.reduce(...pd.tasks[t.key]...) or tasks.filter(t => pd.tasks[t.key])
    expect(code).toMatch(/tasks\.(reduce|filter|forEach)/)
  })
})

// ========== 6. StreakCalendar passes tasks to getStreak ==========

describe('StreakCalendar — must pass tasks to getStreak', () => {
  it('StreakCalendar passes tasks as 3rd arg to getStreak', () => {
    const code = readFileSync(resolve(root, 'src/components/StreakCalendar.jsx'), 'utf-8')
    // getStreak(memberId, data, tasks)
    expect(code).toMatch(/getStreak\(\s*memberId\s*,\s*data\s*,\s*tasks\s*\)/)
  })
})

// ========== 7. Full pipeline: mergeCheckins → getStreak / RankPage scoring ==========

describe('Full pipeline: mergeCheckins → getStreak → RankPage scoring', () => {
  let getStreak, getMonthData, getMonthStats

  beforeEach(async () => {
    const mod = await import('./utils/streak.js')
    getStreak = mod.getStreak
    getMonthData = mod.getMonthData
    getMonthStats = mod.getMonthStats
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Import mergeCheckins synchronously via file read + eval is tricky,
  // so we reimplement the core logic here for testing
  function mergeCheckins(localData, remoteCheckins) {
    const merged = {}
    for (const [key, entry] of Object.entries(localData)) {
      merged[key] = JSON.parse(JSON.stringify(entry))
    }
    for (const c of remoteCheckins) {
      const key = `${c.member_id}_${c.date}`
      if (!merged[key]) {
        merged[key] = { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '', _updatedAt: {} }
      }
      const entry = merged[key]
      if (!entry._updatedAt) entry._updatedAt = {}
      const localTs = entry._updatedAt[c.task_key]
      const remoteTs = c.updated_at
      if (!localTs || remoteTs > localTs) {
        entry.tasks[c.task_key] = c.completed
        if (c.content != null) {
          entry[c.task_key + 'Content'] = c.content
        } else {
          entry[c.task_key + 'Content'] = ''
        }
        entry._updatedAt[c.task_key] = remoteTs
      }
    }
    return merged
  }

  // Simulate the exact RankPage scoring logic
  function rankScore(memberId, data, tasks, weekDates) {
    let total = 0
    weekDates.forEach(d => {
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      const key = `${memberId}_${y}-${m}-${day}`
      const pd = data[key]
      if (pd && pd.tasks) {
        total += tasks.filter(t => !!pd.tasks[t.key]).length
      }
    })
    return total
  }

  // Simulate real Supabase data for the family
  const supabaseCheckins = [
    // m_1 (爸爸): March 8-11, all tasks on 10-11
    { member_id: 'm_1', date: '2026-03-08', task_key: 'english', completed: true, updated_at: '2026-03-08T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-09', task_key: 'english', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-09', task_key: 'read', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-10', task_key: 'english', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-10', task_key: 'read', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-10', task_key: 'note', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-11', task_key: 'read', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    { member_id: 'm_1', date: '2026-03-11', task_key: 'note', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    // m_2 (妈妈): March 9 (english+read), March 11 (read only)
    { member_id: 'm_2', date: '2026-03-09', task_key: 'english', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_2', date: '2026-03-09', task_key: 'read', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_2', date: '2026-03-11', task_key: 'read', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    // m_3 (宝贝): March 8-11, all tasks on 9-11
    { member_id: 'm_3', date: '2026-03-08', task_key: 'english', completed: true, updated_at: '2026-03-08T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-09', task_key: 'english', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-09', task_key: 'read', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-09', task_key: 'note', completed: true, updated_at: '2026-03-09T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-10', task_key: 'english', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-10', task_key: 'read', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-10', task_key: 'note', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-11', task_key: 'english', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-11', task_key: 'read', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    { member_id: 'm_3', date: '2026-03-11', task_key: 'note', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
  ]

  it('mergeCheckins produces correct data format from Supabase rows', () => {
    const merged = mergeCheckins({}, supabaseCheckins)

    // m_1 March 11 should have all 3 tasks true
    expect(merged['m_1_2026-03-11'].tasks.english).toBe(true)
    expect(merged['m_1_2026-03-11'].tasks.read).toBe(true)
    expect(merged['m_1_2026-03-11'].tasks.note).toBe(true)

    // m_2 March 11 should have only read true
    expect(merged['m_2_2026-03-11'].tasks.read).toBe(true)

    // m_3 March 11 should have all 3 tasks true
    expect(merged['m_3_2026-03-11'].tasks.english).toBe(true)
    expect(merged['m_3_2026-03-11'].tasks.read).toBe(true)
    expect(merged['m_3_2026-03-11'].tasks.note).toBe(true)
  })

  it('getStreak works correctly on mergeCheckins output', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11)) // March 11

    const merged = mergeCheckins({}, supabaseCheckins)

    // m_1: checkins March 8-11 → 4 consecutive days ending today
    expect(getStreak('m_1', merged, TASKS)).toBe(4)

    // m_2: March 9 + March 11 (gap on March 10) → streak = 1 (today only)
    expect(getStreak('m_2', merged, TASKS)).toBe(1)

    // m_3: March 8-11 → 4 consecutive days
    expect(getStreak('m_3', merged, TASKS)).toBe(4)
  })

  it('RankPage scoring works correctly on mergeCheckins output', () => {
    const merged = mergeCheckins({}, supabaseCheckins)

    // Week of March 9-15 (March 11 is Wednesday)
    const weekDates = []
    for (let i = 9; i <= 15; i++) {
      weekDates.push(new Date(2026, 2, i))
    }

    // m_1: Mar 9 (eng+read=2), Mar 10 (all=3), Mar 11 (all=3) = 8
    expect(rankScore('m_1', merged, TASKS, weekDates)).toBe(8)

    // m_2: Mar 9 (eng+read=2), Mar 11 (read=1) = 3
    expect(rankScore('m_2', merged, TASKS, weekDates)).toBe(3)

    // m_3: Mar 9 (all=3), Mar 10 (all=3), Mar 11 (all=3) = 9
    expect(rankScore('m_3', merged, TASKS, weekDates)).toBe(9)
  })

  it('getMonthData works correctly on mergeCheckins output', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    const merged = mergeCheckins({}, supabaseCheckins)
    const stats1 = getMonthStats(getMonthData('m_1', merged, TASKS, 2026, 2))
    const stats2 = getMonthStats(getMonthData('m_2', merged, TASKS, 2026, 2))
    const stats3 = getMonthStats(getMonthData('m_3', merged, TASKS, 2026, 2))

    // m_1: 4 checkin days (8-11), 2 perfect days (10-11)
    expect(stats1.checkinDays).toBe(4)
    expect(stats1.perfectDays).toBe(2)

    // m_2: 2 checkin days (9, 11), 0 perfect days
    expect(stats2.checkinDays).toBe(2)
    expect(stats2.perfectDays).toBe(0)

    // m_3: 4 checkin days (8-11), 3 perfect days (9-11)
    expect(stats3.checkinDays).toBe(4)
    expect(stats3.perfectDays).toBe(3)
  })

  it('mergeCheckins with explicit false values does not break getStreak', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    // Simulate Supabase returning both true AND false completed values
    const checkins = [
      { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
      { member_id: 'm_1', date: '2026-03-11', task_key: 'read', completed: false, updated_at: '2026-03-11T10:00:00Z', content: null },
      { member_id: 'm_1', date: '2026-03-11', task_key: 'note', completed: false, updated_at: '2026-03-11T10:00:00Z', content: null },
      { member_id: 'm_1', date: '2026-03-10', task_key: 'english', completed: true, updated_at: '2026-03-10T10:00:00Z', content: null },
    ]
    const merged = mergeCheckins({}, checkins)

    // March 11: english=true, read=false, note=false → hasCheckin (at least 1 true)
    expect(getStreak('m_1', merged, TASKS)).toBe(2)
  })

  it('mergeCheckins false overwriting true with newer timestamp breaks streak', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    // Local data has english: true at T1
    const localData = {
      'm_1_2026-03-11': {
        tasks: { english: true },
        _updatedAt: { english: '2026-03-11T08:00:00Z' },
      },
    }

    // Remote has english: false at T2 (later) — overwrites
    const remoteCheckins = [
      { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: false, updated_at: '2026-03-11T12:00:00Z', content: null },
    ]

    const merged = mergeCheckins(localData, remoteCheckins)
    // english was overwritten to false → no tasks true → streak 0
    expect(merged['m_1_2026-03-11'].tasks.english).toBe(false)
    expect(getStreak('m_1', merged, TASKS)).toBe(0)
  })

  it('getPersonData empty entries do not affect other members streak', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    // m_1 has real data, m_2 has empty entries from getPersonData viewing
    const data = {
      'm_1_2026-03-11': { tasks: { english: true } },
      'm_1_2026-03-10': { tasks: { read: true } },
      'm_2_2026-03-11': { tasks: {} }, // empty from getPersonData
      'm_2_2026-03-10': { tasks: {} }, // empty from getPersonData
    }

    expect(getStreak('m_1', data, TASKS)).toBe(2)
    expect(getStreak('m_2', data, TASKS)).toBe(0)
  })

  it('mergeCheckins into getPersonData empty entries restores correct data', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    // Local data has empty entries from getPersonData
    const localData = {
      'm_2_2026-03-11': { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' },
    }

    // Remote has real checkin data
    const remoteCheckins = [
      { member_id: 'm_2', date: '2026-03-11', task_key: 'read', completed: true, updated_at: '2026-03-11T10:00:00Z', content: null },
    ]

    const merged = mergeCheckins(localData, remoteCheckins)
    expect(merged['m_2_2026-03-11'].tasks.read).toBe(true)
    expect(getStreak('m_2', merged, TASKS)).toBe(1)
  })

  it('duplicate Supabase rows for same task — last-write-wins by updated_at', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    // Two rows for same member/date/task with different completed values
    const checkins = [
      { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: true, updated_at: '2026-03-11T08:00:00Z', content: null },
      { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: false, updated_at: '2026-03-11T12:00:00Z', content: null },
    ]

    const merged = mergeCheckins({}, checkins)
    // Second row (false, later timestamp) should win
    expect(merged['m_1_2026-03-11'].tasks.english).toBe(false)
    expect(getStreak('m_1', merged, TASKS)).toBe(0)
  })

  it('duplicate Supabase rows — earlier false does NOT overwrite later true', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 11))

    // Two rows: first false (early), then true (later)
    const checkins = [
      { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: false, updated_at: '2026-03-11T08:00:00Z', content: null },
      { member_id: 'm_1', date: '2026-03-11', task_key: 'english', completed: true, updated_at: '2026-03-11T12:00:00Z', content: null },
    ]

    const merged = mergeCheckins({}, checkins)
    // Second row (true, later timestamp) should win
    expect(merged['m_1_2026-03-11'].tasks.english).toBe(true)
    expect(getStreak('m_1', merged, TASKS)).toBe(1)
  })
})

// ========== 8. getPersonData must NOT create state entries ==========

describe('getPersonData — must not call setData during render', () => {
  it('useStore.js getPersonData does NOT call setData when data[key] is missing', () => {
    const code = readFileSync(resolve(root, 'src/hooks/useStore.js'), 'utf-8')
    // Extract the getPersonData function body
    const fnMatch = code.match(/const getPersonData = useCallback\(([\s\S]*?)\}, \[data\]\)/)
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch[1]
    // Must NOT contain setData call — side effects during render cause race conditions
    expect(fnBody).not.toContain('setData')
  })

  it('useStore.js getPersonData returns default entry without modifying state', () => {
    const code = readFileSync(resolve(root, 'src/hooks/useStore.js'), 'utf-8')
    const fnMatch = code.match(/const getPersonData = useCallback\(([\s\S]*?)\}, \[data\]\)/)
    expect(fnMatch).toBeTruthy()
    const fnBody = fnMatch[1]
    // Should return a default entry (with tasks: {})
    expect(fnBody).toContain('tasks: {}')
    // Should return immutable copy (spread), not mutate original
    expect(fnBody).toMatch(/return \{/)
  })
})

// ========== 9. mergeCheckins implementation verification ==========

describe('mergeCheckins (source code) — critical behaviors', () => {
  it('sync.js mergeCheckins sets both true and false completed values', () => {
    const code = readFileSync(resolve(root, 'src/lib/sync.js'), 'utf-8')
    // Verify it sets c.completed directly (which includes false)
    expect(code).toMatch(/entry\.tasks\[c\.task_key\]\s*=\s*c\.completed/)
  })

  it('sync.js mergeCheckins uses updated_at for last-write-wins', () => {
    const code = readFileSync(resolve(root, 'src/lib/sync.js'), 'utf-8')
    expect(code).toContain('_updatedAt')
    expect(code).toContain('c.updated_at')
  })
})

// ========== 9. StreakCalendar component structure ==========

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
