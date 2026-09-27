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
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'
import { supabase } from '@/lib/supabase'
import CirvyLogo from './CirvyLogo'

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
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
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
      <aside className="hidden w-72 shrink-0 lg:block">
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
    { to: '/create-post', label: 'Create', icon: PlusSquare },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
    { to: '/friends', label: 'Friends', icon: Users },
    { to: '/messages', label: 'Chats (Coming soon)', icon: MessageSquare },
  ]

  return (
    <aside className="hidden w-60 shrink-0 md:flex flex-col justify-between h-[calc(100vh-3rem)] sticky top-6">
      <div className="flex-1 flex flex-col min-h-0">
        {/* Brand Header */}
        <Link to="/feed" className="mb-6 flex items-center gap-2 group px-2">
          <CirvyLogo variant="full" size={26} />
        </Link>

        {/* Primary Navigation Group */}
        <nav className="space-y-1">
          {mainNavItems.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={label}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-2.5 text-xs font-semibold transition scale-tap ${isActive
                  ? 'accent-bg text-white dark:text-[#070D0C] shadow-sm font-bold'
                  : 'text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/40'
                }`
              }
            >
              <div className="relative">
                <Icon size={16} />
              </div>
              <span className="truncate">{label}</span>
              {badge > 0 && (
                <span className="ms-auto rounded-full bg-[var(--accent)] text-white dark:text-[#070D0C] px-1.5 py-0.5 text-[10px] font-bold font-display leading-none">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Instagram-Style Bottom Group (Profile & "More" Popover Menu) */}
      <div className="border-t border-[var(--card-border)] pt-3 mt-2 space-y-1 relative" ref={moreMenuRef}>
        {/* Profile Link */}
        <NavLink
          to={profilePath}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-2xl px-4 py-2.5 text-xs font-semibold transition scale-tap ${isActive
              ? 'accent-bg text-white dark:text-[#070D0C] shadow-sm font-bold'
              : 'text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/40'
            }`
          }
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-4 w-4 rounded-full object-cover ring-1 ring-current"
            />
          ) : (
            <User size={16} />
          )}
          <span>Profile</span>
        </NavLink>

        {/* More Popover Button */}
        <button
          type="button"
          onClick={() => setShowMoreMenu((prev) => !prev)}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-xs font-semibold transition scale-tap cursor-pointer ${showMoreMenu
              ? 'bg-[var(--card-border)]/60 text-[var(--text-main)]'
              : 'text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/40'
            }`}
        >
          <Menu size={16} />
          <span>More</span>
        </button>

        {/* Floating "More" Menu Popover */}
        {showMoreMenu && (
          <div className="absolute bottom-14 left-0 w-64 glass rounded-3xl p-2 border border-[var(--card-border)] shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 space-y-1">
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
  )
}