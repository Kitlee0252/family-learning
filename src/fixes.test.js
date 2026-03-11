/**
 * TDD tests for three fixes:
 * 1. Title: "全家学习打卡" → "家庭共学记录"
 * 2. signOut scope: global → local (prevent kicking all devices)
 * 3. RankPage progress bar: use totalPossible as denominator, not maxScore
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(import.meta.dirname, '..')

// ========== 1. Title ==========

describe('Fix #1: app title should be "家庭共学记录"', () => {
  it('index.html <title> should be "家庭共学记录"', () => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf-8')
    expect(html).toContain('<title>家庭共学记录</title>')
    expect(html).not.toContain('全家学习打卡')
  })

  it('App.jsx header should show "家庭共学记录"', () => {
    const jsx = readFileSync(resolve(root, 'src/App.jsx'), 'utf-8')
    expect(jsx).toContain('家庭共学记录')
    expect(jsx).not.toContain('全家学习打卡')
  })
})

// ========== 2. signOut scope ==========

describe('Fix #2: signOut should use scope "local"', () => {
  it('useAuth.js signOut should call supabase.auth.signOut with scope local', () => {
    const code = readFileSync(resolve(root, 'src/hooks/useAuth.js'), 'utf-8')
    // Must contain signOut({ scope: 'local' })
    expect(code).toMatch(/signOut\(\s*\{\s*scope\s*:\s*['"]local['"]\s*\}\s*\)/)
    // Must NOT contain bare signOut() without scope
    // Find all signOut calls — each must have scope: 'local'
    const signOutCalls = code.match(/supabase\.auth\.signOut\([^)]*\)/g) || []
    expect(signOutCalls.length).toBeGreaterThan(0)
    for (const call of signOutCalls) {
      expect(call).toContain('local')
    }
  })
})

// ========== 3. RankPage progress bar ==========

describe('Fix #3: RankPage progress bar should use totalPossible', () => {
  // Extract the bar width logic and test it
  function calcBarWidth_OLD(score, maxScore) {
    return (score / maxScore) * 100
  }

  function calcBarWidth_FIXED(score, totalPossible) {
    return (score / (totalPossible || 1)) * 100
  }

  it('OLD: top scorer always shows 100% regardless of actual completion', () => {
    // 3 tasks × 7 days = 21 total possible
    // Member A: 15/21, Member B: 10/21
    const maxScore = 15
    expect(calcBarWidth_OLD(15, maxScore)).toBe(100) // misleading!
    expect(calcBarWidth_OLD(10, maxScore)).toBeCloseTo(66.67, 1)
  })

  it('FIXED: bar width reflects actual completion ratio', () => {
    const totalPossible = 21 // 3 tasks × 7 days
    expect(calcBarWidth_FIXED(15, totalPossible)).toBeCloseTo(71.43, 1) // correct!
    expect(calcBarWidth_FIXED(10, totalPossible)).toBeCloseTo(47.62, 1)
    expect(calcBarWidth_FIXED(21, totalPossible)).toBe(100) // full completion
    expect(calcBarWidth_FIXED(0, totalPossible)).toBe(0)
  })

  it('FIXED: handles zero tasks gracefully', () => {
    expect(calcBarWidth_FIXED(0, 0)).toBe(0)
  })

  it('RankPage.jsx source should use totalPossible, not maxScore for barWidth', () => {
    const code = readFileSync(resolve(root, 'src/components/RankPage.jsx'), 'utf-8')
    // Should NOT have barWidth based on maxScore
    expect(code).not.toMatch(/s\.score\s*\/\s*maxScore/)
    // Should calculate total possible (7 * tasks.length)
    expect(code).toMatch(/7\s*\*\s*tasks\.length/)
  })
})

// ========== Bonus: verify-otp session limit ==========

describe('Fix #2b: verify-otp should enforce 5 device session limit', () => {
  it('verify-otp should call cleanup_old_sessions RPC with MAX_SESSIONS', () => {
    const code = readFileSync(resolve(root, 'supabase/functions/verify-otp/index.ts'), 'utf-8')
    // Should have a max sessions constant set to 5
    expect(code).toMatch(/MAX_SESSIONS\s*=\s*5/)
    // Should call the cleanup RPC
    expect(code).toContain('cleanup_old_sessions')
    // Cleanup should be non-blocking (in try-catch)
    expect(code).toContain('non-blocking')
  })
})
