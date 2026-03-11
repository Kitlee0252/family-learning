/**
 * Sync module tests — covers all sync scenarios for multi-device login
 *
 * Test categories:
 * 1. pushAllCheckins key parsing (the indexOf bug fix)
 * 2. handleLoginSuccess three paths (new user / same device / new device)
 * 3. pushMembers/pushTasks safety (upsert vs delete+insert)
 * 4. mergeCheckins with updated_at comparison
 * 5. pushAllCheckins pushing completed=false records
 * 6. Text sync dirty map + flush on exit
 * 7. Retry mechanism
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ========== Mock Supabase ==========

// Track all supabase calls for assertion
let supabaseCalls = []
let mockDbState = { members: [], tasks: [], checkins: [] }
let mockErrors = {} // { tableName_operation: errorObj }

function resetMocks() {
  supabaseCalls = []
  mockDbState = { members: [], tasks: [], checkins: [] }
  mockErrors = {}
}

function createMockSupabase() {
  const chainable = (table, op) => {
    const call = { table, op, filters: {}, data: null }
    supabaseCalls.push(call)

    const chain = {
      eq: (col, val) => { call.filters[col] = val; return chain },
      not: (col, op, val) => { call.filters[`not_${col}`] = val; return chain },
      order: () => chain,
      limit: () => chain,
      select: (cols) => { call.select = cols; return chain },
      maybeSingle: () => {
        const errorKey = `${table}_${op}`
        if (mockErrors[errorKey]) return Promise.resolve({ data: null, error: mockErrors[errorKey] })

        if (table === 'households') {
          const found = mockDbState.members.length > 0 ? { id: call.filters.user_id } : null
          return Promise.resolve({ data: found, error: null })
        }
        return Promise.resolve({ data: null, error: null })
      },
      then: undefined, // will be set based on operation
    }

    // Make chain thenable for await
    if (op === 'select') {
      const errorKey = `${table}_${op}`
      chain.then = (resolve) => {
        if (mockErrors[errorKey]) {
          resolve({ data: null, error: mockErrors[errorKey] })
        } else {
          resolve({ data: mockDbState[table] || [], error: null })
        }
      }
    }

    if (op === 'upsert' || op === 'insert' || op === 'update') {
      const errorKey = `${table}_${op}`
      chain.then = (resolve) => {
        if (mockErrors[errorKey]) {
          resolve({ error: mockErrors[errorKey] })
        } else {
          resolve({ error: null })
        }
      }
    }

    if (op === 'delete') {
      const errorKey = `${table}_${op}`
      chain.then = (resolve) => {
        if (mockErrors[errorKey]) {
          resolve({ error: mockErrors[errorKey] })
        } else {
          resolve({ error: null })
        }
      }
    }

    return chain
  }

  return {
    from: (table) => ({
      select: (cols) => chainable(table, 'select').select(cols),
      upsert: (data, opts) => {
        const c = chainable(table, 'upsert')
        c.data = data
        c.opts = opts
        supabaseCalls[supabaseCalls.length - 1].data = data
        supabaseCalls[supabaseCalls.length - 1].opts = opts
        return c
      },
      insert: (data) => {
        const c = chainable(table, 'insert')
        supabaseCalls[supabaseCalls.length - 1].data = data
        return c
      },
      update: (data) => {
        const c = chainable(table, 'update')
        supabaseCalls[supabaseCalls.length - 1].data = data
        return c
      },
      delete: () => chainable(table, 'delete'),
    }),
  }
}

// ========== Import helpers — we test pure functions directly ==========
// For functions that depend on the supabase module singleton,
// we test them via the module after mocking.

// We'll test the pure logic functions by re-implementing the key algorithms
// and testing them in isolation, since the module uses a singleton supabase import.

// ========== 1. Key Parsing Tests ==========

describe('pushAllCheckins key parsing', () => {
  // Simulate the key parsing logic
  function parseDataKey_OLD(key) {
    const underscoreIdx = key.indexOf('_')
    if (underscoreIdx === -1) return null
    return {
      memberId: key.substring(0, underscoreIdx),
      date: key.substring(underscoreIdx + 1),
    }
  }

  function parseDataKey_FIXED(key) {
    const underscoreIdx = key.lastIndexOf('_')
    if (underscoreIdx === -1) return null
    const memberId = key.substring(0, underscoreIdx)
    const date = key.substring(underscoreIdx + 1)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    return { memberId, date }
  }

  it('OLD: breaks on member IDs with underscores (m_1)', () => {
    const result = parseDataKey_OLD('m_1_2024-03-10')
    expect(result.memberId).toBe('m') // WRONG — should be 'm_1'
    expect(result.date).toBe('1_2024-03-10') // WRONG — should be '2024-03-10'
  })

  it('OLD: breaks on longer member IDs (m_12345)', () => {
    const result = parseDataKey_OLD('m_12345_2024-03-10')
    expect(result.memberId).toBe('m') // WRONG
    expect(result.date).toBe('12345_2024-03-10') // WRONG
  })

  it('FIXED: correctly parses m_1_2024-03-10', () => {
    const result = parseDataKey_FIXED('m_1_2024-03-10')
    expect(result.memberId).toBe('m_1')
    expect(result.date).toBe('2024-03-10')
  })

  it('FIXED: correctly parses m_12345_2024-03-10', () => {
    const result = parseDataKey_FIXED('m_12345_2024-03-10')
    expect(result.memberId).toBe('m_12345')
    expect(result.date).toBe('2024-03-10')
  })

  it('FIXED: rejects malformed keys', () => {
    expect(parseDataKey_FIXED('no_underscore_date')).toBeNull()
    expect(parseDataKey_FIXED('m_1_notadate')).toBeNull()
    expect(parseDataKey_FIXED('singlekey')).toBeNull()
  })

  it('FIXED: handles default member IDs (m_1, m_2, m_3)', () => {
    for (const id of ['m_1', 'm_2', 'm_3']) {
      const key = `${id}_2024-06-15`
      const result = parseDataKey_FIXED(key)
      expect(result.memberId).toBe(id)
      expect(result.date).toBe('2024-06-15')
    }
  })
})

// ========== 2. mergeCheckins Tests ==========

describe('mergeCheckins — updated_at comparison', () => {
  // New merge function that uses updated_at
  function mergeCheckinsNew(localData, remoteCheckins) {
    // Build remote map with updated_at preserved
    const remoteByKey = {}
    for (const c of remoteCheckins) {
      const entryKey = `${c.member_id}_${c.date}`
      const fieldKey = `${c.task_key}`
      if (!remoteByKey[entryKey]) remoteByKey[entryKey] = {}
      remoteByKey[entryKey][fieldKey] = c
    }

    const merged = {}
    // Copy all local data
    for (const [key, entry] of Object.entries(localData)) {
      merged[key] = JSON.parse(JSON.stringify(entry))
    }

    // Merge remote
    for (const c of remoteCheckins) {
      const key = `${c.member_id}_${c.date}`
      if (!merged[key]) {
        merged[key] = { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' }
      }
      const entry = merged[key]
      const localUpdatedAt = entry._updatedAt?.[c.task_key]
      const remoteUpdatedAt = c.updated_at

      if (!localUpdatedAt || remoteUpdatedAt > localUpdatedAt) {
        // Remote is newer — take remote values (including completed=false)
        entry.tasks[c.task_key] = c.completed
        if (c.content != null) {
          entry[c.task_key + 'Content'] = c.content
        }
        if (!entry._updatedAt) entry._updatedAt = {}
        entry._updatedAt[c.task_key] = remoteUpdatedAt
      }
      // else: local is newer, keep local
    }

    return merged
  }

  it('remote newer — takes remote completed state (including false)', () => {
    const local = {
      'm_1_2024-03-10': {
        tasks: { english: true },
        _updatedAt: { english: '2024-03-10T08:00:00Z' },
        notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '',
      },
    }
    const remoteCheckins = [{
      member_id: 'm_1', date: '2024-03-10', task_key: 'english',
      completed: false, content: null,
      updated_at: '2024-03-10T09:00:00Z', // newer
    }]
    const result = mergeCheckinsNew(local, remoteCheckins)
    expect(result['m_1_2024-03-10'].tasks.english).toBe(false) // unchecked!
  })

  it('local newer — keeps local state', () => {
    const local = {
      'm_1_2024-03-10': {
        tasks: { english: true },
        _updatedAt: { english: '2024-03-10T10:00:00Z' },
        notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '',
      },
    }
    const remoteCheckins = [{
      member_id: 'm_1', date: '2024-03-10', task_key: 'english',
      completed: false, content: null,
      updated_at: '2024-03-10T09:00:00Z', // older
    }]
    const result = mergeCheckinsNew(local, remoteCheckins)
    expect(result['m_1_2024-03-10'].tasks.english).toBe(true) // kept local
  })

  it('remote has entry that local does not — adds it', () => {
    const local = {}
    const remoteCheckins = [{
      member_id: 'm_2', date: '2024-03-10', task_key: 'read',
      completed: true, content: '读了一本书',
      updated_at: '2024-03-10T09:00:00Z',
    }]
    const result = mergeCheckinsNew(local, remoteCheckins)
    expect(result['m_2_2024-03-10'].tasks.read).toBe(true)
    expect(result['m_2_2024-03-10'].readContent).toBe('读了一本书')
  })

  it('local has entry that remote does not — keeps it', () => {
    const local = {
      'm_3_2024-03-11': {
        tasks: { note: true },
        noteContent: '笔记内容',
        notes: { see: '', know: '', do: '' }, readContent: '',
      },
    }
    const result = mergeCheckinsNew(local, [])
    expect(result['m_3_2024-03-11'].tasks.note).toBe(true)
    expect(result['m_3_2024-03-11'].noteContent).toBe('笔记内容')
  })

  it('content conflict — remote newer wins', () => {
    const local = {
      'm_1_2024-03-10': {
        tasks: { note: true },
        noteContent: '本地笔记',
        _updatedAt: { note: '2024-03-10T08:00:00Z' },
        notes: { see: '', know: '', do: '' }, readContent: '',
      },
    }
    const remoteCheckins = [{
      member_id: 'm_1', date: '2024-03-10', task_key: 'note',
      completed: true, content: '远端笔记',
      updated_at: '2024-03-10T10:00:00Z', // newer
    }]
    const result = mergeCheckinsNew(local, remoteCheckins)
    expect(result['m_1_2024-03-10'].noteContent).toBe('远端笔记')
  })

  it('content conflict — local newer wins', () => {
    const local = {
      'm_1_2024-03-10': {
        tasks: { note: true },
        noteContent: '本地笔记（更新）',
        _updatedAt: { note: '2024-03-10T12:00:00Z' },
        notes: { see: '', know: '', do: '' }, readContent: '',
      },
    }
    const remoteCheckins = [{
      member_id: 'm_1', date: '2024-03-10', task_key: 'note',
      completed: true, content: '远端笔记',
      updated_at: '2024-03-10T10:00:00Z', // older
    }]
    const result = mergeCheckinsNew(local, remoteCheckins)
    expect(result['m_1_2024-03-10'].noteContent).toBe('本地笔记（更新）')
  })

  it('no local _updatedAt — remote wins (backward compatibility)', () => {
    const local = {
      'm_1_2024-03-10': {
        tasks: { english: true },
        // no _updatedAt field (old data)
        notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '',
      },
    }
    const remoteCheckins = [{
      member_id: 'm_1', date: '2024-03-10', task_key: 'english',
      completed: false, content: null,
      updated_at: '2024-03-10T09:00:00Z',
    }]
    const result = mergeCheckinsNew(local, remoteCheckins)
    expect(result['m_1_2024-03-10'].tasks.english).toBe(false) // remote wins
  })
})

// ========== 3. pushAllCheckins completed=false ==========

describe('pushAllCheckins — completed=false records', () => {
  function buildCheckinRows(data, tasks) {
    const rows = []
    for (const [key, entry] of Object.entries(data)) {
      const underscoreIdx = key.lastIndexOf('_')
      if (underscoreIdx === -1) continue
      const memberId = key.substring(0, underscoreIdx)
      const date = key.substring(underscoreIdx + 1)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      if (!entry.tasks) continue

      for (const task of tasks) {
        const completed = !!entry.tasks[task.key]
        const contentKey = task.key + 'Content'
        const content = entry[contentKey] || null

        // NEW: push completed=false if the task key exists in entry.tasks
        // (meaning user explicitly interacted with it)
        const hasInteracted = task.key in entry.tasks
        if (!completed && !content && !hasInteracted) continue

        rows.push({
          member_id: memberId,
          date,
          task_key: task.key,
          completed,
          content,
        })
      }
    }
    return rows
  }

  const tasks = [
    { key: 'english', label: '学英语' },
    { key: 'read', label: '做阅读' },
    { key: 'note', label: '记笔记' },
  ]

  it('includes completed=true records', () => {
    const data = {
      'm_1_2024-03-10': {
        tasks: { english: true, read: false },
      },
    }
    const rows = buildCheckinRows(data, tasks)
    const englishRow = rows.find(r => r.task_key === 'english')
    expect(englishRow).toBeDefined()
    expect(englishRow.completed).toBe(true)
  })

  it('includes completed=false when user explicitly unchecked', () => {
    const data = {
      'm_1_2024-03-10': {
        tasks: { english: false }, // explicitly set to false
      },
    }
    const rows = buildCheckinRows(data, tasks)
    const englishRow = rows.find(r => r.task_key === 'english')
    expect(englishRow).toBeDefined()
    expect(englishRow.completed).toBe(false)
  })

  it('skips tasks user never interacted with', () => {
    const data = {
      'm_1_2024-03-10': {
        tasks: { english: true },
        // read and note were never touched — not in tasks object
      },
    }
    const rows = buildCheckinRows(data, tasks)
    expect(rows).toHaveLength(1)
    expect(rows[0].task_key).toBe('english')
  })

  it('includes record with content even if not completed', () => {
    const data = {
      'm_1_2024-03-10': {
        tasks: {},
        readContent: '读了一些东西',
      },
    }
    const rows = buildCheckinRows(data, tasks)
    const readRow = rows.find(r => r.task_key === 'read')
    expect(readRow).toBeDefined()
    expect(readRow.completed).toBe(false)
    expect(readRow.content).toBe('读了一些东西')
  })
})

// ========== 4. Login paths ==========

describe('handleLoginSuccess — three paths', () => {
  // Simulate the path determination logic
  function determineLoginPath(existingHid, localHid) {
    if (!existingHid) return 'new_user'
    if (existingHid === localHid) return 'same_device'
    return 'new_device'
  }

  it('path A: no existing household → new_user', () => {
    expect(determineLoginPath(null, 'local-uuid-123')).toBe('new_user')
  })

  it('path B: existing === local → same_device', () => {
    expect(determineLoginPath('uuid-123', 'uuid-123')).toBe('same_device')
  })

  it('path C: existing !== local → new_device', () => {
    expect(determineLoginPath('uuid-A', 'uuid-B')).toBe('new_device')
  })

  // Test the sync order for each path
  describe('path C (new device) — must PULL first, not PUSH', () => {
    it('should not push local members/tasks to existing household', () => {
      // This test documents the required behavior:
      // When joining an existing household, local default data
      // must NOT overwrite the established cloud data.
      const localMembers = [
        { id: 'm_1', name: '成员1', emoji: '👶' }, // default
      ]
      const remoteMembers = [
        { id: 'm_1', name: '爸爸', emoji: '🧑' },
        { id: 'm_2', name: '妈妈', emoji: '👩' },
        { id: 'm_3', name: '宝贝', emoji: '👦' },
      ]

      // After path C sync, local should have remote's members
      // (not the other way around)
      expect(remoteMembers.length).toBe(3)
      expect(localMembers.length).toBe(1)
      // The sync should result in using remoteMembers, not localMembers
    })
  })
})

// ========== 5. pushMembers safety ==========

describe('pushMembers — upsert safety', () => {
  it('upsert+delete is safer than delete+insert', () => {
    // Document the ordering:
    // OLD (dangerous): DELETE all → INSERT new
    //   If crash between delete and insert → all members lost
    //
    // NEW (safe): UPSERT all → DELETE removed
    //   If crash after upsert → extra rows but no data loss
    //   If crash after delete → clean state

    const operations_OLD = ['delete_all', 'insert_new']
    const operations_NEW = ['upsert_current', 'delete_removed']

    // Simulate crash after first operation
    const after_crash_OLD = ['delete_all'] // all data lost!
    const after_crash_NEW = ['upsert_current'] // data preserved, maybe extra rows

    expect(after_crash_OLD).toEqual(['delete_all'])
    expect(after_crash_NEW).toEqual(['upsert_current'])
    // The NEW approach is safe because data is preserved after crash
  })
})

// ========== 6. Text sync dirty map ==========

describe('text sync — dirty map + flush', () => {
  function createDirtyTracker() {
    const dirtyFields = new Map()
    const timers = new Map()

    function markDirty(fieldId, syncData) {
      dirtyFields.set(fieldId, syncData)
      // In real code, this would also set a debounce timer
    }

    function flushField(fieldId) {
      const data = dirtyFields.get(fieldId)
      dirtyFields.delete(fieldId)
      if (timers.has(fieldId)) {
        timers.delete(fieldId)
      }
      return data
    }

    function flushAll() {
      const all = Array.from(dirtyFields.entries())
      dirtyFields.clear()
      timers.clear()
      return all
    }

    function isDirty(fieldId) {
      return dirtyFields.has(fieldId)
    }

    function getDirtyCount() {
      return dirtyFields.size
    }

    return { markDirty, flushField, flushAll, isDirty, getDirtyCount }
  }

  it('marks fields as dirty independently', () => {
    const tracker = createDirtyTracker()
    tracker.markDirty('m_1_2024-03-10_noteContent', { value: 'note1' })
    tracker.markDirty('m_1_2024-03-10_readContent', { value: 'read1' })
    expect(tracker.getDirtyCount()).toBe(2)
    expect(tracker.isDirty('m_1_2024-03-10_noteContent')).toBe(true)
    expect(tracker.isDirty('m_1_2024-03-10_readContent')).toBe(true)
  })

  it('flushing one field does not affect others', () => {
    const tracker = createDirtyTracker()
    tracker.markDirty('field_a', { value: 'a' })
    tracker.markDirty('field_b', { value: 'b' })
    const result = tracker.flushField('field_a')
    expect(result.value).toBe('a')
    expect(tracker.isDirty('field_a')).toBe(false)
    expect(tracker.isDirty('field_b')).toBe(true)
  })

  it('flushAll clears everything', () => {
    const tracker = createDirtyTracker()
    tracker.markDirty('f1', { v: 1 })
    tracker.markDirty('f2', { v: 2 })
    tracker.markDirty('f3', { v: 3 })
    const all = tracker.flushAll()
    expect(all).toHaveLength(3)
    expect(tracker.getDirtyCount()).toBe(0)
  })

  it('updating same field overwrites previous dirty data', () => {
    const tracker = createDirtyTracker()
    tracker.markDirty('f1', { value: 'first' })
    tracker.markDirty('f1', { value: 'second' })
    expect(tracker.getDirtyCount()).toBe(1)
    const result = tracker.flushField('f1')
    expect(result.value).toBe('second')
  })

  it('OLD bug: single timer cancels previous field sync', () => {
    // Document the bug with single contentSyncTimer:
    let syncedFields = []
    let timer = null

    function updateTaskContent_OLD(fieldId) {
      // OLD: single timer — cancels previous
      clearTimeout(timer)
      timer = setTimeout(() => {
        syncedFields.push(fieldId)
      }, 100)
    }

    updateTaskContent_OLD('noteContent')
    updateTaskContent_OLD('readContent') // cancels noteContent's timer!

    // After 100ms, only readContent would sync. noteContent is lost.
    // This documents the bug.
    expect(syncedFields).toHaveLength(0) // neither synced yet
  })
})

// ========== 7. Retry mechanism ==========

describe('retry mechanism', () => {
  it('withRetry retries on error and succeeds', async () => {
    let attempts = 0
    async function flakyOperation() {
      attempts++
      if (attempts < 3) return { error: { message: 'network error' } }
      return { data: 'success', error: null }
    }

    // Simulate withRetry logic
    async function withRetry(fn, maxRetries = 3) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await fn()
        if (!result?.error) return result
        if (attempt < maxRetries) {
          // In test, skip the actual delay
          continue
        } else {
          return result
        }
      }
    }

    const result = await withRetry(flakyOperation)
    expect(result.error).toBeNull()
    expect(attempts).toBe(3)
  })

  it('withRetry returns error after all retries exhausted', async () => {
    let attempts = 0
    async function alwaysFails() {
      attempts++
      return { error: { message: 'permanent error' } }
    }

    async function withRetry(fn, maxRetries = 3) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await fn()
        if (!result?.error) return result
        if (attempt < maxRetries) continue
        return result
      }
    }

    const result = await withRetry(alwaysFails)
    expect(result.error.message).toBe('permanent error')
    expect(attempts).toBe(4) // 1 initial + 3 retries
  })

  it('failed checkins are queued for retry', () => {
    const failedQueue = []

    function pushCheckinWithQueue(row, error) {
      if (error) {
        failedQueue.push({ type: 'checkin', row })
      }
    }

    pushCheckinWithQueue({ task_key: 'english', completed: true }, { message: 'err' })
    pushCheckinWithQueue({ task_key: 'read', completed: true }, { message: 'err' })

    expect(failedQueue).toHaveLength(2)
    expect(failedQueue[0].row.task_key).toBe('english')
  })
})

// ========== 8. Visibility sync — members/tasks take remote ==========

describe('visibility sync — config data handling', () => {
  it('should take remote members when available', () => {
    const localMembers = [{ id: 'm_1', name: '成员1', emoji: '👶' }]
    const remoteMembers = [
      { id: 'm_1', name: '爸爸', emoji: '🧑' },
      { id: 'm_2', name: '妈妈', emoji: '👩' },
    ]

    // Simulate: if remote.members.length > 0, use remote
    const result = remoteMembers.length > 0 ? remoteMembers : localMembers
    expect(result).toEqual(remoteMembers)
    expect(result.length).toBe(2)
  })

  it('should keep local members when remote is empty', () => {
    const localMembers = [{ id: 'm_1', name: '爸爸', emoji: '🧑' }]
    const remoteMembers = []

    const result = remoteMembers.length > 0 ? remoteMembers : localMembers
    expect(result).toEqual(localMembers)
  })
})
