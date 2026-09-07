// src/pages/SignupPage.jsx
// Create Private Account page featuring the official Cirvy brand palette and OTP verification.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { supabase } from '@/lib/supabase'
import CirvyLogo from '@/components/CirvyLogo'
import { ArrowLeft, RefreshCw } from 'lucide-react'

export default function SignupPage() {
  const { signUp, verifyOtp, resendOtp } = useAuth()
  const { t, showToast, lang, dark, toggleLang, toggleTheme } = useUI()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    email: '',
    password: '',
    username: '',
    displayName: '',
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // OTP Verification state
  const [isOtpStep, setIsOtpStep] = useState(false)
  const [otpCode, setOtpCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    let timer
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown((c) => c - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [countdown])

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const cleanUsername = form.username.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (cleanUsername.length < 3) {
      setError(t('handleValidation') || 'Username must be at least 3 characters.')
      setLoading(false)
      return
    }

    const { data, error: signUpError } = await signUp({
      ...form,
      username: cleanUsername,
      displayName: form.displayName.trim(),
    })

    if (signUpError) {
      if (signUpError.status === 504 || signUpError.message?.includes('504') || signUpError.message?.toLowerCase().includes('timeout')) {
        setError(t('timeoutError') || 'Email service connection timed out (HTTP 504). Please check your Supabase SMTP settings or try again.')
      } else {
        setError(signUpError.message)
      }
      setLoading(false)
      return
    }

    // If session exists immediately (OTP/confirmation disabled in Supabase)
    if (data?.session) {
      showToast(t('signupSuccess'))
      navigate('/onboarding')
    } else {
      // OTP verification required
      setIsOtpStep(true)
      setCountdown(30)
      showToast('Verification code sent to your email')
    }
    setLoading(false)
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    if (!otpCode.trim() || verifying) return
    setError(null)
    setVerifying(true)

    const cleanCode = otpCode.trim()
    const { data, error: otpError } = await verifyOtp({
      email: form.email,
      token: cleanCode,
      username: form.username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      displayName: form.displayName.trim(),
    })

    if (otpError) {
      setError(t('invalidCode') || 'Invalid verification code. Please check and try again.')
      setVerifying(false)
      return
    }

    if (data?.session) {
      showToast(t('signupSuccess'))
      navigate('/onboarding')
    } else {
      showToast('Verified! Please sign in.')
      navigate('/login')
    }
    setVerifying(false)
  }

  const handleResendCode = async () => {
    if (countdown > 0 || resending) return
    setResending(true)
    setError(null)

    const { error: resendError } = await resendOtp(form.email)
    if (resendError) {
      if (resendError.status === 504 || resendError.message?.includes('504') || resendError.message?.toLowerCase().includes('timeout')) {
        setError(t('timeoutError') || 'Email service connection timed out (HTTP 504). Please check your Supabase SMTP settings or try again.')
      } else {
        setError(resendError.message)
      }
    } else {
      setCountdown(30)
      showToast(t('codeResent') || 'Verification code resent')
    }
    setResending(false)
  }

  const handleOAuth = async (provider) => {
    const { error: oError } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/feed`,
      },
    })
    if (oError) showToast(oError.message)
  }

  // const isAppleDevice = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

  return (
    <div className="min-h-screen flex flex-col max-w-md md:max-w-xl mx-auto relative px-4 py-4 selection:bg-[#8FBC94]/30">
      {/* Header controls */}
      <header className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          <CirvyLogo variant="icon" size={30} showGlow />
          <span className="text-xs font-mono font-bold tracking-wider text-[var(--text-main)] uppercase">
            {t('brand')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="w-8 h-8 rounded-full field flex items-center justify-center text-xs font-mono font-bold scale-tap hover:border-[#4A7A8C] cursor-pointer"
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

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center py-4 view">
        {/* Brand Hero */}
        <div className="text-center mb-6 flex flex-col items-center">
          <CirvyLogo variant="full" size={44} className="mb-3" />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-mono font-semibold tracking-wide bg-[#8FBC94]/15 text-[#8FBC94] border border-[#8FBC94]/30 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-[#8FBC94]" />
            <span>{t('shieldLabel')}</span>
          </div>
          <h1 className="font-display font-black text-xl md:text-2xl text-[var(--text-main)] max-w-sm leading-tight">
            {isOtpStep ? (t('verifyEmail') || 'Verify your email') : t('authHeadline')}
          </h1>
          <p className="text-sub text-xs md:text-sm mt-1 max-w-xs">
            {isOtpStep
              ? `${t('enterOtp') || 'Enter the 8-character code sent to'} ${form.email}`
              : t('authSub')}
          </p>
        </div>

        <div className="glass rounded-3xl p-6 shadow-glass border border-[var(--card-border)]">
          {isOtpStep ? (
            /* ============ OTP Verification Screen ============ */
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => {
                    setIsOtpStep(false)
                    setError(null)
                    setOtpCode('')
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-sub hover:text-[var(--text-main)] font-semibold scale-tap"
                >
                  <ArrowLeft size={14} />
                  <span>{t('backToSignup') || 'Change email'}</span>
                </button>
                <span className="text-[11px] font-mono text-sub">{form.email}</span>
              </div>

              {error && (
                <div className="rounded-2xl field border-red-500/40 p-3 text-xs text-red-500 font-medium flex items-center gap-2">
                  <i className="fa-solid fa-circle-exclamation shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-2 text-center">
                    {lang === 'ar' ? 'رمز التحقق (8 خانات)' : '8-Character Verification Code'}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="text"
                      pattern="[0-9a-zA-Z]*"
                      maxLength={8}
                      required
                      autoFocus
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.trim())}
                      placeholder="••••••••"
                      className="field w-full rounded-2xl py-3.5 text-center text-xl md:text-2xl font-mono tracking-[0.25em] md:tracking-[0.35em] font-bold outline-none focus:border-[#4A7A8C]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={otpCode.length < 6 || verifying}
                  className="w-full accent-bg text-[#F5F7F8] dark:text-[#10181C] rounded-full py-3.5 font-bold text-xs md:text-sm scale-tap transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {verifying && <i className="fa-solid fa-circle-notch fa-spin text-sm" />}
                  <span>{t('verifyBtn') || 'Verify & Continue'}</span>
                </button>
              </form>

              <div className="pt-3 border-t border-[var(--card-border)] flex items-center justify-between text-xs">
                <span className="text-sub">{lang === 'ar' ? 'لم يصلك الرمز؟' : "Didn't get a code?"}</span>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={countdown > 0 || resending}
                  className="inline-flex items-center gap-1 font-bold text-sub hover:text-[var(--text-main)] disabled:opacity-50 scale-tap cursor-pointer"
                >
                  <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                  <span>
                    {countdown > 0
                      ? `${t('resendCode') || 'Resend'} (${countdown}s)`
                      : t('resendCode') || 'Resend code'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* ============ Signup Form ============ */
            <>
              {/* Tab Switcher */}
              <div className="flex mb-6 rounded-2xl p-1 field">
                <button
                  onClick={() => navigate('/login')}
                  className="flex-1 py-2 rounded-xl text-xs md:text-sm font-medium transition-all text-sub hover:text-[var(--text-main)] scale-tap"
                >
                  {t('signIn')}
                </button>
                <button
                  onClick={() => {}}
                  className="flex-1 py-2 rounded-xl text-xs md:text-sm font-bold transition-all accent-bg text-[#F5F7F8] dark:text-[#10181C]"
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

              <form id="signupForm" className="space-y-3.5" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    {t('fullName')}
                  </label>
                  <div className="relative">
                    <i className="fa-regular fa-user absolute left-3.5 top-1/2 -translate-y-1/2 text-sub text-xs rtl:left-auto rtl:right-3.5" />
                    <input
                      id="signup-displayname"
                      name="displayName"
                      type="text"
                      required
                      value={form.displayName}
                      onChange={handleChange}
                      className="field w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm rtl:pl-4 rtl:pr-9 outline-none focus:border-[#4A7A8C]"
                      placeholder="your name"
                      autoComplete="name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    {t('username')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sub text-xs font-mono font-bold rtl:left-auto rtl:right-3.5">
                      @
                    </span>
                    <input
                      id="signup-username"
                      name="username"
                      type="text"
                      required
                      value={form.username}
                      onChange={handleChange}
                      className="field w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm rtl:pl-4 rtl:pr-9 font-mono outline-none focus:border-[#4A7A8C]"
                      placeholder="username"
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    {t('email')}
                  </label>
                  <div className="relative">
                    <i className="fa-regular fa-envelope absolute left-3.5 top-1/2 -translate-y-1/2 text-sub text-xs rtl:left-auto rtl:right-3.5" />
                    <input
                      id="signup-email"
                      name="email"
                      type="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      className="field w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm rtl:pl-4 rtl:pr-9 outline-none focus:border-[#4A7A8C]"
                      placeholder="youremail@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--text-main)] mb-1">
                    {t('password')}
                  </label>
                  <div className="relative">
                    <i className="fa-solid fa-lock absolute left-3.5 top-1/2 -translate-y-1/2 text-sub text-xs rtl:left-auto rtl:right-3.5" />
                    <input
                      id="signup-password"
                      name="password"
                      type="password"
                      required
                      minLength={6}
                      value={form.password}
                      onChange={handleChange}
                      className="field w-full rounded-2xl pl-9 pr-4 py-2.5 text-sm rtl:pl-4 rtl:pr-9 outline-none focus:border-[#4A7A8C]"
                      placeholder="••••••••"
                      autoComplete="new-password"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full accent-bg text-[#F5F7F8] dark:text-[#10181C] rounded-full py-3.5 font-bold text-xs md:text-sm scale-tap transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loading && <i className="fa-solid fa-circle-notch fa-spin text-sm" />}
                  <span>{t('createAccount')}</span>
                </button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-[var(--card-border)]" />
                <span className="text-[10px] font-mono text-sub uppercase tracking-wider">
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
                {/* {isAppleDevice && (
                  <button
                    type="button"
                    onClick={() => handleOAuth('apple')}
                    className="field rounded-2xl py-2.5 flex items-center justify-center gap-2 text-xs font-semibold scale-tap hover:border-[#4A7A8C] transition-all cursor-pointer"
                  >
                    <i className="fa-brands fa-apple text-[14px]" /> Apple
                  </button>
                )} */}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-sub mt-5 flex items-center justify-center gap-1.5 max-w-xs mx-auto leading-relaxed">
          <i className="fa-solid fa-shield-halved text-[11px] text-[#8FBC94]" />
          <span>{t('authFooter')}</span>
        </p>
      </main>
    </div>
  )
}
