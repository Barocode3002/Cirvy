// src/components/Sidebar.jsx
// Instagram-style layout for Cirvy with "More" popover and dedicated /settings navigation.

import { useEffect, useState, useRef } from 'react'
import { NavLink, Link, useNavigate } from 'react-router-dom'
import {
  Home,
  Search,
  Bell,
  Users,
  MessageSquare,
  PlusSquare,
  Settings,
  User,
  Menu,
  Moon,
  Sun,
  LogOut,
} from 'lucide-react'
import CirvyLogo from './CirvyLogo'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'
import { supabase } from '@/lib/supabase'

function avatarFor(person, fallback = 'User') {
  return (
    person?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      person?.display_name || fallback
    )}&background=4A7A8C&color=F5F7F8`
  )
}

export default function Sidebar({ side = 'left' }) {
  const { user, profile, signOut } = useAuth()
  const { dark, toggleTheme, showToast, t } = useUI()
  const { isOnline } = usePresence()
  const navigate = useNavigate()

  const [friends, setFriends] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const moreMenuRef = useRef(null)

  useEffect(() => {
    if (!user) return
    loadFriends()
    loadUnreadCount()

    const interval = setInterval(loadUnreadCount, 15000)
    return () => clearInterval(interval)
  }, [user])

  // Close "More" popover on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false)
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setShowMoreMenu(false)
      }
    }
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showMoreMenu])

  async function loadFriends() {
    if (!user) return
    const { data: friendships } = await supabase
      .from('friendships')
      .select('requester_id, addressee_id')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq('status', 'accepted')

    const ids = (friendships || []).map((f) =>
      f.requester_id === user.id ? f.addressee_id : f.requester_id
    )

    if (!ids.length) {
      setFriends([])
      return
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', ids)

    setFriends(data || [])
  }

  async function loadUnreadCount() {
    if (!user) return
    let count = 0

    // 1. Pending friend requests
    try {
      const { count: reqCount } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending')
      if (reqCount) count += reqCount
    } catch {
      // Ignored
    }

    // 2. Unread notifications
    try {
      const { count: notifCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
      if (notifCount) count += notifCount
    } catch {
      // Ignored
    }

    setUnreadCount(count)
  }

  const handleLogout = async () => {
    setShowMoreMenu(false)
    if (window.confirm(t('logoutConfirm') || 'Are you sure you want to log out?')) {
      await signOut()
      showToast(t('loggedOut') || 'You have been logged out securely.')
      navigate('/login')
    }
  }

  // Filter friends to only those who are online (Ghost-mode enabled friends will have isOnline === false)
  const onlineFriends = friends.filter((f) => isOnline(f.id))

  // ================= RIGHT SIDEBAR =================
  if (side === 'right') {
    return (
      <aside className="hidden w-72 shrink-0 py-6 pe-6 lg:block">
        <div className="sticky top-8 rounded-3xl glass p-5 shadow-glass border border-[var(--card-border)]">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-display font-bold uppercase tracking-[0.18em] text-sub">
                Circle Presence
              </p>
              <h2 className="mt-0.5 text-base font-bold text-[var(--text-main)]">
                Online Friends
              </h2>
            </div>
            {onlineFriends.length > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-[#8FBC94]/20 text-[#8FBC94] border border-[#8FBC94]/30 px-2 py-0.5 text-[10px] font-display font-bold">
                <span className="h-1.5 w-1.5 rounded-full bg-[#8FBC94] animate-pulse" />
                <span>{onlineFriends.length}</span>
              </span>
            )}
          </div>

          {onlineFriends.length === 0 ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-xs text-sub">No friends active right now.</p>
              <p className="text-[11px] text-sub/70">
                Ghost mode or offline friends stay completely hidden.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {onlineFriends.map((person) => {
                const personPath = person.username ? `/${person.username}` : `/${person.id}`
                return (
                  <div key={person.id} className="flex items-center gap-3">
                    <Link to={personPath} className="relative shrink-0">
                      <img
                        src={avatarFor(person)}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                      />
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#8FBC94] ring-1 ring-[var(--bg)] shadow-[0_0_6px_rgba(143,188,148,0.8)]" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={personPath}
                        className="block truncate text-xs font-bold text-[var(--text-main)] hover:underline"
                      >
                        {person.display_name || 'User'}
                      </Link>
                      <p className="truncate text-[11px] text-[#8FBC94] font-medium">
                        Online
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <Link
            to="/friends"
            className="mt-5 flex items-center justify-center gap-1.5 text-xs font-bold text-sub hover:text-[var(--text-main)] transition"
          >
            <Users size={13} />
            <span>Manage Friends</span>
          </Link>
        </div>
      </aside>
    )
  }

  // ================= LEFT SIDEBAR =================
  const currentHandle = profile?.username || user?.user_metadata?.username
  const profilePath = currentHandle ? `/${currentHandle}` : (user ? `/profile/${user.id}` : '/login')

  const mainNavItems = [
    { to: '/feed', label: 'Home', icon: Home },
    { to: '/search', label: 'Search', icon: Search },
    { to: '/messages', label: 'Messages', icon: MessageSquare },
    { to: '/create-post', label: 'Create', icon: PlusSquare },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { to: '/friends', label: 'Friends', icon: Users },
  ]

  const labelCls = `overflow-hidden whitespace-nowrap text-sm font-semibold opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100 ${showMoreMenu ? 'opacity-100' : ''}`
  const itemCls = (a) => `relative mx-2 flex h-12 items-center gap-4 rounded-2xl px-3.5 transition scale-tap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${a ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-sub hover:bg-[var(--card-border)]/50 hover:text-[var(--text-main)]'}`

  return (
    <div className="relative hidden w-[4.5rem] shrink-0 md:block">
      <aside className={`group/rail fixed start-0 top-0 z-40 flex h-screen flex-col justify-between border-e border-[var(--card-border)] bg-[var(--bg)] py-5 transition-[width,box-shadow] delay-100 duration-200 ease-out ${showMoreMenu ? 'w-[15.5rem] shadow-2xl' : 'w-[4.5rem] hover:w-[15.5rem] hover:shadow-2xl focus-within:w-[15.5rem] focus-within:shadow-2xl'}`}>
        <div className="overflow-hidden">
          {/* Top Logo */}
          <Link to="/feed" aria-label="Cirvy" className="mx-2 mb-5 flex h-12 items-center px-3.5 relative">
            {/* Collapsed state Icon - Only visible when not expanded */}
            <div className={`shrink-0 transition-opacity duration-200 ease-out ${showMoreMenu ? 'opacity-0' : 'group-hover/rail:opacity-0 group-focus-within/rail:opacity-0'}`}>
               <CirvyLogo variant="icon" size={30} />
            </div>
            
            {/* Expanded state Wordmark + Beta - Fixed position overlapping icon */}
            <div className={`absolute left-3.5 flex items-center transition-all duration-200 ease-out whitespace-nowrap overflow-hidden
              opacity-0 max-w-0 pointer-events-none translate-x-1
              group-hover/rail:opacity-100 group-hover/rail:max-w-[12rem] group-hover/rail:pointer-events-auto group-hover/rail:translate-x-0
              group-focus-within/rail:opacity-100 group-focus-within/rail:max-w-[12rem] group-focus-within/rail:pointer-events-auto group-focus-within/rail:translate-x-0
              ${showMoreMenu ? 'opacity-100 max-w-[12rem] pointer-events-auto translate-x-0' : ''}`}>
               <CirvyLogo variant="full" size={26} />
               <span className="ml-3 rounded-full border border-[var(--accent)]/20 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-sub flex items-center justify-center leading-none">
                 Beta v.1
               </span>
            </div>
          </Link>

          {/* Primary Navigation Group */}
          <nav className="flex flex-col gap-1">
            {mainNavItems.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={label}
                to={to}
                aria-label={label}
                className={({ isActive }) => itemCls(isActive)}
              >
                {({ isActive }) => (
                  <>
                    <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                      <Icon className="h-7 w-7" strokeWidth={isActive ? 2.4 : 1.8} />
                      {badge > 0 && (
                        <span className="absolute -end-2 -top-2 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[var(--bg)]">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      )}
                    </span>
                    <span aria-hidden="true" className={labelCls}>
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Instagram-Style Bottom Group (Profile & "More" Popover Menu) */}
        <div ref={moreMenuRef} className="relative flex flex-col gap-1">
          {/* Profile Link */}
          <NavLink
            to={profilePath}
            aria-label="Profile"
            className={({ isActive }) => itemCls(isActive)}
          >
            {() => (
              <>
                <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <User className="h-7 w-7" />
                  )}
                </span>
                <span aria-hidden="true" className={labelCls}>
                  Profile
                </span>
              </>
            )}
          </NavLink>

          {/* More Popover Button */}
          <button
            type="button"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            aria-label="More"
            className={`${itemCls(false)} w-[calc(100%-1rem)] cursor-pointer text-left ${showMoreMenu ? 'bg-[var(--card-border)]/60 text-[var(--text-main)]' : ''}`}
          >
            <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
              <Menu className="h-7 w-7" />
            </span>
            <span aria-hidden="true" className={labelCls}>
              More
            </span>
          </button>

          {/* Floating "More" Menu Popover */}
          {showMoreMenu && (
            <div className="absolute bottom-full start-2 mb-2 w-56 glass rounded-3xl p-2 border border-[var(--card-border)] shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
              <Link
                to="/settings"
                onClick={() => setShowMoreMenu(false)}
                className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--card-border)]/40 transition scale-tap"
              >
                <Settings size={16} className="text-sub" />
                <span>Settings</span>
              </Link>

              <button
                type="button"
                onClick={() => {
                  toggleTheme()
                  setShowMoreMenu(false)
                }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--card-border)]/40 transition scale-tap cursor-pointer text-left"
              >
                {dark ? (
                  <Sun size={16} className="text-[var(--accent)]" />
                ) : (
                  <Moon size={16} className="text-[var(--accent)]" />
                )}
                <span>Switch appearance</span>
              </button>

              <div className="h-px bg-[var(--card-border)] my-1" />

              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-semibold text-red-500 hover:bg-red-500/10 transition scale-tap cursor-pointer text-left"
              >
                <LogOut size={16} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}