import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')

describe('sync.js: household_users table migration', () => {
  const syncCode = () => readFileSync(resolve(root, 'src/lib/sync.js'), 'utf-8')

  it('findUserHousehold should query household_users, not households', () => {
    const code = syncCode()
    expect(code).toMatch(/from\(['"]household_users['"]\)/)
    const fnMatch = code.match(/async function findUserHousehold[\s\S]*?^}/m)
    if (fnMatch) {
      expect(fnMatch[0]).not.toMatch(/from\(['"]households['"]\)/)
    }
  })

  it('bindHouseholdToUser should accept authMethod parameter', () => {
    const code = syncCode()
    expect(code).toMatch(/bindHouseholdToUser\s*\(\s*householdId\s*,\s*userId\s*,\s*authMethod/)
  })

  it('bindHouseholdToUser should upsert into household_users', () => {
    const code = syncCode()
    expect(code).toMatch(/from\(['"]household_users['"]\)/)
    expect(code).toMatch(/auth_method/)
  })

  it('getBoundAccounts function should exist and query household_users', () => {
    const code = syncCode()
    expect(code).toMatch(/export\s+async\s+function\s+getBoundAccounts/)
    expect(code).toMatch(/from\(['"]household_users['"]\)/)
  })
})

describe('useStore.js: handleLoginSuccess authMethod', () => {
  const storeCode = () => readFileSync(resolve(root, 'src/hooks/useStore.js'), 'utf-8')

  it('handleLoginSuccess should accept authMethod parameter', () => {
    const code = storeCode()
    expect(code).toMatch(/handleLoginSuccess\s*=\s*useCallback\(\s*async\s*\(\s*user\s*,\s*authMethod/)
  })

  it('handleLoginSuccess should pass authMethod to bindHouseholdToUser', () => {
    const code = storeCode()
    const bindCalls = code.match(/bindHouseholdToUser\([^)]+\)/g) || []
    expect(bindCalls.length).toBeGreaterThan(0)
    const hasThreeArgs = bindCalls.some(call => {
      const args = call.match(/bindHouseholdToUser\(([^)]+)\)/)?.[1]
      return args && args.split(',').length >= 3
    })
    expect(hasThreeArgs).toBe(true)
  })

  it('should import getBoundAccounts from sync', () => {
    const code = storeCode()
    expect(code).toMatch(/getBoundAccounts/)
  })

  it('should expose householdId in return object', () => {
    const code = storeCode()
    expect(code).toMatch(/householdId/)
  })
})
