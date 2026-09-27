// src/pages/NotificationsPage.jsx
// Minimal, functional Notifications center matching Cirvy design system.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, Check, Heart, MessageSquare, UserPlus, UserCheck, Vote, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import AppShell from '@/components/AppShell'

export default function NotificationsPage() {
  const { user } = useAuth()
  const { t, showToast } = useUI()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState(null)

  useEffect(() => {
    if (user) loadNotifications()
  }, [user])

  async function loadNotifications() {
    setLoading(true)
    if (!user) return

    const items = []

    // 1. Fetch pending friend requests as high-priority notification items
    try {
      const { data: reqData } = await supabase
        .from('friendships')
        .select('id, created_at, status, requester:requester_id(id, username, display_name, avatar_url)')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (reqData) {
        reqData.forEach((req) => {
          items.push({
            id: `friend-req-${req.id}`,
            friendship_id: req.id,
            actor: req.requester,
            type: 'friend_request',
            content: 'sent you a friend request.',
            created_at: req.created_at,
            is_read: false,
          })
        })
      }
    } catch {
      // Ignored
    }

    // 2. Fetch notifications from notifications table
    try {
      const { data: dbNotifications } = await supabase
        .from('notifications')
        .select('id, type, entity_id, content, is_read, created_at, actor:actor_id(id, username, display_name, avatar_url)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(40)

      if (dbNotifications) {
        dbNotifications.forEach((n) => {
          items.push({
            id: n.id,
            actor: n.actor,
            type: n.type,
            content: n.content || defaultContentFor(n.type),
            created_at: n.created_at,
            is_read: n.is_read,
          })
        })
      }
    } catch {
      // Table might not exist yet or empty — handled gracefully
    }

    // Sort all chronologically
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    setNotifications(items)
    setLoading(false)
  }

  function defaultContentFor(type) {
    switch (type) {
      case 'like':
        return 'liked your post.'
      case 'comment':
        return 'replied to your post.'
      case 'friend_accept':
        return 'accepted your friend request.'
      case 'poll_vote':
        return 'voted in your poll.'
      default:
        return 'interacted with you.'
    }
  }

  async function handleAcceptFriend(friendshipId, notifId) {
    setActioningId(notifId)
    await supabase.from('friendships').update({ status: 'accepted' }).eq('id', friendshipId)
    showToast(t('friendAccepted') || 'Friend request accepted')
    setActioningId(null)
    setNotifications((prev) => prev.filter((n) => n.id !== notifId))
  }

  async function handleDeclineFriend(friendshipId, notifId) {
    setActioningId(notifId)
    await supabase.from('friendships').delete().eq('id', friendshipId)
    showToast(t('friendDeclined') || 'Friend request declined')
    setActioningId(null)
    setNotifications((prev) => prev.filter((n) => n.id !== notifId))
  }

  async function handleMarkAllRead() {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
    } catch {
      // Graceful
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    showToast('All notifications marked as read')
  }

  function getIcon(type) {
    switch (type) {
      case 'like':
        return <Heart size={14} className="text-[var(--accent)] fill-[var(--accent)]" />
      case 'comment':
        return <MessageSquare size={14} className="text-[var(--accent)]" />
      case 'friend_request':
        return <UserPlus size={14} className="text-[var(--accent)]" />
      case 'friend_accept':
        return <UserCheck size={14} className="text-[var(--accent-green)]" />
      case 'poll_vote':
        return <Vote size={14} className="text-[var(--accent)]" />
      default:
        return <Bell size={14} className="text-sub" />
    }
  }

  return (
    <AppShell rightSidebar>
      <main className="min-w-0 py-2 lg:max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="mb-1 text-[11px] font-bold font-display uppercase tracking-[0.18em] text-sub">
              Activity
            </p>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-[var(--text-main)]">
              Notifications
            </h1>
          </div>
          {notifications.some((n) => !n.is_read) && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 field px-3.5 py-1.5 rounded-full text-xs font-semibold text-sub hover:text-[var(--text-main)] hover:border-[var(--accent)] scale-tap transition cursor-pointer"
            >
              <Check size={13} />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="glass rounded-2xl p-4 flex items-center gap-3 animate-pulse border border-[var(--card-border)]"
              >
                <div className="w-10 h-10 rounded-full bg-[var(--card-border)]" />
                <div className="flex-1 space-y-2">
                  <div className="w-36 h-3.5 rounded bg-[var(--card-border)]" />
                  <div className="w-24 h-3 rounded bg-[var(--card-border)]" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)]">
            <div className="w-12 h-12 rounded-2xl accent-soft-bg flex items-center justify-center mx-auto mb-3 text-[var(--accent)]">
              <Sparkles size={22} />
            </div>
            <p className="font-display font-bold text-[var(--text-main)] text-sm">You&apos;re all caught up!</p>
            <p className="mt-1 text-xs text-sub max-w-xs mx-auto font-body">
              No new notifications right now. Activity from your trusted circle will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((item) => {
              const actor = item.actor || {}
              const actorPath = actor.username ? `/${actor.username}` : `/${actor.id || ''}`
              const avatar =
                actor.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(
                  actor.display_name || 'U'
                )}&background=00AFA0&color=fff`

              return (
                <div
                  key={item.id}
                  className={`glass rounded-2xl p-4 flex items-center gap-3 transition border border-[var(--card-border)] ${
                    !item.is_read ? 'ring-1 ring-[var(--accent)]/30 bg-[var(--accent)]/5' : ''
                  }`}
                >
                  <Link to={actorPath} className="relative shrink-0">
                    <img
                      src={avatar}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                    />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full field flex items-center justify-center bg-[var(--bg)] shadow-xs">
                      {getIcon(item.type)}
                    </span>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs sm:text-sm text-[var(--text-main)] leading-snug">
                      <Link
                        to={actorPath}
                        className="font-bold hover:underline me-1 text-[var(--text-main)]"
                      >
                        {actor.display_name || 'User'}
                      </Link>
                      <span>{item.content}</span>
                    </p>
                    <p className="text-[11px] text-sub mt-0.5 font-display">
                      {formatTimeAgo(item.created_at)}
                    </p>
                  </div>

                  {item.type === 'friend_request' && item.friendship_id && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleAcceptFriend(item.friendship_id, item.id)}
                        disabled={actioningId === item.id}
                        className="accent-bg text-white dark:text-[#070D0C] text-xs font-bold font-display px-3 py-1.5 rounded-full scale-tap transition cursor-pointer disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineFriend(item.friendship_id, item.id)}
                        disabled={actioningId === item.id}
                        className="field text-xs font-semibold px-3 py-1.5 rounded-full text-sub hover:text-[var(--text-main)] scale-tap transition cursor-pointer disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AppShell>
  )
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'just now'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}
