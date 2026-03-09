import { supabase } from './supabase'

const HOUSEHOLD_KEY = 'flt_household_id'

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
  if (!supabase) return
  const { error } = await supabase
    .from('households')
    .upsert({ id: householdId }, { onConflict: 'id' })
  if (error) console.warn('ensureHousehold error:', error)
}

// Push members to Supabase (full replace)
export async function pushMembers(householdId, members) {
  if (!supabase) return
  // Delete existing then insert — simpler than upsert for ordered list
  await supabase.from('members').delete().eq('household_id', householdId)
  const rows = members.map((m, i) => ({
    id: m.id,
    household_id: householdId,
    name: m.name,
    emoji: m.emoji,
    sort_order: i,
  }))
  if (rows.length > 0) {
    const { error } = await supabase.from('members').insert(rows)
    if (error) console.warn('pushMembers error:', error)
  }
}

// Push tasks to Supabase (full replace)
export async function pushTasks(householdId, tasks) {
  if (!supabase) return
  await supabase.from('tasks').delete().eq('household_id', householdId)
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
    const { error } = await supabase.from('tasks').insert(rows)
    if (error) console.warn('pushTasks error:', error)
  }
}

// Push a single checkin record (upsert by unique constraint)
export async function pushCheckin(householdId, memberId, date, taskKey, completed, content) {
  if (!supabase) return
  const { error } = await supabase
    .from('checkins')
    .upsert({
      household_id: householdId,
      member_id: memberId,
      date,
      task_key: taskKey,
      completed,
      content: content || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id,member_id,date,task_key' })
  if (error) console.warn('pushCheckin error:', error)
}

// Push all checkins for a given data map (bulk sync)
export async function pushAllCheckins(householdId, data, tasks) {
  if (!supabase) return
  const rows = []
  for (const [key, entry] of Object.entries(data)) {
    // key format: memberId_YYYY-MM-DD
    const underscoreIdx = key.indexOf('_')
    if (underscoreIdx === -1) continue
    const memberId = key.substring(0, underscoreIdx)
    const date = key.substring(underscoreIdx + 1)
    if (!entry.tasks) continue

    for (const task of tasks) {
      const completed = !!entry.tasks[task.key]
      const contentKey = task.key + 'Content'
      const content = entry[contentKey] || null
      if (!completed && !content) continue // skip empty entries
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
  if (!supabase) return null
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
