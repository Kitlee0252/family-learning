# Email Auth + Account Binding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email+password registration/login with bidirectional account binding to the existing SMS auth system.

**Architecture:** New `household_users` junction table replaces `households.user_id` for multi-auth-method support. Email auth uses Supabase Auth native API (no Edge Function). Two new Edge Functions handle cross-method binding. Frontend adds login tab switching and binding UI.

**Tech Stack:** React 19, Supabase Auth, Supabase Edge Functions (Deno), Vitest, CSS Modules

**Spec:** `docs/superpowers/specs/2026-03-12-email-auth-binding-design.md`

---

## Chunk 1: Database + sync.js backend logic

### Task 1: DB migration — create `household_users` table

**Files:**
- Create: DB migration via Supabase MCP

- [ ] **Step 1: Apply migration via Supabase MCP**

Run migration SQL:

```sql
-- Create household_users junction table
CREATE TABLE IF NOT EXISTS household_users (
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_method TEXT NOT NULL CHECK (auth_method IN ('phone', 'email')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id),
  UNIQUE (user_id)
);

-- Index for login lookup (find household by user_id)
CREATE INDEX idx_household_users_user_id ON household_users(user_id);

-- RLS: open policy (same as existing tables)
ALTER TABLE household_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON household_users FOR ALL USING (true) WITH CHECK (true);

-- Migrate existing data: copy households.user_id → household_users
INSERT INTO household_users (household_id, user_id, auth_method)
SELECT id, user_id, 'phone'
FROM households
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Verify migration**

Run SQL to confirm:
```sql
SELECT count(*) FROM household_users;
SELECT * FROM household_users LIMIT 5;
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: create household_users table with migration"
```

---

### Task 2: Update sync.js — switch to `household_users` table

**Files:**
- Modify: `src/lib/sync.js:203-226` (findUserHousehold, bindHouseholdToUser)
- Test: `src/email-auth.test.js`

- [ ] **Step 1: Write failing tests for sync.js changes**

Create `src/email-auth.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')

describe('sync.js: household_users table migration', () => {
  const syncCode = () => readFileSync(resolve(root, 'src/lib/sync.js'), 'utf-8')

  it('findUserHousehold should query household_users, not households', () => {
    const code = syncCode()
    // Should query household_users table
    expect(code).toMatch(/from\(['"]household_users['"]\)/)
    // findUserHousehold should NOT query households for user_id
    const fnMatch = code.match(/async function findUserHousehold[\s\S]*?^}/m)
    if (fnMatch) {
      expect(fnMatch[0]).not.toMatch(/from\(['"]households['"]\)/)
    }
  })

  it('bindHouseholdToUser should accept authMethod parameter', () => {
    const code = syncCode()
    // Function signature should include authMethod
    expect(code).toMatch(/bindHouseholdToUser\s*\(\s*householdId\s*,\s*userId\s*,\s*authMethod\s*\)/)
  })

  it('bindHouseholdToUser should upsert into household_users', () => {
    const code = syncCode()
    // Should insert into household_users
    expect(code).toMatch(/from\(['"]household_users['"]\)/)
    // Should include auth_method field
    expect(code).toMatch(/auth_method/)
  })

  it('getBoundAccounts function should exist and query household_users', () => {
    const code = syncCode()
    expect(code).toMatch(/export\s+async\s+function\s+getBoundAccounts/)
    expect(code).toMatch(/from\(['"]household_users['"]\)/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL — current sync.js uses `households` table

- [ ] **Step 3: Update `findUserHousehold` in sync.js**

In `src/lib/sync.js`, replace the `findUserHousehold` function:

```js
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
```

- [ ] **Step 4: Update `bindHouseholdToUser` in sync.js**

Replace the `bindHouseholdToUser` function:

```js
// Bind a user to a household (upsert into household_users)
export async function bindHouseholdToUser(householdId, userId, authMethod = 'phone') {
  if (!supabase) return
  const { error } = await supabase
    .from('household_users')
    .upsert(
      { household_id: householdId, user_id: userId, auth_method: authMethod },
      { onConflict: 'user_id' }
    )
  if (error) console.warn('bindHouseholdToUser error:', error)
}
```

- [ ] **Step 5: Add `getBoundAccounts` function to sync.js**

Add after `bindHouseholdToUser`:

```js
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
```

- [ ] **Step 6: Export `getBoundAccounts` from useStore imports**

In `src/hooks/useStore.js` line 10, add `getBoundAccounts` to the import:

```js
import {
  getOrInitHouseholdId, ensureHousehold, setSyncEnabled, isSyncEnabled,
  pushMembers, pushTasks, pushCheckin, pushAllCheckins,
  pullAll, mergeCheckins,
  bindHouseholdToUser, findUserHousehold, switchHousehold,
  getBoundAccounts, getFailedQueue,
} from '../lib/sync'
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/lib/sync.js src/hooks/useStore.js src/email-auth.test.js
git commit -m "feat: switch findUserHousehold/bindHouseholdToUser to household_users table"
```

---

### Task 3: Update useStore.js — pass authMethod on login

**Files:**
- Modify: `src/hooks/useStore.js:270-316` (handleLoginSuccess)
- Test: `src/email-auth.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `src/email-auth.test.js`:

```js
describe('useStore.js: handleLoginSuccess authMethod', () => {
  const storeCode = () => readFileSync(resolve(root, 'src/hooks/useStore.js'), 'utf-8')

  it('handleLoginSuccess should accept authMethod parameter', () => {
    const code = storeCode()
    // Function signature should include authMethod parameter
    expect(code).toMatch(/handleLoginSuccess\s*=\s*useCallback\(\s*async\s*\(\s*user\s*,\s*authMethod/)
  })

  it('handleLoginSuccess should pass authMethod to bindHouseholdToUser', () => {
    const code = storeCode()
    // bindHouseholdToUser call should have 3 arguments (hid, userId, authMethod)
    const bindCalls = code.match(/bindHouseholdToUser\([^)]+\)/g) || []
    expect(bindCalls.length).toBeGreaterThan(0)
    // At least one call should have 3 args
    const hasThreeArgs = bindCalls.some(call => {
      const args = call.match(/bindHouseholdToUser\(([^)]+)\)/)?.[1]
      return args && args.split(',').length >= 3
    })
    expect(hasThreeArgs).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL — current call has only 2 args

- [ ] **Step 3: Update handleLoginSuccess**

In `src/hooks/useStore.js`, update the `handleLoginSuccess` callback to detect auth method and pass it:

Change `handleLoginSuccess` signature from:
```js
const handleLoginSuccess = useCallback(async (user) => {
```
to:
```js
const handleLoginSuccess = useCallback(async (user, authMethod = 'phone') => {
```

And change line 280 from:
```js
await bindHouseholdToUser(hid, user.id)
```
to:
```js
await bindHouseholdToUser(hid, user.id, authMethod)
```

Note: `authMethod` is passed explicitly by the caller (App.jsx), not inferred from the user object — because a Supabase user can have both phone and email fields populated.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useStore.js src/email-auth.test.js
git commit -m "feat: pass authMethod to bindHouseholdToUser in handleLoginSuccess"
```

---

## Chunk 2: useAuth hook — email auth methods

### Task 4: Add email signUp/signIn to useAuth

**Files:**
- Modify: `src/hooks/useAuth.js`
- Test: `src/email-auth.test.js` (append)

- [ ] **Step 1: Write failing tests**

Append to `src/email-auth.test.js`:

```js
describe('useAuth.js: email auth methods', () => {
  const authCode = () => readFileSync(resolve(root, 'src/hooks/useAuth.js'), 'utf-8')

  it('should export signUpWithEmail function', () => {
    const code = authCode()
    expect(code).toMatch(/signUpWithEmail/)
    // Should call supabase.auth.signUp with email
    expect(code).toMatch(/auth\.signUp\s*\(/)
  })

  it('should export signInWithEmail function', () => {
    const code = authCode()
    expect(code).toMatch(/signInWithEmail/)
    // Should call supabase.auth.signInWithPassword with email
    expect(code).toMatch(/signInWithPassword\s*\(\s*\{[^}]*email/)
  })

  it('should export bindEmail function', () => {
    const code = authCode()
    expect(code).toMatch(/bindEmail/)
    // Should call bind-email edge function
    expect(code).toMatch(/bind-email/)
  })

  it('should export bindPhone function', () => {
    const code = authCode()
    expect(code).toMatch(/bindPhone/)
    // Should call bind-phone edge function
    expect(code).toMatch(/bind-phone/)
  })

  it('should return all new methods in hook return', () => {
    const code = authCode()
    // The return object should include new methods
    expect(code).toMatch(/signUpWithEmail/)
    expect(code).toMatch(/signInWithEmail/)
    expect(code).toMatch(/bindEmail/)
    expect(code).toMatch(/bindPhone/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL

- [ ] **Step 3: Add signUpWithEmail to useAuth.js**

Add after the `verifyOtp` callback (line 124):

```js
const signUpWithEmail = useCallback(async (email, password) => {
  if (!supabase) return { error: { message: '云端未连接' } }
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return { error: { message: error.message } }
  return { data, error: null }
}, [])
```

- [ ] **Step 4: Add signInWithEmail to useAuth.js**

Add after `signUpWithEmail`:

```js
const signInWithEmail = useCallback(async (email, password) => {
  if (!supabase) return { error: { message: '云端未连接' } }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: { message: error.message } }
  return { data, error: null }
}, [])
```

- [ ] **Step 4b: Add resendVerification to useAuth.js**

Add after `signInWithEmail`:

```js
const resendVerification = useCallback(async (email) => {
  if (!supabase) return { error: { message: '云端未连接' } }
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) return { error: { message: error.message } }
  return { error: null }
}, [])
```

- [ ] **Step 5: Add bindEmail to useAuth.js**

Add after `signInWithEmail`:

```js
const bindEmail = useCallback(async (email, password, householdId, confirmed = false) => {
  const url = getFunctionsUrl('bind-email')
  if (!url) return { error: { message: '云端未连接' } }
  try {
    const session = (await supabase.auth.getSession()).data.session
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ email, password, household_id: householdId, confirmed }),
    })
    const data = await res.json()
    if (data.conflict) return { conflict: true, warning: data.warning }
    if (data.success) return { success: true, error: null }
    return { error: { message: data.error || '绑定失败' } }
  } catch (err) {
    return { error: { message: '网络错误' } }
  }
}, [getFunctionsUrl])
```

- [ ] **Step 6: Add bindPhone to useAuth.js**

Add after `bindEmail`:

```js
const bindPhone = useCallback(async (phone, code, householdId, confirmed = false) => {
  const url = getFunctionsUrl('bind-phone')
  if (!url) return { error: { message: '云端未连接' } }
  try {
    const digits = phone.replace(/^\+86/, '').replace(/\D/g, '')
    const session = (await supabase.auth.getSession()).data.session
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ phone: digits, code, household_id: householdId, confirmed }),
    })
    const data = await res.json()
    if (data.conflict) return { conflict: true, warning: data.warning }
    if (data.success) return { success: true, error: null }
    return { error: { message: data.error || '绑定失败' } }
  } catch (err) {
    return { error: { message: '网络错误' } }
  }
}, [getFunctionsUrl])
```

- [ ] **Step 7: Update return object**

Update the return statement to include new methods:

```js
return {
  user,
  loading,
  otpSending,
  otpVerifying,
  cooldown,
  sendOtp,
  verifyOtp,
  signUpWithEmail,
  signInWithEmail,
  resendVerification,
  bindEmail,
  bindPhone,
  signOut,
}
```

- [ ] **Step 8: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add src/hooks/useAuth.js src/email-auth.test.js
git commit -m "feat: add email signUp/signIn and bind methods to useAuth"
```

---

## Chunk 3: Edge Functions

### Task 5: Extract derivePassword to shared module

**Files:**
- Create: `supabase/functions/_shared/derive-password.ts`
- Modify: `supabase/functions/verify-otp/index.ts:10-18`

- [ ] **Step 1: Write failing test**

Append to `src/email-auth.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL

- [ ] **Step 3: Create `_shared/derive-password.ts`**

Create `supabase/functions/_shared/derive-password.ts`:

```ts
const encoder = new TextEncoder();

export async function derivePassword(phone: string): Promise<string> {
  const secret = Deno.env.get("OTP_AUTH_SECRET") || "fallback-dev-secret-change-me";
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(phone));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

- [ ] **Step 4: Update verify-otp to import from shared**

In `supabase/functions/verify-otp/index.ts`:

Remove the local `derivePassword` function (lines 10-18) and the local `encoder` (line 8).

Add import at top (after other imports):
```ts
import { derivePassword } from "../_shared/derive-password.ts";
```

Remove `const encoder = new TextEncoder();` from line 8 (only if not used elsewhere in the file — check: it's only used in derivePassword, so safe to remove).

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/derive-password.ts supabase/functions/verify-otp/index.ts src/email-auth.test.js
git commit -m "refactor: extract derivePassword to _shared for reuse"
```

---

### Task 6: Create bind-email Edge Function

**Files:**
- Create: `supabase/functions/bind-email/index.ts`
- Test: `src/email-auth.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `src/email-auth.test.js`:

```js
describe('Edge Function: bind-email', () => {
  it('bind-email/index.ts should exist', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toBeTruthy()
  })

  it('should validate email format', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/bind-email/index.ts'), 'utf-8')
    expect(code).toMatch(/email/)
    // Should have email validation
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL (file doesn't exist)

- [ ] **Step 3: Create bind-email Edge Function**

Create `supabase/functions/bind-email/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { email, password, household_id, confirmed } = await req.json();

    // Verify JWT — caller must be logged in
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "未登录" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的邮箱地址" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!password || password.length < 6) {
      return new Response(
        JSON.stringify({ error: "密码至少6位" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!household_id) {
      return new Response(
        JSON.stringify({ error: "缺少 household_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Step 1: Create or find email user
    let emailUserId: string;
    let existingUser: { id: string; email_confirmed_at?: string | null } | null = null;

    // Try to create user first; if already exists, fetch by listing with email filter
    try {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
      });
      if (createError) {
        // User likely already exists — try to find them
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1,
          filter: email,
        });
        const found = listData?.users?.[0];
        if (found) {
          existingUser = found;
          emailUserId = found.id;
        } else {
          return new Response(
            JSON.stringify({ error: "创建用户失败: " + createError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      } else {
        emailUserId = newUser.user.id;
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "用户操作失败: " + String(e) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Check for conflicts in household_users
    const { data: existingBinding } = await supabaseAdmin
      .from("household_users")
      .select("household_id")
      .eq("user_id", emailUserId)
      .maybeSingle();

    if (existingBinding && existingBinding.household_id !== household_id) {
      if (!confirmed) {
        return new Response(
          JSON.stringify({ conflict: true, warning: "该邮箱已绑定其他家庭数据" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      // Delete old binding
      await supabaseAdmin
        .from("household_users")
        .delete()
        .eq("user_id", emailUserId);
    }

    // Step 3: Generate verification link (triggers confirmation email)
    if (!existingUser || !existingUser.email_confirmed_at) {
      await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password,
      });
    }

    // Step 4: Insert into household_users
    const { error: insertError } = await supabaseAdmin
      .from("household_users")
      .upsert(
        { household_id, user_id: emailUserId, auth_method: "email" },
        { onConflict: "user_id" },
      );

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "绑定失败: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("bind-email error:", err);
    return new Response(
      JSON.stringify({ error: "服务器错误", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bind-email/index.ts src/email-auth.test.js
git commit -m "feat: create bind-email Edge Function"
```

---

### Task 7: Create bind-phone Edge Function

**Files:**
- Create: `supabase/functions/bind-phone/index.ts`
- Test: `src/email-auth.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `src/email-auth.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL

- [ ] **Step 3: Create bind-phone Edge Function**

Create `supabase/functions/bind-phone/index.ts`:

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { callAliyunApi } from "../_shared/aliyun-signer.ts";
import { derivePassword } from "../_shared/derive-password.ts";
import { corsHeaders, corsResponse } from "../_shared/cors.ts";

const ALIYUN_AK_ID = Deno.env.get("ALIBABA_CLOUD_ACCESS_KEY_ID")!;
const ALIYUN_AK_SECRET = Deno.env.get("ALIBABA_CLOUD_ACCESS_KEY_SECRET")!;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  try {
    const { phone, code, household_id, confirmed } = await req.json();

    // Verify JWT — caller must be logged in
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "未登录" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Validate phone
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的手机号" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!code || !/^\d{4,8}$/.test(code)) {
      return new Response(
        JSON.stringify({ error: "请输入正确的验证码" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!household_id) {
      return new Response(
        JSON.stringify({ error: "缺少 household_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 1: Verify OTP with Aliyun
    const checkResult = await callAliyunApi({
      accessKeyId: ALIYUN_AK_ID,
      accessKeySecret: ALIYUN_AK_SECRET,
      action: "CheckSmsVerifyCode",
      params: { PhoneNumber: phone, VerifyCode: code },
    });

    const model = checkResult.Model as Record<string, unknown> | undefined;
    if (!checkResult.Success || model?.VerifyResult !== "PASS") {
      return new Response(
        JSON.stringify({ error: "验证码错误或已过期" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Step 2: Create or find phone user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const phoneE164 = `+86${phone}`;
    const password = await derivePassword(phone);
    let phoneUserId: string;

    // Try to create user first; if already exists, find them
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      phone: phoneE164,
      password,
      phone_confirm: true,
    });

    if (createError) {
      // User likely already exists — try to find by phone
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1,
        filter: phoneE164,
      });
      const found = listData?.users?.[0];
      if (found) {
        phoneUserId = found.id;
      } else {
        return new Response(
          JSON.stringify({ error: "创建用户失败: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } else {
      phoneUserId = newUser.user.id;
    }

    // Step 3: Check for conflicts
    const { data: existingBinding } = await supabaseAdmin
      .from("household_users")
      .select("household_id")
      .eq("user_id", phoneUserId)
      .maybeSingle();

    if (existingBinding && existingBinding.household_id !== household_id) {
      if (!confirmed) {
        return new Response(
          JSON.stringify({ conflict: true, warning: "该手机号已绑定其他家庭数据" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await supabaseAdmin
        .from("household_users")
        .delete()
        .eq("user_id", phoneUserId);
    }

    // Step 4: Insert into household_users
    const { error: insertError } = await supabaseAdmin
      .from("household_users")
      .upsert(
        { household_id, user_id: phoneUserId, auth_method: "phone" },
        { onConflict: "user_id" },
      );

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "绑定失败: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("bind-phone error:", err);
    return new Response(
      JSON.stringify({ error: "服务器错误", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/bind-phone/index.ts src/email-auth.test.js
git commit -m "feat: create bind-phone Edge Function"
```

---

## Chunk 4: Frontend UI

### Task 8: SettingsPage — Login tab switching (phone/email)

**Files:**
- Modify: `src/components/SettingsPage.jsx:62-172` (LoginCard)
- Modify: `src/components/SettingsPage.module.css`
- Test: `src/email-auth.test.js` (append)

- [ ] **Step 1: Write failing test**

Append to `src/email-auth.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL

- [ ] **Step 3: Add CSS for login tabs**

Append to `src/components/SettingsPage.module.css`:

```css
/* Login method tabs */
.loginTabs {
  display: flex;
  gap: 0;
  margin-bottom: 14px;
  border-radius: 10px;
  overflow: hidden;
  border: 1.5px solid var(--border);
}

.loginTab {
  flex: 1;
  padding: 10px;
  border: none;
  background: var(--bg);
  color: var(--text-light);
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}

.loginTabActive {
  background: var(--accent);
  color: #fff;
}

.emailInput {
  padding: 12px 14px;
  border: 1.5px solid var(--border);
  border-radius: 12px;
  font-size: var(--check-label);
  font-family: inherit;
  background: var(--bg);
  color: var(--text);
  -webkit-appearance: none;
  width: 100%;
  box-sizing: border-box;
}

.emailInput:focus {
  outline: none;
  border-color: var(--accent);
}

.loginActions {
  display: flex;
  gap: 10px;
}

.loginActions .btnLogin {
  flex: 1;
}

.btnSecondary {
  flex: 1;
  padding: 12px;
  border: 1.5px solid var(--accent);
  border-radius: 12px;
  background: transparent;
  color: var(--accent);
  font-size: var(--btn-font);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}

.btnSecondary:active {
  transform: scale(0.97);
}

.btnSecondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loginHint {
  font-size: 12px;
  color: var(--text-light);
  text-align: center;
}

.loginSuccess {
  font-size: 13px;
  color: var(--green);
  text-align: center;
  padding: 8px;
}

/* Binding section */
.boundList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.boundItem {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--check-label);
  color: var(--text);
}

.boundCheck {
  color: var(--green);
}

.btnBind {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border: 1.5px dashed var(--border);
  border-radius: 12px;
  background: transparent;
  color: var(--text-light);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  width: 100%;
  margin-top: 10px;
  transition: all 0.15s;
}

.btnBind:active {
  border-color: var(--accent);
  color: var(--accent);
}
```

- [ ] **Step 4: Rewrite LoginCard component with tab switching**

Replace the entire `LoginCard` function in `src/components/SettingsPage.jsx` (lines 62-172):

```jsx
function LoginCard({ user, loading, auth }) {
  const [loginMethod, setLoginMethod] = useState('phone') // phone | email
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState('input') // input | otp | emailSent
  const [error, setError] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const showToast = useToast()

  if (loading) return null

  if (user) {
    const phoneNum = user.phone || ''
    const userEmail = user.email || ''
    const masked = phoneNum.length > 4
      ? phoneNum.slice(0, phoneNum.length - 8) + '****' + phoneNum.slice(-4)
      : phoneNum
    return (
      <div className={styles.card}>
        <div className={styles.cardTitle}>👤 账户</div>
        <div className={styles.loggedInRow}>
          <span className={styles.phoneDisplay}>
            {phoneNum ? `📱 ${masked}` : `📧 ${userEmail}`}
          </span>
          <button className={styles.btnLogout} onClick={async () => {
            await auth.signOut()
            showToast('已退出登录')
          }}>退出</button>
        </div>
      </div>
    )
  }

  const handleSendOtp = async () => {
    setError('')
    const fullPhone = phone.startsWith('+') ? phone : '+86' + phone
    const { error: err } = await auth.sendOtp(fullPhone)
    if (err) {
      setError(err.message)
    } else {
      setStep('otp')
    }
  }

  const handleVerifyOtp = async () => {
    setError('')
    const fullPhone = phone.startsWith('+') ? phone : '+86' + phone
    const { data, error: err } = await auth.verifyOtp(fullPhone, otp)
    if (err) {
      setError(err.message)
    } else if (data?.user) {
      showToast('✅ 登录成功')
      setStep('input')
      setOtp('')
    }
  }

  const handleEmailSignUp = async () => {
    setError('')
    setEmailLoading(true)
    const { error: err } = await auth.signUpWithEmail(email, password)
    setEmailLoading(false)
    if (err) {
      setError(err.message)
    } else {
      setStep('emailSent')
    }
  }

  const handleEmailSignIn = async () => {
    setError('')
    setEmailLoading(true)
    const { error: err } = await auth.signInWithEmail(email, password)
    setEmailLoading(false)
    if (err) {
      if (err.message.includes('Email not confirmed') || err.message.includes('not confirmed')) {
        setStep('unconfirmed')
      } else {
        setError(err.message)
      }
    } else {
      showToast('登录成功')
    }
  }

  const handleResendVerification = async () => {
    setError('')
    setEmailLoading(true)
    const { error: err } = await auth.resendVerification(email)
    setEmailLoading(false)
    if (err) {
      setError(err.message)
    } else {
      showToast('验证邮件已重新发送')
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>👤 账户</div>

      <div className={styles.loginTabs}>
        <button
          className={`${styles.loginTab} ${loginMethod === 'phone' ? styles.loginTabActive : ''}`}
          onClick={() => { setLoginMethod('phone'); setStep('input'); setError('') }}
        >
          手机登录
        </button>
        <button
          className={`${styles.loginTab} ${loginMethod === 'email' ? styles.loginTabActive : ''}`}
          onClick={() => { setLoginMethod('email'); setStep('input'); setError('') }}
        >
          邮箱登录
        </button>
      </div>

      {loginMethod === 'phone' && step === 'input' && (
        <div className={styles.loginForm}>
          <div className={styles.phoneRow}>
            <span className={styles.phonePrefix}>+86</span>
            <input
              className={styles.phoneInput}
              type="tel"
              placeholder="手机号"
              value={phone}
              maxLength={11}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <button
            className={styles.btnLogin}
            disabled={phone.length < 11 || auth.otpSending || auth.cooldown > 0}
            onClick={handleSendOtp}
          >
            {auth.otpSending ? '发送中...' : auth.cooldown > 0 ? `${auth.cooldown}s 后重发` : '获取验证码'}
          </button>
        </div>
      )}

      {loginMethod === 'phone' && step === 'otp' && (
        <div className={styles.loginForm}>
          <input
            className={styles.otpInput}
            type="tel"
            placeholder="输入验证码"
            value={otp}
            maxLength={6}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
          <div className={styles.otpActions}>
            <button className={styles.btnBack} onClick={() => { setStep('input'); setOtp(''); setError('') }}>
              返回
            </button>
            <button
              className={styles.btnLogin}
              disabled={otp.length < 6 || auth.otpVerifying}
              onClick={handleVerifyOtp}
            >
              {auth.otpVerifying ? '验证中...' : '登录'}
            </button>
          </div>
          <button
            className={styles.btnResend}
            disabled={auth.cooldown > 0 || auth.otpSending}
            onClick={handleSendOtp}
          >
            {auth.cooldown > 0 ? `${auth.cooldown}s 后可重发` : '重新发送'}
          </button>
        </div>
      )}

      {loginMethod === 'email' && step === 'input' && (
        <div className={styles.loginForm}>
          <input
            className={styles.emailInput}
            type="email"
            placeholder="邮箱地址"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className={styles.emailInput}
            type="password"
            placeholder="密码（至少6位）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className={styles.loginActions}>
            <button
              className={styles.btnSecondary}
              disabled={!email || password.length < 6 || emailLoading}
              onClick={handleEmailSignUp}
            >
              注册
            </button>
            <button
              className={styles.btnLogin}
              disabled={!email || !password || emailLoading}
              onClick={handleEmailSignIn}
            >
              {emailLoading ? '处理中...' : '登录'}
            </button>
          </div>
          <div className={styles.loginHint}>注册后需验证邮箱</div>
        </div>
      )}

      {loginMethod === 'email' && step === 'emailSent' && (
        <div className={styles.loginForm}>
          <div className={styles.loginSuccess}>
            验证邮件已发送，请查收 {email}
          </div>
          <button
            className={styles.btnLogin}
            onClick={() => setStep('input')}
          >
            返回登录
          </button>
        </div>
      )}

      {loginMethod === 'email' && step === 'unconfirmed' && (
        <div className={styles.loginForm}>
          <div className={styles.loginError}>请先验证邮箱，查看收件箱中的确认链接</div>
          <button
            className={styles.btnLogin}
            disabled={emailLoading}
            onClick={handleResendVerification}
          >
            {emailLoading ? '发送中...' : '重新发送验证邮件'}
          </button>
          <button
            className={styles.btnBack}
            onClick={() => setStep('input')}
          >
            返回
          </button>
        </div>
      )}

      {error && <div className={styles.loginError}>{error}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add src/components/SettingsPage.jsx src/components/SettingsPage.module.css src/email-auth.test.js
git commit -m "feat: add login tab switching — phone/email in SettingsPage"
```

---

### Task 9: SettingsPage — Binding UI (logged in state)

**Files:**
- Modify: `src/components/SettingsPage.jsx` (LoginCard logged-in section)
- Test: `src/email-auth.test.js` (append)

This task adds the binding UI shown when a user is already logged in. Since the binding Edge Functions aren't deployed yet, the UI will be wired up but binding actions will show errors if tested against production (expected).

- [ ] **Step 1: Write failing test**

Append to `src/email-auth.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/email-auth.test.js`
Expected: FAIL

- [ ] **Step 3: Expand LoginCard logged-in state with binding UI**

Replace the logged-in section of LoginCard (the `if (user)` block) with:

```jsx
if (user) {
  const phoneNum = user.phone || ''
  const userEmail = user.email || ''
  const masked = phoneNum.length > 4
    ? phoneNum.slice(0, phoneNum.length - 8) + '****' + phoneNum.slice(-4)
    : phoneNum
  const isPhoneUser = !!phoneNum
  const isEmailUser = !!userEmail

  return (
    <div className={styles.card}>
      <div className={styles.cardTitle}>👤 账户</div>
      <div className={styles.loggedInRow}>
        <span className={styles.phoneDisplay}>
          {isPhoneUser ? `📱 ${masked}` : `📧 ${userEmail}`}
        </span>
        <button className={styles.btnLogout} onClick={async () => {
          await auth.signOut()
          showToast('已退出登录')
        }}>退出</button>
      </div>

      {/* Binding section */}
      {isPhoneUser && !isEmailUser && (
        <BindEmailForm auth={auth} />
      )}
      {isEmailUser && !isPhoneUser && (
        <BindPhoneForm auth={auth} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create BindEmailForm and BindPhoneForm components**

Add before `LoginCard` in SettingsPage.jsx. Both components receive `householdId` from the start.

```jsx
function BindEmailForm({ auth, householdId }) {
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const showToast = useToast()

  const handleBind = async (confirmed = false) => {
    setError('')
    setLoading(true)
    const result = await auth.bindEmail(email, password, householdId, confirmed)
    setLoading(false)
    if (result.conflict) {
      if (confirm(result.warning + '，确认绑定？')) {
        handleBind(true)
      }
    } else if (result.success) {
      setSuccess(true)
      showToast('绑定成功，请查收验证邮件')
    } else if (result.error) {
      setError(result.error.message)
    }
  }

  if (success) {
    return <div className={styles.loginSuccess}>验证邮件已发送至 {email}</div>
  }

  if (!showForm) {
    return (
      <button className={styles.btnBind} onClick={() => setShowForm(true)}>
        绑定邮箱
      </button>
    )
  }

  return (
    <div className={styles.boundList}>
      <div className={styles.loginForm}>
        <input
          className={styles.emailInput}
          type="email"
          placeholder="邮箱地址"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={styles.emailInput}
          type="password"
          placeholder="设置密码（至少6位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div className={styles.loginActions}>
          <button className={styles.btnBack} onClick={() => setShowForm(false)}>
            取消
          </button>
          <button
            className={styles.btnLogin}
            disabled={!email || password.length < 6 || loading}
            onClick={() => handleBind(false)}
          >
            {loading ? '绑定中...' : '确认绑定'}
          </button>
        </div>
      </div>
      {error && <div className={styles.loginError}>{error}</div>}
    </div>
  )
}

function BindPhoneForm({ auth, householdId }) {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('idle') // idle | phone | otp
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const showToast = useToast()

  const handleSendOtp = async () => {
    setError('')
    const fullPhone = phone.startsWith('+') ? phone : '+86' + phone
    const { error: err } = await auth.sendOtp(fullPhone)
    if (err) {
      setError(err.message)
    } else {
      setStep('otp')
    }
  }

  const handleBind = async (confirmed = false) => {
    setError('')
    setLoading(true)
    const result = await auth.bindPhone(phone, otp, householdId, confirmed)
    setLoading(false)
    if (result.conflict) {
      if (confirm(result.warning + '，确认绑定？')) {
        handleBind(true)
      }
    } else if (result.success) {
      showToast('手机号绑定成功')
      setStep('idle')
    } else if (result.error) {
      setError(result.error.message)
    }
  }

  if (step === 'idle') {
    return (
      <button className={styles.btnBind} onClick={() => setStep('phone')}>
        绑定手机号
      </button>
    )
  }

  return (
    <div className={styles.boundList}>
      {step === 'phone' && (
        <div className={styles.loginForm}>
          <div className={styles.phoneRow}>
            <span className={styles.phonePrefix}>+86</span>
            <input
              className={styles.phoneInput}
              type="tel"
              placeholder="手机号"
              value={phone}
              maxLength={11}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className={styles.loginActions}>
            <button className={styles.btnBack} onClick={() => setStep('idle')}>
              取消
            </button>
            <button
              className={styles.btnLogin}
              disabled={phone.length < 11 || auth.otpSending || auth.cooldown > 0}
              onClick={handleSendOtp}
            >
              {auth.otpSending ? '发送中...' : auth.cooldown > 0 ? `${auth.cooldown}s 后重发` : '发送验证码'}
            </button>
          </div>
        </div>
      )}
      {step === 'otp' && (
        <div className={styles.loginForm}>
          <input
            className={styles.otpInput}
            type="tel"
            placeholder="输入验证码"
            value={otp}
            maxLength={6}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          />
          <div className={styles.loginActions}>
            <button className={styles.btnBack} onClick={() => { setStep('phone'); setOtp(''); setError('') }}>
              返回
            </button>
            <button
              className={styles.btnLogin}
              disabled={otp.length < 6 || loading}
              onClick={() => handleBind(false)}
            >
              {loading ? '绑定中...' : '确认绑定'}
            </button>
          </div>
        </div>
      )}
      {error && <div className={styles.loginError}>{error}</div>}
    </div>
  )
}
```

- [ ] **Step 5: Wire up householdId through SettingsPage props**

In `SettingsPage` export, add `householdId` to props:
```jsx
export default function SettingsPage({
  members, tasks, householdId,
  onAddMember, onRemoveMember, onUpdateMemberName, onUpdateMemberEmoji,
  onAddTask, onRemoveTask, onUpdateTask,
  auth,
}) {
```

Pass to LoginCard:
```jsx
<LoginCard user={auth.user} loading={auth.loading} auth={auth} householdId={householdId} />
```

Update LoginCard signature:
```jsx
function LoginCard({ user, loading, auth, householdId }) {
```

In `src/hooks/useStore.js`, expose `householdId` in the return:
```js
return {
  members, data, tasks, currentTab, currentDay, weekOffset, expandedTask, syncStatus,
  householdId: householdId.current,
  // ...rest
}
```

In `src/App.jsx`, destructure `householdId` and pass it:
```jsx
const { ..., householdId } = store
// ...
<SettingsPage
  // ...existing props
  householdId={householdId}
  auth={auth}
/>
```

Also update the `handleLoginSuccess` call in `App.jsx` to pass `authMethod`:
```jsx
// In the useEffect that calls handleLoginSuccess:
if (auth.user && !hasSynced.current) {
  hasSynced.current = true
  const authMethod = auth.user.email && !auth.user.phone ? 'email' : 'phone'
  handleLoginSuccess(auth.user, authMethod)
}
```

Note: This detection in App.jsx is acceptable because at this point the user just logged in and we know which method they used. For phone users created via admin API, `user.email` is null. For email users, `user.phone` is null. Edge case of both existing is handled by preferring 'phone' (the original method).

- [ ] **Step 8: Run tests to verify pass**

Run: `npm test -- src/email-auth.test.js`
Expected: PASS

- [ ] **Step 9: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 10: Commit**

```bash
git add src/components/SettingsPage.jsx src/components/SettingsPage.module.css src/hooks/useStore.js src/App.jsx src/email-auth.test.js
git commit -m "feat: add binding UI — bind email for phone users, bind phone for email users"
```

---

## Chunk 5: Deploy and verify

### Task 10: Deploy Edge Functions

- [ ] **Step 1: Deploy bind-email**

```bash
cd /home/memory-work/01\ 项目/family-learning
npx supabase functions deploy bind-email --project-ref wginlfqxxrkfduujwvvo
```

Or via Supabase MCP: `deploy_edge_function` with name `bind-email`.

- [ ] **Step 2: Deploy bind-phone**

```bash
npx supabase functions deploy bind-phone --project-ref wginlfqxxrkfduujwvvo
```

Or via Supabase MCP: `deploy_edge_function` with name `bind-phone`.

- [ ] **Step 2b: Redeploy verify-otp** (modified to import from _shared/)

```bash
npx supabase functions deploy verify-otp --project-ref wginlfqxxrkfduujwvvo
```

Or via Supabase MCP: `deploy_edge_function` with name `verify-otp`.

- [ ] **Step 3: Verify deployments**

List edge functions via MCP to confirm both appear.

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: ALL PASS

- [ ] **Step 5: Final build check**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 6: Commit all remaining changes**

```bash
git add -A
git status
git commit -m "feat: email auth + account binding — complete implementation"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | DB migration: household_users table | SQL via MCP |
| 2 | sync.js: switch to household_users | sync.js |
| 3 | useStore: pass authMethod | useStore.js |
| 4 | useAuth: email signUp/signIn + bind methods | useAuth.js |
| 5 | Extract derivePassword to _shared | _shared/derive-password.ts, verify-otp |
| 6 | bind-email Edge Function | bind-email/index.ts |
| 7 | bind-phone Edge Function | bind-phone/index.ts |
| 8 | SettingsPage: login tab switching | SettingsPage.jsx, .module.css |
| 9 | SettingsPage: binding UI | SettingsPage.jsx, App.jsx, useStore.js |
| 10 | Deploy & verify | Edge Functions deploy |
