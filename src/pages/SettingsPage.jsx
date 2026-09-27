// src/pages/SettingsPage.jsx
// Full dedicated Settings page matching Instagram layout and Cirvy design system.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  User,
  Shield,
  Moon,
  Sun,
  Stamp,
  Fingerprint,
  AlertTriangle,
  LogOut,
  Bell,
  Search,
  Check,
  Camera,
  Lock,
  EyeOff,
  UserCheck,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { supabase } from '@/lib/supabase'
import AppShell from '@/components/AppShell'

export default function SettingsPage() {
  const { user, profile, refreshProfile, signOut } = useAuth()
  const {
    dark,
    toggleTheme,
    ghostMode,
    toggleGhostMode,
    watermark,
    toggleWatermark,
    engagePanic,
    showToast,
    t,
  } = useUI()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('edit_profile')
  const [searchQuery, setSearchQuery] = useState('')

  // Edit Profile Form State
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [avatarFile, setAvatarFile] = useState(null)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '')
      setUsername(profile.username || '')
      setBio(profile.bio || '')
      setAvatarUrl(profile.avatar_url || '')
    }
  }, [profile])

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file')
      return
    }
    setAvatarFile(file)
    const localUrl = URL.createObjectURL(file)
    setAvatarUrl(localUrl)
  }

  async function uploadAvatar() {
    if (!avatarFile || !user) return avatarUrl
    const ext = avatarFile.name.split('.').pop() || 'jpg'
    const path = `avatars/${user.id}-${Date.now()}.${ext}`

    try {
      const { error } = await supabase.storage.from('post-media').upload(path, avatarFile, {
        cacheControl: '3600',
        upsert: true,
      })
      if (error) {
        // Fallback to data URL
        return new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.readAsDataURL(avatarFile)
        })
      }
      const { data } = supabase.storage.from('post-media').getPublicUrl(path)
      return data.publicUrl
    } catch {
      return avatarUrl
    }
  }

  async function handleSaveProfile(e) {
    e.preventDefault()
    if (!user) return
    setSavingProfile(true)
    setProfileMsg('')

    try {
      const uploadedUrl = await uploadAvatar()
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          username: cleanUsername,
          bio: bio.trim(),
          avatar_url: uploadedUrl,
        })
        .eq('id', user.id)

      if (error) {
        setProfileMsg('Could not update profile. Username may already be taken.')
      } else {
        await refreshProfile()
        showToast('Profile saved successfully')
        setProfileMsg('Profile updated successfully!')
      }
    } catch {
      setProfileMsg('Failed to save profile changes.')
    } finally {
      setSavingProfile(false)
    }
  }

  const handleLogout = async () => {
    if (window.confirm(t('logoutConfirm') || 'Are you sure you want to log out?')) {
      await signOut()
      showToast(t('loggedOut') || 'You have been logged out securely.')
      navigate('/login')
    }
  }

  const navSections = [
    {
      title: 'Your account',
      items: [
        { id: 'account_info', label: 'Account Information', icon: User },
      ],
    },
    {
      title: 'How you use Cirvy',
      items: [
        { id: 'edit_profile', label: 'Edit Profile', icon: UserCheck },
        { id: 'appearance', label: 'Appearance', icon: dark ? Moon : Sun },
        { id: 'notifications', label: 'Notifications', icon: Bell },
      ],
    },
    {
      title: 'Who can see your content',
      items: [
        { id: 'account_privacy', label: 'Account Privacy', icon: Lock },
        { id: 'ghost_mode', label: 'Ghost Mode', icon: EyeOff },
        { id: 'screen_protection', label: 'Screen Protection', icon: Stamp },
      ],
    },
    {
      title: 'Emergency',
      items: [
        { id: 'panic_lock', label: 'Panic Lock', icon: AlertTriangle },
      ],
    },
  ]

  const filteredSections = navSections
    .map((sec) => ({
      ...sec,
      items: sec.items.filter((item) =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((sec) => sec.items.length > 0)

  return (
    <AppShell rightSidebar={false}>
      <main className="min-w-0 py-4 max-w-5xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-[var(--text-main)] mb-6">
          Settings
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 glass rounded-3xl border border-[var(--card-border)] overflow-hidden shadow-glass min-h-[680px]">
          {/* ================= LEFT SETTINGS SIDEBAR ================= */}
          <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-[var(--card-border)] p-4 sm:p-5 flex flex-col justify-between bg-[var(--bg)]/40">
            <div className="space-y-5">
              {/* Search Settings */}
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sub" />
                <input
                  type="text"
                  placeholder="Search settings..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-2xl field pl-9 pr-3.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
              </div>

              {/* Navigation Items */}
              <div className="space-y-4">
                {filteredSections.map((sec) => (
                  <div key={sec.title} className="space-y-1">
                    <p className="text-[10px] font-display font-bold uppercase tracking-wider text-sub px-3 mb-1">
                      {sec.title}
                    </p>
                    {sec.items.map((item) => {
                      const Icon = item.icon
                      const isActive = activeTab === item.id
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab(item.id)}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold transition scale-tap text-left cursor-pointer ${isActive
                              ? 'accent-bg text-white dark:text-[#070D0C] shadow-sm font-bold'
                              : 'text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/40'
                            }`}
                        >
                          <Icon size={16} />
                          <span>{item.label}</span>
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>

            {/* Logout button */}
            <div className="pt-4 mt-6 border-t border-[var(--card-border)]">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition scale-tap cursor-pointer"
              >
                <LogOut size={16} />
                <span>Log Out</span>
              </button>
            </div>
          </div>

          {/* ================= RIGHT CONTENT AREA ================= */}
          <div className="md:col-span-8 p-6 sm:p-8 overflow-y-auto max-h-[750px]">
            {/* 1. EDIT PROFILE */}
            {activeTab === 'edit_profile' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-display font-bold text-[var(--text-main)]">Edit Profile</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Update your display name, username, bio, and avatar.
                  </p>
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-5">
                  {/* Avatar upload */}
                  <div className="flex items-center gap-4 p-4 rounded-2xl field">
                    <img
                      src={
                        avatarUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(
                          displayName || 'You'
                        )}&background=00AFA0&color=fff`
                      }
                      alt="Avatar preview"
                      className="w-14 h-14 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                    />
                    <div className="space-y-1">
                      <label className="inline-flex items-center gap-1.5 accent-bg text-white dark:text-[#070D0C] text-xs font-bold font-display px-3.5 py-1.5 rounded-full scale-tap cursor-pointer">
                        <Camera size={13} />
                        <span>Change photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="sr-only"
                        />
                      </label>
                      <p className="text-[11px] text-sub">JPG, PNG or WEBP up to 5MB.</p>
                    </div>
                  </div>

                  {/* Display Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-display font-bold text-[var(--text-main)]">
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                      required
                      className="w-full rounded-2xl field px-4 py-2.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                    />
                  </div>

                  {/* Username */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-display font-bold text-[var(--text-main)]">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sub font-display text-xs">
                        @
                      </span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username"
                        required
                        className="w-full rounded-2xl field pl-8 pr-4 py-2.5 text-xs text-[var(--text-main)] font-display outline-none focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>

                  {/* Bio */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-display font-bold text-[var(--text-main)]">Bio</label>
                      <span className="text-[11px] font-display text-sub">{bio.length}/150</span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={150}
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Share a short bio visible only to your accepted friends..."
                      className="w-full rounded-2xl field p-3.5 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)] resize-none"
                    />
                    <p className="text-[11px] text-sub">
                      Cirvy privacy rule: Bio is encrypted and strictly visible to accepted friends only.
                    </p>
                  </div>

                  {profileMsg && (
                    <p className="text-xs font-semibold text-[var(--accent)]">{profileMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="accent-bg text-white dark:text-[#070D0C] px-6 py-2.5 rounded-full text-xs font-bold font-display scale-tap transition disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    {savingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </form>
              </div>
            )}

            {/* 2. APPEARANCE */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-display font-bold text-[var(--text-main)]">Appearance</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Customize how Cirvy looks on your device.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl field">
                  <div className="flex items-center gap-3">
                    {dark ? (
                      <Moon size={20} className="text-[var(--accent)]" />
                    ) : (
                      <Sun size={20} className="text-[var(--accent)]" />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-main)]">Dark Mode</p>
                      <p className="text-xs text-sub">
                        {dark
                          ? 'Using dark palette (#070D0C / #0D1A19)'
                          : 'Using light palette (#F0FAF9 / #FFFFFF)'}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`switch ${dark ? 'on' : ''}`}
                    onClick={toggleTheme}
                    role="switch"
                    aria-checked={dark}
                  />
                </div>
              </div>
            )}

            {/* 3. ACCOUNT INFO */}
            {activeTab === 'account_info' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-display font-bold text-[var(--text-main)]">Account Information</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Your authenticated Cirvy account details.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-2xl field space-y-1">
                    <p className="text-[10px] font-display uppercase text-sub font-bold">Email</p>
                    <p className="text-sm font-semibold text-[var(--text-main)]">
                      {user?.email || 'Authenticated user'}
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl field space-y-1">
                    <p className="text-[10px] font-display uppercase text-sub font-bold">Account ID</p>
                    <p className="text-xs font-display text-sub">{user?.id || '—'}</p>
                  </div>
                  <div className="p-4 rounded-2xl field space-y-1">
                    <p className="text-[10px] font-display uppercase text-sub font-bold">Security Level</p>
                    <p className="text-xs font-semibold text-[var(--accent)] flex items-center gap-1.5">
                      <Check size={14} />
                      <span>Zero-Tracking Shield Active</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 4. ACCOUNT PRIVACY */}
            {activeTab === 'account_privacy' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-display font-bold text-[var(--text-main)]">Account Privacy</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Cirvy privacy guarantees and access controls.
                  </p>
                </div>

                <div className="p-5 rounded-2xl field space-y-3 border border-[var(--accent)]/30 bg-[var(--accent)]/5">
                  <div className="flex items-center gap-2 text-[var(--accent)]">
                    <Shield size={18} />
                    <p className="text-sm font-bold font-display">Private by Default</p>
                  </div>
                  <p className="text-xs text-sub leading-relaxed font-body">
                    Your posts, videos, polls, and bio are never indexed, crawled, or shown to strangers.
                    Only friends you explicitly accept can view your content.
                  </p>
                </div>
              </div>
            )}

            {/* 5. GHOST MODE */}
            {activeTab === 'ghost_mode' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-display font-bold text-[var(--text-main)]">Ghost Mode</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Browse without revealing your active online status.
                  </p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-2xl field">
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-ghost w-5 text-[var(--accent)] text-lg" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-main)]">
                        Enable Ghost Mode
                      </p>
                      <p className="text-xs text-sub font-body">
                        Suppresses presence broadcast. You will never appear online to others.
                      </p>
                    </div>
                  </div>
                  <div
                    className={`switch ${ghostMode ? 'on' : ''}`}
                    onClick={() => toggleGhostMode()}
                    role="switch"
                    aria-checked={ghostMode}
                  />
                </div>
              </div>
            )}

            {/* 6. SCREEN PROTECTION */}
            {activeTab === 'screen_protection' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-main)]">Screen Protection</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Defense against screenshots and unauthorized leaks.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 rounded-2xl field">
                    <div className="flex items-center gap-3">
                      <Stamp size={20} className="text-sub" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-main)]">
                          Anti-Screenshot Watermark
                        </p>
                        <p className="text-xs text-sub">
                          Overlays dynamic account watermark on screen.
                        </p>
                      </div>
                    </div>
                    <div
                      className={`switch ${watermark ? 'on' : ''}`}
                      onClick={() => toggleWatermark()}
                    />
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-2xl field opacity-80">
                    <div className="flex items-center gap-3">
                      <Fingerprint size={20} className="text-sub" />
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-main)]">
                          AI Leak Traceback
                        </p>
                        <p className="text-xs text-sub">
                          Steganographic watermark to trace leaked media.
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-display px-2 py-0.5 rounded-full bg-[#8FBC94]/20 text-[#8FBC94] font-bold">
                      SOON
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 7. NOTIFICATIONS */}
            {activeTab === 'notifications' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-main)]">Notifications</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Manage alerts for friend requests, replies, and votes.
                  </p>
                </div>

                <div className="p-5 rounded-2xl field space-y-3">
                  <p className="text-xs text-[var(--text-main)] font-semibold">
                    Circle Notifications Center
                  </p>
                  <p className="text-xs text-sub">
                    You receive real-time notifications for incoming friend requests, replies, and poll interactions.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/notifications')}
                    className="accent-bg text-[#F5F7F8] dark:text-[#10181C] text-xs font-bold px-4 py-2 rounded-full scale-tap"
                  >
                    Go to Notifications
                  </button>
                </div>
              </div>
            )}

            {/* 8. PANIC LOCK */}
            {activeTab === 'panic_lock' && (
              <div className="space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl font-bold text-[var(--text-main)]">Panic Lock</h2>
                  <p className="text-xs text-sub mt-0.5">
                    Emergency screen camouflage for instant privacy.
                  </p>
                </div>

                <div className="p-5 rounded-2xl field space-y-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={20} className="text-[#8FBC94]" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-main)]">
                        Decoy Screen Camouflage
                      </p>
                      <p className="text-xs text-sub">
                        Instantly locks the application behind an innocent calculator screen. Tap 5 times to unlock.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={engagePanic}
                    className="accent-bg text-[#F5F7F8] dark:text-[#10181C] text-xs font-bold px-5 py-2.5 rounded-full scale-tap cursor-pointer"
                  >
                    Engage Panic Lock Now
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  )
}
