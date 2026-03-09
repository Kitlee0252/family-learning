import { STORAGE_KEY_MEMBERS, STORAGE_KEY_DATA, STORAGE_KEY_MIGRATED, MEMBER_EMOJIS } from './constants'

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw)
  } catch (e) {
    console.warn('Load error:', key, e)
  }
  return fallback
}

function migrateNotes(entry) {
  if (!entry || !entry.notes) return entry
  if (entry.notes.content !== undefined && entry.notes.see === undefined) {
    entry.notes = {
      see: entry.notes.content || '',
      know: '',
      do: '',
    }
  }
  return entry
}

export function migrateData() {
  if (localStorage.getItem(STORAGE_KEY_MIGRATED)) return

  const oldMembers = loadJSON(STORAGE_KEY_MEMBERS, null)
  const oldData = loadJSON(STORAGE_KEY_DATA, null)

  if (!oldMembers || !Array.isArray(oldMembers)) return

  // Already in new format
  if (oldMembers.length > 0 && typeof oldMembers[0] === 'object' && oldMembers[0].id) {
    localStorage.setItem(STORAGE_KEY_MIGRATED, '1')
    return
  }

  // Old format: string array
  const newMembers = oldMembers.map((name, i) => ({
    id: 'm_' + (i + 1),
    name: name,
    emoji: MEMBER_EMOJIS[i % MEMBER_EMOJIS.length],
  }))

  if (oldData) {
    const newData = {}
    Object.entries(oldData).forEach(([key, value]) => {
      let migrated = false
      for (const member of newMembers) {
        const prefix = member.name + '_'
        if (key.startsWith(prefix)) {
          const dateStr = key.slice(prefix.length)
          newData[member.id + '_' + dateStr] = migrateNotes(value)
          migrated = true
          break
        }
      }
      if (!migrated) {
        newData[key] = migrateNotes(value)
      }
    })
    localStorage.setItem(STORAGE_KEY_DATA, JSON.stringify(newData))
  }

  localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify(newMembers))
  localStorage.setItem(STORAGE_KEY_MIGRATED, '1')
}
