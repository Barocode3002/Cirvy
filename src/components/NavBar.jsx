import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home,
  Search,
  PlusSquare,
  MessageSquare,
  User,
  Bell,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import SettingsModal from './SettingsModal'

export default function NavBar() {
  const { user, profile } = useAuth()

  const [unreadCount, setUnreadCount] = useState(0)

  const currentHandle =
    profile?.username ||
    user?.user_metadata?.username

  const profilePath = currentHandle
    ? `/${currentHandle}`
    : user
      ? `/profile/${user.id}`
      : '/login'

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0)
      return undefined
    }

    let active = true
    let channel = null

    const userId = user.id

    async function loadUnreadCount() {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', {
          count: 'exact',
          head: true,
        })
        .eq('user_id', userId)
        .eq('is_read', false)

      if (!active) return

      if (error) {
        console.error(
          '[CIRVY NAV NOTIFICATIONS] Unread count error:',
          error
        )
        return
      }

      setUnreadCount(count || 0)
    }

    /*
     * IMPORTANT:
     *
     * All postgres_changes listeners MUST be attached
     * BEFORE subscribe().
     *
     * This fixes:
     *
     * "cannot add postgres_changes callbacks after subscribe()"
     */
    channel = supabase
      .channel(`cirvy-nav-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active) return

          const row = payload?.new

          if (!row) return

          if (row.is_read === false) {
            setUnreadCount((prev) => prev + 1)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (!active) return

          const oldRead = payload?.old?.is_read
          const newRead = payload?.new?.is_read

          if (
            oldRead === false &&
            newRead === true
          ) {
            setUnreadCount((prev) =>
              Math.max(0, prev - 1)
            )
          }

          if (
            oldRead === true &&
            newRead === false
          ) {
            setUnreadCount((prev) => prev + 1)
          }
        }
      )
      .subscribe((status, error) => {
        if (!active) return

        console.log(
          `[CIRVY NAV NOTIFICATIONS] ${status}`,
          error || ''
        )

        if (status === 'SUBSCRIBED') {
          console.log(
            '✅ CIRVY nav notifications realtime connected'
          )
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            '❌ CIRVY nav notifications realtime problem:',
            status,
            error || ''
          )
        }
      })

    /*
     * Load initial count after channel is configured.
     */
    loadUnreadCount()

    return () => {
      active = false

      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id])

  const navItems = [
    {
      to: '/feed',
      icon: Home,
      label: 'Home',
    },
    {
      to: '/search',
      icon: Search,
      label: 'Search',
    },
    {
      to: '/create-post',
      icon: PlusSquare,
      label: 'Create',
    },
    {
      to: '/messages',
      icon: MessageSquare,
      label: 'Messages',
    },
    {
      to: '/notifications',
      icon: Bell,
      label: 'Notifications',
      badge: unreadCount,
    },
    {
      to: profilePath,
      icon: User,
      label: 'Profile',
    },
  ]

  return (
    <>
      <nav
        id="bottomNav"
        className="fixed bottom-0 left-0 right-0 glass border-t border-[var(--card-border)] px-2 py-2 z-30 shadow-lg md:hidden"
        style={{
          paddingBottom:
            'calc(env(safe-area-inset-bottom) + 8px)',
        }}
      >
        <div className="grid grid-cols-6 max-w-md mx-auto items-center">
          {navItems.map(
            ({
              to,
              icon: Icon,
              label,
              badge,
            }) => (
              <NavLink
                key={to}
                to={to}
                aria-label={label}
                className={({ isActive }) =>
                  `relative flex flex-col items-center justify-center py-1 scale-tap transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[var(--accent)]'
                      : 'text-sub hover:text-[var(--text-main)]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="relative">
                      <Icon
                        size={21}
                        strokeWidth={
                          isActive ? 2.2 : 1.8
                        }
                      />

                      {badge > 0 && (
                        <span className="absolute -top-2.5 -right-3 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none ring-2 ring-[var(--bg)]">
                          {badge > 99
                            ? '99+'
                            : badge}
                        </span>
                      )}
                    </span>

                    <span
                      className={`w-1 h-1 rounded-full bg-[var(--accent)] mt-1 transition-opacity duration-200 ${
                        isActive
                          ? 'opacity-100'
                          : 'opacity-0'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            )
          )}
        </div>
      </nav>

      <SettingsModal />
    </>
  )
}