import { supabase } from './supabase'

const HOUSEHOLD_KEY = 'flt_household_id'

// Cloud sync is disabled until user logs in
let syncEnabled = false
export function setSyncEnabled(v) { syncEnabled = v }
export function isSyncEnabled() { return syncEnabled }

// Retry wrapper with exponential backoff
async function withRetry(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await fn()
    if (!result?.error) return result
    if (attempt < maxRetries) {
      console.warn(`Sync retry ${attempt + 1}/${maxRetries}:`, result.error.message)
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
    } else {
      return result
    }
  }
}

// Failed sync queue — retried on next visibility sync
const failedQueue = []
export function getFailedQueue() { return failedQueue }

// Generate or retrieve household ID from localStorage
// Supports URL parameter ?h=<id> to join an existing household
export function getOrInitHouseholdId() {
  // Check URL parameter first — allows sharing household via link
  const params = new URLSearchParams(window.location.search)
  const urlId = params.get('h')
  if (urlId) {
    localStorage.setItem(HOUSEHOLD_KEY, urlId)
    // Clean URL without reload
    const clean = window.location.pathname + window.location.hash
    window.history.replaceState(null, '', clean)
    return urlId
  }

  let id = localStorage.getItem(HOUSEHOLD_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(HOUSEHOLD_KEY, id)
  }
  return id
}

// Ensure household row exists in Supabase
export async function ensureHousehold(householdId) {
  if (!supabase || !syncEnabled) return
  const { error } = await supabase
    .from('households')
    .upsert({ id: householdId }, { onConflict: 'id' })
  if (error) console.warn('ensureHousehold error:', error)
}

// Push members to Supabase (upsert + remove deleted — safe against network failures)
export async function pushMembers(householdId, members) {
  if (!supabase || !syncEnabled) return
  const rows = members.map((m, i) => ({
    id: m.id,
    household_id: householdId,
    name: m.name,
    emoji: m.emoji,
    sort_order: i,
  }))
  if (rows.length > 0) {
    // Step 1: Upsert current members (safe — no data loss if crash here)
    const { error } = await supabase
      .from('members')
      .upsert(rows, { onConflict: 'id,household_id' })
    if (error) { console.warn('pushMembers upsert error:', error); return }
    // Step 2: Delete members no longer in the list
    const currentIds = members.map(m => m.id)
    const { error: delError } = await supabase
      .from('members')
      .delete()
      .eq('household_id', householdId)
      .not('id', 'in', `(${currentIds.join(',')})`)
    if (delError) console.warn('pushMembers delete error:', delError)
  }
}

// Push tasks to Supabase (upsert + remove deleted — safe against network failures)
export async function pushTasks(householdId, tasks) {
  if (!supabase || !syncEnabled) return
  const rows = tasks.map((t, i) => ({
    id: t.id,
    household_id: householdId,
    key: t.key,
    label: t.label,
    emoji: t.emoji,
    type: t.type,
    sort_order: i,
  }))
  if (rows.length > 0) {
    // Step 1: Upsert current tasks (safe — no data loss if crash here)
    const { error } = await supabase
      .from('tasks')
      .upsert(rows, { onConflict: 'id,household_id' })
    if (error) { console.warn('pushTasks upsert error:', error); return }
    // Step 2: Delete tasks no longer in the list
    const currentIds = tasks.map(t => t.id)
    const { error: delError } = await supabase
      .from('tasks')
      .delete()
      .eq('household_id', householdId)
      .not('id', 'in', `(${currentIds.join(',')})`)
    if (delError) console.warn('pushTasks delete error:', delError)
  }
}

// Push a single checkin record (upsert by unique constraint) with retry
export async function pushCheckin(householdId, memberId, date, taskKey, completed, content) {
  if (!supabase || !syncEnabled) return
  const row = {
    household_id: householdId,
    member_id: memberId,
    date,
    task_key: taskKey,
    completed,
    content: content || null,
    updated_at: new Date().toISOString(),
  }
  const result = await withRetry(() =>
    supabase
      .from('checkins')
      .upsert(row, { onConflict: 'household_id,member_id,date,task_key' })
  )
  if (result?.error) {
    console.warn('pushCheckin failed after retries:', result.error)
    // Queue for retry on next visibility sync
    failedQueue.push({ type: 'checkin', row })
  }
}

// Push all checkins for a given data map (bulk sync)
export async function pushAllCheckins(householdId, data, tasks) {
  if (!supabase || !syncEnabled) return
  const rows = []
  for (const [key, entry] of Object.entries(data)) {
    // key format: memberId_YYYY-MM-DD (memberId may contain underscores like m_1)
    // Use lastIndexOf since date part (YYYY-MM-DD) has no underscores
    const underscoreIdx = key.lastIndexOf('_')
    if (underscoreIdx === -1) continue
    const memberId = key.substring(0, underscoreIdx)
    const date = key.substring(underscoreIdx + 1)
    // Validate date format to skip malformed keys
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (!entry.tasks) continue

    for (const task of tasks) {
      const completed = !!entry.tasks[task.key]
      const contentKey = task.key + 'Content'
      const content = entry[contentKey] || null
      // Push if: completed, has content, or user explicitly interacted (key exists in tasks obj)
      const hasInteracted = task.key in (entry.tasks || {})
      if (!completed && !content && !hasInteracted) continue
      rows.push({
        household_id: householdId,
        member_id: memberId,
        date,
        task_key: task.key,
        completed,
        content,
        updated_at: new Date().toISOString(),
      })
    }
  }
  if (rows.length === 0) return
  // Batch upsert in chunks of 500
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase
      .from('checkins')
      .upsert(chunk, { onConflict: 'household_id,member_id,date,task_key' })
    if (error) console.warn('pushAllCheckins error:', error)
  }
}

// Pull all data for a household
export async function pullAll(householdId) {
  if (!supabase || !syncEnabled) return null
  const [membersRes, tasksRes, checkinsRes] = await Promise.all([
    supabase.from('members').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('tasks').select('*').eq('household_id', householdId).order('sort_order'),
    supabase.from('checkins').select('*').eq('household_id', householdId),
  ])
  if (membersRes.error || tasksRes.error || checkinsRes.error) {
    console.warn('pullAll errors:', membersRes.error, tasksRes.error, checkinsRes.error)
    return null
  }
  return {
    members: membersRes.data.map(m => ({ id: m.id, name: m.name, emoji: m.emoji })),
    tasks: tasksRes.data.map(t => ({ id: t.id, key: t.key, label: t.label, emoji: t.emoji, type: t.type })),
    checkins: checkinsRes.data,
  }
}

// Bind a user to a household (upsert into household_users)
export async function bindHouseholdToUser(householdId, userId, authMethod) {
  if (!supabase) return
  const { error } = await supabase
    .from('household_users')
    .upsert(
      { household_id: householdId, user_id: userId, auth_method: authMethod },
      { onConflict: 'user_id' }
    )
  if (error) console.warn('bindHouseholdToUser error:', error)
}

// Get all bound accounts for a household
export async function getBoundAccounts(householdId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('household_users')
    .select('user_id, auth_method')
    .eq('household_id', householdId)
  if (error) {
    console.warn('getBoundAccounts error:', error)
    return []
  }
  return data || []
}

// Find household belonging to a user
export async function findUserHousehold(userId) {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('household_users')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('findUserHousehold error:', error)
    return null
  }
  return data?.household_id ?? null
}

// Switch to a different household (update localStorage)
export function switchHousehold(newHouseholdId) {
  localStorage.setItem(HOUSEHOLD_KEY, newHouseholdId)
}

// Convert Supabase checkins to localStorage flat map format
export function checkinsToLocalFormat(checkins) {
  const data = {}
  for (const c of checkins) {
    const key = `${c.member_id}_${c.date}`
    if (!data[key]) {
      data[key] = { tasks: {}, notes: { see: '', know: '', do: '' }, readContent: '', noteContent: '' }
    }
    if (c.completed) {
      data[key].tasks[c.task_key] = true
    }
    if (c.content) {
      data[key][c.task_key + 'Content'] = c.content
    }
  }
  return data
}

// Deep merge remote checkins into local data
// Rule: per-task last-write-wins using updated_at timestamps
export function mergeCheckins(localData, remoteCheckins) {
  const merged = {}
  // Deep copy local data
  for (const [key, entry] of Object.entries(localData)) {
    merged[key] = JSON.parse(JSON.stringify(entry))
  }
  // Merge each remote checkin record
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
      // Remote is newer (or no local timestamp) — take remote values
      entry.tasks[c.task_key] = c.completed
      if (c.content != null) {
        entry[c.task_key + 'Content'] = c.content
      } else {
        // Remote has no content — clear local if remote is newer
        entry[c.task_key + 'Content'] = ''
      }
      entry._updatedAt[c.task_key] = remoteTs
    }
    // else: local is newer, keep local values
  }
  return merged
}
