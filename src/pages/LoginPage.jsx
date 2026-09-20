// src/pages/LoginPage.jsx
// Sign In page featuring the official Cirvy color palette, logo, and zero-tracking security.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { supabase } from '@/lib/supabase'
import CirvyLogo from '@/components/CirvyLogo'

export default function LoginPage() {
  const { signIn } = useAuth()
  const { t, showToast, lang, dark, toggleLang, toggleTheme } = useUI()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // Forgot Password modal
  const [showForgot, setShowForgot] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Check lockout
    const { data: isLocked } = await supabase.rpc('check_login_lock', {
      p_email: email,
    })

    if (isLocked) {
      setError('Too many failed attempts. This account is temporarily locked. Please try again in 15 minutes.')
      setLoading(false)
      return
    }

    const { error: signInError } = await signIn({ email, password })

    await supabase.rpc('record_login_attempt', {
      p_email: email,
      p_success: !signInError,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    showToast(t('loginSuccess'))
    navigate('/feed')
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (!forgotEmail) return
    setForgotLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/login`,
    })

    setForgotLoading(false)
    setShowForgot(false)
    if (error) {
      showToast(error.message)
    } else {
      showToast(t('resetSent'))
    }
  }

  const handleOAuth = async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/feed`,
      },
    })
    if (error) showToast(error.message)
  }

  // const isAppleDevice = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

  return (
    <div className="min-h-screen flex flex-col max-w-md md:max-w-xl mx-auto relative px-4 py-4 selection:bg-[#8FBC94]/30">
      {/* Header controls */}
      <header className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <CirvyLogo variant="icon" size={30} showGlow />
          <span className="text-l font-display font-extrabold tracking-wider text-[var(--text-main)] uppercase">
            {t('brand')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="w-8 h-8 rounded-full field flex items-center justify-center text-xs font-display font-bold scale-tap hover:border-[#4A7A8C] cursor-pointer"
            title="Toggle Language"
          >
            <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
          </button>
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full field flex items-center justify-center text-xs font-semibold scale-tap hover:border-[#4A7A8C] cursor-pointer"
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            <i className={`fa-solid ${dark ? 'fa-sun' : 'fa-moon'} text-xs text-sub`} />
          </button>
        </div>
      </header>

      {/* Main Login Area */}
      <main className="flex-1 flex flex-col justify-center py-4 view">
        {/* Brand Hero */}
        <div className="text-center mb-6 flex flex-col items-center">
          <CirvyLogo variant="icon" size={44} className="mb-3" />
          {/* <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-[0.16em] bg-[#8FBC94]/15 text-[#8FBC94] border border-[#8FBC94]/30 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8FBC94]" />
             <span>{t('shieldLabel')}</span>
          </div> */}
          <h1 className="font-display font-bold text-xl md:text-2xl text-[var(--text-main)] max-w-sm leading-tight tracking-tight">
            {t('loginAuthHeadline')}
          </h1>
          {/* <p className="font-display italic text-sub text-sm md:text-base mt-1.5 max-w-xs">
            {t('authSub')}
          </p> */}
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-6 shadow-glass border border-[var(--card-border)]">
          {/* Tabs */}
          <div className="flex mb-6 rounded-2xl p-1 field">
            <button
              onClick={() => { }}
              className="flex-1 py-2 rounded-xl text-xs md:text-sm font-bold transition-all accent-bg text-[#F5F7F8] dark:text-[#10181C]"
            >
              {t('signIn')}
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="flex-1 py-2 rounded-xl text-xs md:text-sm font-medium transition-all text-sub hover:text-[var(--text-main)] scale-tap"
            >
              {t('signUp')}
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl field border-red-500/40 p-3 text-xs text-red-500 font-medium flex items-center gap-2">
              <i className="fa-solid fa-circle-exclamation shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Login Form */}
          <form id="loginForm" className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-xs font-semibold text-[var(--text-main)] mb-1.5">
                {t('userOrEmail')}
              </label>
              <div className="relative">
                <i className="fa-regular fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-sub text-xs rtl:left-auto rtl:right-3.5" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field w-full rounded-2xl pl-9 pr-4 py-3 text-sm rtl:pl-4 rtl:pr-9 outline-none focus:border-[#4A7A8C]"
                  placeholder={t('userOrEmailPh')}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[var(--text-main)]">
                  {t('password')}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email)
                    setShowForgot(true)
                  }}
                  className="text-[11px] font-semibold text-sub hover:underline cursor-pointer"
                >
                  {t('forgotPassword')}
                </button>
              </div>
              <div className="relative">
                <i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-sub text-xs rtl:left-auto rtl:right-3.5" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field w-full rounded-2xl pl-9 pr-4 py-3 text-sm rtl:pl-4 rtl:pr-9 outline-none focus:border-[#4A7A8C]"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full accent-bg text-[#F5F7F8] dark:text-[#10181C] rounded-full py-3.5 font-bold text-xs md:text-sm scale-tap transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loading && <i className="fa-solid fa-circle-notch fa-spin text-sm" />}
              <span>{t('signInBtn')}</span>
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-[var(--card-border)]" />
            <span className="text-[10px] font-display text-sub uppercase tracking-wider">
              {t('orContinue')}
            </span>
            <div className="h-px flex-1 bg-[var(--card-border)]" />
          </div>

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => handleOAuth('google')}
              className="w-full field rounded-2xl py-4 flex items-center justify-center gap-3 text-base font-semibold scale-tap hover:border-[#4A7A8C] transition-all cursor-pointer"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="" className="w-5 h-5" /> Google
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-sub mt-5 flex items-center justify-center gap-1.5 max-w-xs mx-auto leading-relaxed">
          <i className="fa-solid fa-shield-halved text-[11px] text-[#8FBC94]" />
          <span>{t('authFooter')}</span>
        </p>
      </main>

      {/* ============ MODAL: FORGOT PASSWORD ============ */}
      {showForgot && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <div
            className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowForgot(false)}
          />
          <div className="modal-panel relative glass w-full md:w-96 rounded-3xl p-6 z-10 border shadow-2xl border-[var(--card-border)]">
            <div className="w-10 h-10 rounded-2xl bg-[#4A7A8C]/15 flex items-center justify-center mb-4 text-sub">
              <i className="fa-solid fa-key text-base" />
            </div>
            <h3 className="font-display font-bold text-lg mb-1 text-[var(--text-main)]">
              {t('resetTitle')}
            </h3>
            <p className="text-xs text-sub mb-4 leading-relaxed">{t('resetSub')}</p>
            <form onSubmit={handleResetPassword}>
              <input
                id="resetEmailInput"
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="field w-full rounded-2xl px-4 py-3 text-sm mb-4 outline-none focus:border-[#4A7A8C]"
                placeholder="you@cirvy.app"
                autoFocus
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="flex-1 field rounded-full py-2.5 font-semibold text-xs scale-tap cursor-pointer"
                >
                  {t('cancel')}
                </button>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 accent-bg text-[#F5F7F8] dark:text-[#10181C] rounded-full py-2.5 font-bold text-xs scale-tap transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {forgotLoading && (
                    <i className="fa-solid fa-circle-notch fa-spin text-xs" />
                  )}
                  <span>{t('sendLink')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}