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

describe('useAuth.js: email auth methods', () => {
  const authCode = () => readFileSync(resolve(root, 'src/hooks/useAuth.js'), 'utf-8')

  it('should export signUpWithEmail function', () => {
    const code = authCode()
    expect(code).toMatch(/signUpWithEmail/)
    expect(code).toMatch(/auth\.signUp\s*\(/)
  })

  it('should export signInWithEmail function', () => {
    const code = authCode()
    expect(code).toMatch(/signInWithEmail/)
    expect(code).toMatch(/signInWithPassword\s*\(\s*\{[^}]*email/)
  })

  it('should export bindEmail function', () => {
    const code = authCode()
    expect(code).toMatch(/bindEmail/)
    expect(code).toMatch(/bind-email/)
  })

  it('should export bindPhone function', () => {
    const code = authCode()
    expect(code).toMatch(/bindPhone/)
    expect(code).toMatch(/bind-phone/)
  })

  it('should return all new methods in hook return', () => {
    const code = authCode()
    expect(code).toMatch(/signUpWithEmail/)
    expect(code).toMatch(/signInWithEmail/)
    expect(code).toMatch(/bindEmail/)
    expect(code).toMatch(/bindPhone/)
  })
})

describe('Edge Functions: shared derive-password', () => {
  it('_shared/derive-password.ts should exist and export derivePassword', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/_shared/derive-password.ts'), 'utf-8')
    expect(code).toMatch(/export\s+(async\s+)?function\s+derivePassword/)
  })

  it('verify-otp should import derivePassword from _shared', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/verify-otp/index.ts'), 'utf-8')
    expect(code).toMatch(/import.*derivePassword.*from.*['"]\.\.\/\_shared\/derive-password/)
  })
})

describe('Edge Function: bind-email', () => {
  it('bind-email/index.ts should exist', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toBeTruthy()
  })

  it('should validate email format', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/email/)
    expect(code).toMatch(/@/)
  })

  it('should use admin API to create user', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/admin/)
    expect(code).toMatch(/createUser|listUsers/)
  })

  it('should check household_users for conflicts', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/household_users/)
    expect(code).toMatch(/conflict/)
  })

  it('should support confirmed flag for conflict override', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/confirmed/)
  })

  it('should generate verification link', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/generateLink/)
  })

  it('should use CORS headers', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/corsHeaders/)
  })
})

describe('Edge Function: bind-phone', () => {
  it('bind-phone/index.ts should exist', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-phone/index.ts'), 'utf-8')
    expect(code).toBeTruthy()
  })

  it('should verify OTP via Aliyun', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-phone/index.ts'), 'utf-8')
    expect(code).toMatch(/CheckSmsVerifyCode/)
    expect(code).toMatch(/callAliyunApi/)
  })

  it('should use derivePassword from shared module', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-phone/index.ts'), 'utf-8')
    expect(code).toMatch(/import.*derivePassword.*from.*['"]\.\.\/\_shared\/derive-password/)
  })

  it('should check household_users for conflicts', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-phone/index.ts'), 'utf-8')
    expect(code).toMatch(/household_users/)
    expect(code).toMatch(/conflict/)
  })

  it('should support confirmed flag', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-phone/index.ts'), 'utf-8')
    expect(code).toMatch(/confirmed/)
  })
})

describe('SettingsPage: login tab switching', () => {
  const settingsCode = () => readFileSync(resolve(root, 'src/components/SettingsPage.jsx'), 'utf-8')

  it('should have login method tabs (phone/email)', () => {
    const code = settingsCode()
    expect(code).toMatch(/手机登录/)
    expect(code).toMatch(/邮箱登录/)
  })

  it('should have email input field', () => {
    const code = settingsCode()
    expect(code).toMatch(/type="email"/)
  })

  it('should have password input field', () => {
    const code = settingsCode()
    expect(code).toMatch(/type="password"/)
  })

  it('should have register and login buttons for email', () => {
    const code = settingsCode()
    expect(code).toMatch(/注册/)
    expect(code).toMatch(/signUpWithEmail|signInWithEmail/)
  })
})

describe('SettingsPage: binding UI', () => {
  const settingsCode = () => readFileSync(resolve(root, 'src/components/SettingsPage.jsx'), 'utf-8')

  it('should show bind email button for phone users', () => {
    const code = settingsCode()
    expect(code).toMatch(/绑定邮箱/)
  })

  it('should show bind phone button for email users', () => {
    const code = settingsCode()
    expect(code).toMatch(/绑定手机/)
  })

  it('should have bindEmail call', () => {
    const code = settingsCode()
    expect(code).toMatch(/bindEmail/)
  })

  it('should have bindPhone call', () => {
    const code = settingsCode()
    expect(code).toMatch(/bindPhone/)
  })
})

describe('App.jsx: householdId and authMethod threading', () => {
  const appCode = () => readFileSync(resolve(root, 'src/App.jsx'), 'utf-8')

  it('should pass householdId to SettingsPage', () => {
    const code = appCode()
    expect(code).toMatch(/householdId=/)
  })

  it('should detect authMethod and pass to handleLoginSuccess', () => {
    const code = appCode()
    expect(code).toMatch(/handleLoginSuccess\(auth\.user,\s*authMethod\)/)
  })
})
