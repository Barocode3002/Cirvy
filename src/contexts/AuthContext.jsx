import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ensureUserKeys } from '@/lib/e2ee'

// --------------------------------------------------------------------------
// AuthContext — the "single source of truth" for authentication state.
// --------------------------------------------------------------------------

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Track last fetched user ID to avoid redundant profile fetches
  const lastFetchedUid = useRef(null)

  const fetchProfile = useCallback(async (userId, force = false) => {
    if (!userId) {
      setProfile(null)
      lastFetchedUid.current = null
      return null
    }
    // Skip if we already fetched this user's profile (unless forced)
    if (!force && lastFetchedUid.current === userId) return null
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, onboarded')
        .eq('id', userId)
        .maybeSingle()

      if (!error && data) {
        lastFetchedUid.current = userId
        setProfile(data)
        // Ensure user's E2EE keys are initialized in IndexedDB & Supabase
        ensureUserKeys(userId).catch(() => {})
        return data
      }
    } catch {
      // Fallback
    }
    return null
  }, [])

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      return await fetchProfile(user.id, true)
    }
    return null
  }, [user?.id, fetchProfile])

  // Ensure a profile row exists for OAuth users (Google/Apple sign-in)
  const ensureOAuthProfile = useCallback(async (authUser) => {
    if (!authUser) return
    const meta = authUser.user_metadata || {}
    const username = meta.username || meta.preferred_username || meta.email?.split('@')[0] || authUser.id.slice(0, 8)
    const displayName = meta.display_name || meta.full_name || meta.name || username

    try {
      // upsert with onConflict so it doesn't overwrite existing data
      await supabase.from('profiles').upsert(
        {
          id: authUser.id,
          username: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
          display_name: displayName,
          avatar_url: meta.avatar_url || meta.picture || null,
          onboarded: false,
        },
        { onConflict: 'id', ignoreDuplicates: true }
      )
      await ensureUserKeys(authUser.id)
    } catch {
      // Profile may already exist — that's fine
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // 1) Check existing session & profile
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return
      setSession(s)
      setUser(s?.user ?? null)
      if (s?.user) {
        await fetchProfile(s.user.id)
      }
      setLoading(false)
    })

    // 2) Listen for future changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return

      setSession(newSession)
      const newUser = newSession?.user ?? null
      setUser(newUser)

      if (event === 'SIGNED_OUT') {
        setProfile(null)
        lastFetchedUid.current = null
        setLoading(false)
        return
      }

      // Only fetch profile on meaningful events, not every TOKEN_REFRESHED
      if (event === 'TOKEN_REFRESHED') {
        // User hasn't changed, no need to re-fetch profile
        return
      }

      if (newUser) {
        // For OAuth logins (SIGNED_IN via provider), ensure profile exists
        if (event === 'SIGNED_IN' && newUser.app_metadata?.provider !== 'email') {
          await ensureOAuthProfile(newUser)
        }
        await fetchProfile(newUser.id, true)
      }

      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile, ensureOAuthProfile])

  const signUp = async ({ email, password, username, displayName }) => {
    // Step 1 — create auth user in Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName },
      },
    })
    if (error) return { error }

    // Step 2 — if session is already active (immediate signup without OTP)
    if (data?.user && data?.session) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          username,
          display_name: displayName,
          onboarded: false,
        })
        await ensureUserKeys(data.user.id)
        await fetchProfile(data.user.id, true)
      } catch {
        // Ignored, can be done later
      }
    }

    return { data }
  }

  const verifyOtp = async ({ email, token, username, displayName }) => {
    const cleanToken = token.trim()
    let { data, error } = await supabase.auth.verifyOtp({
      email,
      token: cleanToken,
      type: 'signup',
    })

    // Fallback attempt with 'email' type if 'signup' is rejected by Supabase config
    if (error) {
      const fallback = await supabase.auth.verifyOtp({
        email,
        token: cleanToken,
        type: 'email',
      })
      if (fallback.error) return { error }
      data = fallback.data
    }

    // Now that session is authenticated, ensure profile row exists
    if (data?.user) {
      const uName = username || data.user.user_metadata?.username
      const dName = displayName || data.user.user_metadata?.display_name || uName
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          username: uName,
          display_name: dName,
          onboarded: false,
        })
        await ensureUserKeys(data.user.id)
        await fetchProfile(data.user.id, true)
      } catch (err) {
        console.error('Error creating profile after OTP verify:', err)
      }
    }

    return { data }
  }

  const resendOtp = async (email) => {
    return await supabase.auth.resend({
      type: 'signup',
      email,
    })
  }

  const signIn = async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (!error && data?.user) {
      await fetchProfile(data.user.id, true)
    }
    return { data, error }
  }

  const signOut = async () => {
    setProfile(null)
    lastFetchedUid.current = null
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const value = {
    session,
    user,
    profile,
    loading,
    refreshProfile,
    signUp,
    verifyOtp,
    resendOtp,
    signIn,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
