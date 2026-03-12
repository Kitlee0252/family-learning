# Email Auth + Account Binding Design

Date: 2026-03-12
Status: Approved

## Overview

Add email+password registration/login to the existing SMS-based auth system. Support bidirectional account binding: phone users can bind email, email users can bind phone. Both login methods access the same household data.

## Key Decisions

1. **Application-layer binding (方案 A)** — don't merge Supabase auth users; link multiple auth users to the same household via a junction table
2. **Email verification required** — Supabase built-in email confirmation before login is allowed
3. **Binding requires identity verification** — bind phone needs SMS OTP; bind email needs email+password (email already verified at registration)
4. **No data merge on conflict** — if the bound account already has a household, warn user; don't merge data

## Database Changes

### New table: `household_users`

| Column | Type | Constraints |
|---|---|---|
| household_id | UUID | FK → households.id, NOT NULL |
| user_id | UUID | NOT NULL |
| auth_method | text | 'phone' or 'email', NOT NULL |
| created_at | timestamptz | DEFAULT now() |
| PRIMARY KEY | | (household_id, user_id) |

Index: `idx_household_users_user_id` on `user_id` (for login lookup).

### Migration

- Create `household_users` table
- Migrate existing data: for each row in `households` where `user_id IS NOT NULL`, insert into `household_users` with `auth_method = 'phone'`
- Keep `households.user_id` column (backward compat), but stop using it for lookups

## Auth Flows

### Email Registration

```
Frontend: supabase.auth.signUp({ email, password })
  → Supabase sends verification email
  → User clicks link → email confirmed
  → User can now sign in
```

No Edge Function needed — Supabase Auth handles this natively.

### Email Login

```
Frontend: supabase.auth.signInWithPassword({ email, password })
  → Returns session
  → Same household binding logic as phone login:
     query household_users for user_id
       → found: switch to that household, pull cloud data
       → not found: use current local household_id, insert into household_users
```

### Phone Login (existing)

No changes to the SMS OTP flow. After login, household lookup changes from `households.user_id` to `household_users.user_id`.

## Binding Flows

### Phone user binds email

```
Settings page → "绑定邮箱" → enter email + password
  → Call Edge Function: bind-email
    1. admin.createUser({ email, password, email_confirm: false })
       (or find existing user by email)
    2. Supabase sends verification email automatically
    3. Insert into household_users: (current_household_id, new_email_user_id, 'email')
  → After email verification, that email can independently log in to the same household
```

Edge Function required because: frontend already has a phone session; calling signUp would replace the current session. Admin API creates the user server-side without affecting the current login state.

### Email user binds phone

```
Settings page → "绑定手机" → enter phone → send OTP → enter code
  → Call Edge Function: bind-phone
    1. Verify OTP via Aliyun (reuse existing aliyun-signer)
    2. admin.createUser({ phone, password, phone_confirm: true })
       (or find existing user by phone)
    3. Insert into household_users: (current_household_id, new_phone_user_id, 'phone')
  → That phone number can now independently log in to the same household
```

### Conflict handling

If the account being bound already has an entry in `household_users` (i.e., already has its own household with data):
- Return a warning to frontend: "该账号已有数据"
- Frontend shows confirmation dialog
- User confirms → proceed with binding (add to current household)
- The old household's data remains untouched but that user now logs into the new household

## New Edge Functions

### `bind-email`

- **Input**: `{ email, password, household_id }`
- **Auth**: Requires valid JWT (phone user must be logged in)
- **Steps**:
  1. Validate email format
  2. `admin.createUser({ email, password })` or find existing by email
  3. Check if email user already in `household_users` → return warning if so
  4. Insert `(household_id, email_user_id, 'email')` into `household_users`
  5. Return `{ success: true, warning?: string }`

### `bind-phone`

- **Input**: `{ phone, code, household_id }`
- **Auth**: Requires valid JWT (email user must be logged in)
- **Steps**:
  1. Verify OTP via Aliyun CheckSmsVerifyCode
  2. `admin.createUser({ phone, password, phone_confirm: true })` or find existing
  3. Check if phone user already in `household_users` → return warning if so
  4. Insert `(household_id, phone_user_id, 'phone')` into `household_users`
  5. Return `{ success: true, warning?: string }`

## Frontend Changes

### SettingsPage — Login area

**Not logged in:**

```
┌─────────┬─────────┐
│ 手机登录 │ 邮箱登录 │  ← Tab switch
└─────────┴─────────┘

Phone tab: existing OTP flow (no changes)
Email tab: email + password + "注册" / "登录" buttons
  - Show "注册后需验证邮箱" hint
  - After signUp: show "验证邮件已发送，请查收" message
```

**Logged in:**

```
已登录：138****1234（手机）
  📧 绑定邮箱  ← shows if no email bound

or:
已登录：user@example.com（邮箱）
  📱 绑定手机号  ← shows if no phone bound

Both bound:
  📱 138****1234 ✓
  📧 user@example.com ✓
```

### useAuth hook extensions

New exports:
- `signUpWithEmail(email, password)` — calls `supabase.auth.signUp`
- `signInWithEmail(email, password)` — calls `supabase.auth.signInWithPassword`
- `bindEmail(email, password)` — calls bind-email Edge Function
- `bindPhone(phone, otp)` — calls bind-phone Edge Function
- `boundAccounts` — state: `{ phone?: string, email?: string }` from household_users

### sync.js changes

- `findUserHousehold(userId)` → query `household_users` instead of `households`
- `bindHouseholdToUser(householdId, userId, authMethod)` → insert into `household_users` instead of updating `households`
- New: `getBoundAccounts(householdId)` → query `household_users` to show binding status

## File Change Summary

| File | Change |
|---|---|
| `src/hooks/useAuth.js` | Add email signUp/signIn, bind methods, boundAccounts state |
| `src/lib/sync.js` | findUserHousehold/bindHouseholdToUser → use household_users; add getBoundAccounts |
| `src/components/SettingsPage.jsx` | Login tab switch UI + binding UI |
| `src/components/SettingsPage.module.css` | Styles for new UI elements |
| `supabase/functions/bind-email/index.ts` | New Edge Function |
| `supabase/functions/bind-phone/index.ts` | New Edge Function |
| DB migration | Create household_users table + migrate existing data |

## Testing Strategy

### Unit tests (vitest)

- `household_users` lookup logic (findUserHousehold, bindHouseholdToUser)
- getBoundAccounts returns correct state
- Email validation
- Conflict detection logic

### Integration tests

- Email signUp → signIn flow
- Phone user bind email → email user can log in to same household
- Email user bind phone → phone user can log in to same household
- Conflict: binding an account that already has a household

### Manual verification

- Full registration flow with email verification
- Login tab switching
- Binding UI shows correct state
- Bound account can log in from different browser
