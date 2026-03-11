import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const cooldownRef = useRef(null)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Cooldown timer cleanup
  useEffect(() => {
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current)
    }
  }, [])

  const startCooldown = useCallback((seconds = 60) => {
    setCooldown(seconds)
    if (cooldownRef.current) clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          clearInterval(cooldownRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  // Build Edge Function URL: reuse the same base as Supabase API
  // VITE_SUPABASE_URL may point to reverse proxy (e.g. https://xxx.sslip.io/api)
  // Edge Functions are at the project's direct URL
  const getFunctionsUrl = useCallback((fnName) => {
    // If using reverse proxy (/api prefix), edge functions go through /functions/v1/
    if (SUPABASE_URL && SUPABASE_URL.includes('/api')) {
      const base = SUPABASE_URL.replace(/\/api\/?$/, '')
      return `${base}/functions/v1/${fnName}`
    }
    // Direct Supabase URL
    if (SUPABASE_URL) {
      return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${fnName}`
    }
    return null
  }, [])

  const sendOtp = useCallback(async (phone) => {
    const url = getFunctionsUrl('send-otp')
    if (!url) return { error: { message: '云端未连接' } }

    setOtpSending(true)
    try {
      // phone comes as "+8613xxx", strip to digits only
      const digits = phone.replace(/^\+86/, '').replace(/\D/g, '')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits }),
      })
      const data = await res.json()
      if (data.success) {
        startCooldown(60)
        return { error: null }
      }
      return { error: { message: data.error || '发送失败' } }
    } catch (err) {
      return { error: { message: '网络错误' } }
    } finally {
      setOtpSending(false)
    }
  }, [startCooldown, getFunctionsUrl])

  const verifyOtp = useCallback(async (phone, token) => {
    const url = getFunctionsUrl('verify-otp')
    if (!url || !supabase) return { error: { message: '云端未连接' } }

    setOtpVerifying(true)
    try {
      const digits = phone.replace(/^\+86/, '').replace(/\D/g, '')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, code: token }),
      })
      const data = await res.json()
      if (data.session) {
        // Set session in Supabase client
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })
        return { data: { session: data.session, user: data.session.user }, error: null }
      }
      return { error: { message: data.error || '验证失败' } }
    } catch (err) {
      return { error: { message: '网络错误' } }
    } finally {
      setOtpVerifying(false)
    }
  }, [getFunctionsUrl])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut({ scope: 'local' })
  }, [])

  return {
    user,
    loading,
    otpSending,
    otpVerifying,
    cooldown,
    sendOtp,
    verifyOtp,
    signOut,
  }
}
