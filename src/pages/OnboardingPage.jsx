// src/pages/OnboardingPage.jsx
// One-time onboarding step for new users to set avatar & bio.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import CirvyLogo from '@/components/CirvyLogo'
import { Camera, Image, X, ArrowRight, Sparkles } from 'lucide-react'

export default function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth()
  const { showToast } = useUI()
  const navigate = useNavigate()

  const [bio, setBio] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)

  const displayName = profile?.display_name || user?.user_metadata?.display_name || 'there'
  const username = profile?.username || user?.user_metadata?.username || 'user'

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(avatarFile)
    setAvatarPreview(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [avatarFile])

  function handleAvatarChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Choose an image file.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setAvatarError('Profile picture must be smaller than 4 MB.')
      return
    }
    setAvatarError('')
    setAvatarFile(file)
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadAvatar() {
    if (!avatarFile || !user) return null
    const extension = avatarFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${user.id}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage
      .from('profile-media')
      .upload(path, avatarFile, {
        cacheControl: '3600',
        contentType: avatarFile.type,
        upsert: false,
      })

    if (uploadError) {
      return await fileToDataUrl(avatarFile)
    }
    return supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl
  }

  async function handleGetStarted(e) {
    e.preventDefault()
    if (!user || saving || skipping) return
    setSaving(true)
    setAvatarError('')

    try {
      let avatarUrl = profile?.avatar_url || null
      if (avatarFile) {
        avatarUrl = await uploadAvatar()
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          avatar_url: avatarUrl,
          bio: bio.trim(),
          onboarded: true,
        })
        .eq('id', user.id)

      if (error) throw error

      await refreshProfile()
      showToast('Profile set up! Welcome to your circle.')
      navigate('/feed', { replace: true })
    } catch {
      setAvatarError('Could not save profile details. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleSkip() {
    if (!user || saving || skipping) return
    setSkipping(true)

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          onboarded: true,
        })
        .eq('id', user.id)

      if (error) throw error

      await refreshProfile()
      showToast('Welcome to Cirvy!')
      navigate('/feed', { replace: true })
    } catch {
      showToast('Could not proceed. Try again.')
    } finally {
      setSkipping(false)
    }
  }

  const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    displayName
  )}&background=4A7A8C&color=F5F7F8&size=160`

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-[var(--bg)] text-[var(--text-main)] selection:bg-[#8FBC94]/30">
      <div className="w-full max-w-md view">
        {/* Brand header */}
        <div className="text-center mb-6 flex flex-col items-center">
          <CirvyLogo variant="full" size={40} className="mb-3" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#8FBC94]/15 text-[#8FBC94] border border-[#8FBC94]/30 mb-2">
            <Sparkles size={12} />
            <span>Step 1 of 1 · Welcome</span>
          </div>
          <h1 className="font-display font-black text-2xl text-[var(--text-main)]">
            Welcome, {displayName}!
          </h1>
          <p className="text-sub text-xs mt-1 max-w-xs">
            Personalize your private profile so your friends can recognize you.
          </p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-6 sm:p-7 shadow-glass border border-[var(--card-border)]">
          <form onSubmit={handleGetStarted} className="space-y-5">
            {/* Avatar Section */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3">
                <img
                  src={avatarPreview || defaultAvatar}
                  alt="Avatar preview"
                  className="w-24 h-24 rounded-full object-cover ring-4 ring-[var(--card-border)]"
                />
                {avatarFile && (
                  <button
                    type="button"
                    onClick={() => setAvatarFile(null)}
                    className="absolute -top-1 -right-1 w-6 h-6 rounded-full field flex items-center justify-center text-sub hover:text-[var(--text-main)] scale-tap shadow-sm"
                    aria-label="Remove photo"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full accent-bg px-4 text-xs font-bold text-[#F5F7F8] dark:text-[#10181C] hover:opacity-90 scale-tap transition">
                  <Image size={14} />
                  <span>{avatarFile ? 'Change photo' : 'Choose photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    className="sr-only"
                  />
                </label>
              </div>
              <p className="text-[10px] text-sub mt-2 flex items-center gap-1">
                <Camera size={12} />
                <span>Gallery or camera · up to 4 MB</span>
              </p>

              {avatarError && (
                <p
                  role="alert"
                  className="mt-2 rounded-xl field px-3 py-1.5 text-xs font-semibold text-red-500 border-red-500/40"
                >
                  {avatarError}
                </p>
              )}
            </div>

            {/* Bio Section */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-[var(--text-main)]">
                  Bio <span className="text-sub font-normal">(optional)</span>
                </label>
                <span className="text-[10px] font-mono text-sub">
                  {bio.length}/160
                </span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                rows={3}
                placeholder="Share a short note with your circle..."
                className="field w-full rounded-2xl p-3 text-sm resize-none outline-none focus:border-[#4A7A8C]"
              />
            </div>

            {/* User identity preview badge */}
            <div className="field rounded-2xl p-3 flex items-center justify-between text-xs">
              <span className="text-sub">Handle</span>
              <span className="font-mono font-bold text-[var(--text-main)]">
                @{username}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={saving || skipping}
                className="w-full accent-bg text-[#F5F7F8] dark:text-[#10181C] rounded-full py-3.5 font-bold text-sm scale-tap transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {saving ? (
                  <>
                    <i className="fa-solid fa-circle-notch fa-spin text-sm" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span>Get Started</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleSkip}
                disabled={saving || skipping}
                className="w-full py-2.5 text-xs font-bold text-sub hover:text-[var(--text-main)] scale-tap transition cursor-pointer text-center"
              >
                {skipping ? 'Entering...' : 'Skip for now'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
