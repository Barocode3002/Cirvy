import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bell,
  Check,
  Heart,
  MessageSquare,
  UserPlus,
  UserCheck,
  Vote,
  Sparkles,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import AppShell from '@/components/AppShell'

export default function NotificationsPage() {
  const { user } = useAuth()
  const { t, showToast } = useUI()
  const navigate = useNavigate()

  const [notifications, setNotifications] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [actioningId, setActioningId] =
    useState(null)

  useEffect(() => {
    if (!user?.id) {
      setNotifications([])
      setLoading(false)
      return undefined
    }

    let active = true
    let channel = null

    const userId = user.id

    /*
     * IMPORTANT:
     *
     * Create ALL Realtime listeners before subscribe().
     *
     * Also create the channel BEFORE the initial load so
     * notifications cannot be missed during the query.
     */
    channel = supabase
      .channel(`cirvy-notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (!active) return

          const row = payload?.new

          if (!row) return

          console.log(
            '🔔 [CIRVY NOTIFICATION REALTIME] INSERT',
            row
          )

          let actor = null

          if (row.actor_id) {
            const {
              data: actorData,
              error: actorError,
            } = await supabase
              .from('profiles')
              .select(
                'id, username, display_name, avatar_url'
              )
              .eq('id', row.actor_id)
              .maybeSingle()

            if (actorError) {
              console.warn(
                '[CIRVY NOTIFICATIONS] Actor load error:',
                actorError
              )
            }

            actor = actorData || null
          }

          if (!active) return

          const next = {
            id: row.id,
            actor,
            actor_id: row.actor_id,
            entity_id: row.entity_id,
            type: row.type,
            content:
              row.content ||
              defaultContentFor(row.type),
            created_at: row.created_at,
            is_read: row.is_read,
          }

          setNotifications((prev) => {
            if (
              prev.some(
                (item) =>
                  item.id === next.id
              )
            ) {
              return prev
            }

            return [next, ...prev].sort(
              (a, b) =>
                new Date(b.created_at) -
                new Date(a.created_at)
            )
          })
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

          const row = payload?.new

          if (!row) return

          console.log(
            '🔔 [CIRVY NOTIFICATION REALTIME] UPDATE',
            row
          )

          setNotifications((prev) =>
            prev.map((item) =>
              item.id === row.id
                ? {
                    ...item,
                    is_read: row.is_read,
                    content:
                      row.content ||
                      item.content,
                  }
                : item
            )
          )
        }
      )
      .subscribe((status, error) => {
        if (!active) return

        console.log(
          `[CIRVY NOTIFICATIONS REALTIME] ${status}`,
          error || ''
        )

        if (status === 'SUBSCRIBED') {
          console.log(
            '✅ CIRVY notifications realtime connected'
          )
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT'
        ) {
          console.error(
            '❌ CIRVY notifications realtime problem:',
            status,
            error || ''
          )
        }
      })

    loadNotifications(userId, active)

    return () => {
      active = false

      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [user?.id])

  async function loadNotifications(
    userId,
    active = true
  ) {
    if (!userId) return

    if (active) {
      setLoading(true)
    }

    const items = []

    /*
     * -------------------------------------------------------------------------
     * Friend requests
     * -------------------------------------------------------------------------
     */

    try {
      const {
        data: reqData,
        error: reqError,
      } = await supabase
        .from('friendships')
        .select(
          'id, created_at, status, requester_id'
        )
        .eq(
          'addressee_id',
          userId
        )
        .eq(
          'status',
          'pending'
        )
        .order(
          'created_at',
          {
            ascending: false,
          }
        )

      if (reqError) {
        console.warn(
          '[CIRVY NOTIFICATIONS] Friend request query error:',
          reqError
        )
      } else if (reqData?.length) {
        const requesterIds = [
          ...new Set(
            reqData
              .map(
                (item) =>
                  item.requester_id
              )
              .filter(Boolean)
          ),
        ]

        let requesterProfiles = []

        if (requesterIds.length > 0) {
          const {
            data,
            error,
          } = await supabase
            .from('profiles')
            .select(
              'id, username, display_name, avatar_url'
            )
            .in(
              'id',
              requesterIds
            )

          if (error) {
            console.warn(
              '[CIRVY NOTIFICATIONS] Requester profiles error:',
              error
            )
          }

          requesterProfiles = data || []
        }

        const requesterMap = new Map(
          requesterProfiles.map(
            (profile) => [
              profile.id,
              profile,
            ]
          )
        )

        reqData.forEach((req) => {
          const actor =
            requesterMap.get(
              req.requester_id
            ) || null

          items.push({
            id: `friend-req-${req.id}`,
            friendship_id: req.id,
            actor,
            actor_id:
              req.requester_id,
            type: 'friend_request',
            content:
              'sent you a friend request.',
            created_at:
              req.created_at,
            is_read: false,
          })
        })
      }
    } catch (error) {
      console.warn(
        '[CIRVY NOTIFICATIONS] Friend requests failed:',
        error
      )
    }

    /*
     * -------------------------------------------------------------------------
     * Database notifications
     *
     * IMPORTANT:
     *
     * Don't use:
     *
     * actor:actor_id(...)
     *
     * because that embedded relation was returning HTTP 400.
     *
     * Instead:
     * 1. Load notifications.
     * 2. Collect actor IDs.
     * 3. Load profiles separately.
     * -------------------------------------------------------------------------
     */

    try {
      const {
        data: dbNotifications,
        error,
      } = await supabase
        .from('notifications')
        .select(
          'id, type, entity_id, content, is_read, created_at, actor_id'
        )
        .eq(
          'user_id',
          userId
        )
        .order(
          'created_at',
          {
            ascending: false,
          }
        )
        .limit(40)

      if (error) {
        console.warn(
          '[CIRVY NOTIFICATIONS] Notifications query error:',
          error
        )
      } else if (dbNotifications?.length) {
        const actorIds = [
          ...new Set(
            dbNotifications
              .map(
                (item) =>
                  item.actor_id
              )
              .filter(Boolean)
          ),
        ]

        let profiles = []

        if (actorIds.length > 0) {
          const {
            data,
            error: profilesError,
          } = await supabase
            .from('profiles')
            .select(
              'id, username, display_name, avatar_url'
            )
            .in(
              'id',
              actorIds
            )

          if (profilesError) {
            console.warn(
              '[CIRVY NOTIFICATIONS] Actor profiles error:',
              profilesError
            )
          }

          profiles = data || []
        }

        const profileMap = new Map(
          profiles.map((profile) => [
            profile.id,
            profile,
          ])
        )

        dbNotifications.forEach((n) => {
          items.push({
            id: n.id,
            actor:
              profileMap.get(
                n.actor_id
              ) || null,
            actor_id:
              n.actor_id,
            entity_id:
              n.entity_id,
            type: n.type,
            content:
              n.content ||
              defaultContentFor(
                n.type
              ),
            created_at:
              n.created_at,
            is_read:
              n.is_read,
          })
        })
      }
    } catch (error) {
      console.warn(
        '[CIRVY NOTIFICATIONS] Notifications load failed:',
        error
      )
    }

    if (!active) return

    /*
     * Remove duplicate database notification IDs.
     */
    const uniqueMap = new Map()

    for (const item of items) {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item)
      }
    }

    const sortedItems = Array.from(
      uniqueMap.values()
    ).sort(
      (a, b) =>
        new Date(b.created_at) -
        new Date(a.created_at)
    )

    setNotifications(sortedItems)
    setLoading(false)
  }

  function defaultContentFor(type) {
    switch (type) {
      case 'message':
        return 'sent you a message.'

      case 'like':
        return 'liked your post.'

      case 'comment':
        return 'replied to your post.'

      case 'friend_accept':
        return 'accepted your friend request.'

      case 'poll_vote':
        return 'voted in your poll.'

      case 'friend_request':
        return 'sent you a friend request.'

      default:
        return 'interacted with you.'
    }
  }

  async function handleNotificationClick(
    item
  ) {
    if (!user?.id) return

    const isFriendRequest =
      String(item.id).startsWith(
        'friend-req-'
      )

    if (
      item.id &&
      !isFriendRequest
    ) {
      const { error } =
        await supabase
          .from('notifications')
          .update({
            is_read: true,
          })
          .eq(
            'id',
            item.id
          )
          .eq(
            'user_id',
            user.id
          )

      if (error) {
        console.error(
          '[CIRVY NOTIFICATIONS] Mark notification read error:',
          error
        )
      }
    }

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === item.id
          ? {
              ...notification,
              is_read: true,
            }
          : notification
      )
    )

    if (item.type === 'message') {
      const target =
        item.actor_id ||
        item.actor?.id

      if (target) {
        navigate(`/chat/${target}`)
      }
    }
  }

  async function handleAcceptFriend(
    friendshipId,
    notifId
  ) {
    if (!friendshipId) return

    setActioningId(notifId)

    const { error } =
      await supabase
        .from('friendships')
        .update({
          status: 'accepted',
        })
        .eq(
          'id',
          friendshipId
        )

    if (error) {
      console.error(
        'Accept friend error:',
        error
      )

      showToast(
        error.message ||
          'Could not accept friend request'
      )

      setActioningId(null)
      return
    }

    showToast(
      t('friendAccepted') ||
        'Friend request accepted'
    )

    setActioningId(null)

    setNotifications((prev) =>
      prev.filter(
        (n) => n.id !== notifId
      )
    )
  }

  async function handleDeclineFriend(
    friendshipId,
    notifId
  ) {
    if (!friendshipId) return

    setActioningId(notifId)

    const { error } =
      await supabase
        .from('friendships')
        .delete()
        .eq(
          'id',
          friendshipId
        )

    if (error) {
      console.error(
        'Decline friend error:',
        error
      )

      showToast(
        error.message ||
          'Could not decline friend request'
      )

      setActioningId(null)
      return
    }

    showToast(
      t('friendDeclined') ||
        'Friend request declined'
    )

    setActioningId(null)

    setNotifications((prev) =>
      prev.filter(
        (n) => n.id !== notifId
      )
    )
  }

  async function handleMarkAllRead() {
    if (!user?.id) return

    const { error } =
      await supabase
        .from('notifications')
        .update({
          is_read: true,
        })
        .eq(
          'user_id',
          user.id
        )
        .eq(
          'is_read',
          false
        )

    if (error) {
      console.error(
        'Mark all read error:',
        error
      )

      showToast(
        error.message ||
          'Could not mark notifications as read'
      )

      return
    }

    setNotifications((prev) =>
      prev.map((n) => ({
        ...n,
        is_read: true,
      }))
    )

    showToast(
      'All notifications marked as read'
    )
  }

  function getIcon(type) {
    switch (type) {
      case 'message':
        return (
          <MessageSquare
            size={14}
            className="text-[var(--accent)]"
          />
        )

      case 'like':
        return (
          <Heart
            size={14}
            className="text-[var(--accent)] fill-[var(--accent)]"
          />
        )

      case 'comment':
        return (
          <MessageSquare
            size={14}
            className="text-[var(--accent)]"
          />
        )

      case 'friend_request':
        return (
          <UserPlus
            size={14}
            className="text-[var(--accent)]"
          />
        )

      case 'friend_accept':
        return (
          <UserCheck
            size={14}
            className="text-[var(--accent-green)]"
          />
        )

      case 'poll_vote':
        return (
          <Vote
            size={14}
            className="text-[var(--accent)]"
          />
        )

      default:
        return (
          <Bell
            size={14}
            className="text-sub"
          />
        )
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

          {notifications.some(
            (n) => !n.is_read
          ) && (
            <button
              onClick={
                handleMarkAllRead
              }
              className="flex items-center gap-1.5 field px-3.5 py-1.5 rounded-full text-xs font-semibold text-sub hover:text-[var(--text-main)] hover:border-[var(--accent)] scale-tap transition cursor-pointer"
            >
              <Check size={13} />
              <span>
                Mark all read
              </span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(
              (i) => (
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
              )
            )}
          </div>
        ) : notifications.length === 0 ? (
          <div className="glass rounded-3xl p-10 text-center border border-[var(--card-border)]">
            <div className="w-12 h-12 rounded-2xl accent-soft-bg flex items-center justify-center mx-auto mb-3 text-[var(--accent)]">
              <Sparkles size={22} />
            </div>

            <p className="font-display font-bold text-[var(--text-main)] text-sm">
              You&apos;re all caught up!
            </p>

            <p className="mt-1 text-xs text-sub max-w-xs mx-auto font-body">
              No new notifications right
              now. Activity from your
              trusted circle will appear
              here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(
              (item) => {
                const actor =
                  item.actor || {}

                const actorPath =
                  actor.username
                    ? `/${actor.username}`
                    : actor.id
                      ? `/profile/${actor.id}`
                      : '/profile'

                const avatar =
                  actor.avatar_url ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                    actor.display_name ||
                      'U'
                  )}&background=00AFA0&color=fff`

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (
                        item.type ===
                        'message'
                      ) {
                        handleNotificationClick(
                          item
                        )
                      }
                    }}
                    className={`glass rounded-2xl p-4 flex items-center gap-3 transition border border-[var(--card-border)] ${
                      !item.is_read
                        ? 'ring-1 ring-[var(--accent)]/30 bg-[var(--accent)]/5'
                        : ''
                    } ${
                      item.type ===
                      'message'
                        ? 'cursor-pointer hover:border-[var(--accent)]/50'
                        : ''
                    }`}
                  >
                    <Link
                      to={actorPath}
                      onClick={(e) =>
                        e.stopPropagation()
                      }
                      className="relative shrink-0"
                    >
                      <img
                        src={avatar}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover ring-2 ring-[var(--card-border)]"
                      />

                      <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full field flex items-center justify-center bg-[var(--bg)] shadow-xs">
                        {getIcon(
                          item.type
                        )}
                      </span>
                    </Link>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm text-[var(--text-main)] leading-snug">
                        <Link
                          to={actorPath}
                          onClick={(e) =>
                            e.stopPropagation()
                          }
                          className="font-bold hover:underline me-1 text-[var(--text-main)]"
                        >
                          {actor.display_name ||
                            'User'}
                        </Link>

                        <span>
                          {item.content}
                        </span>
                      </p>

                      <p className="text-[11px] text-sub mt-0.5 font-display">
                        {formatTimeAgo(
                          item.created_at
                        )}
                      </p>
                    </div>

                    {item.type ===
                      'friend_request' &&
                      item.friendship_id && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()

                              handleAcceptFriend(
                                item.friendship_id,
                                item.id
                              )
                            }}
                            disabled={
                              actioningId ===
                              item.id
                            }
                            className="accent-bg text-white dark:text-[#070D0C] text-xs font-bold font-display px-3 py-1.5 rounded-full scale-tap transition cursor-pointer disabled:opacity-50"
                          >
                            Accept
                          </button>

                          <button
                            onClick={(e) => {
                              e.stopPropagation()

                              handleDeclineFriend(
                                item.friendship_id,
                                item.id
                              )
                            }}
                            disabled={
                              actioningId ===
                              item.id
                            }
                            className="field text-xs font-semibold px-3 py-1.5 rounded-full text-sub hover:text-[var(--text-main)] scale-tap transition cursor-pointer disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                  </div>
                )
              }
            )}
          </div>
        )}
      </main>
    </AppShell>
  )
}

function formatTimeAgo(dateStr) {
  if (!dateStr) {
    return 'just now'
  }

  const diff =
    Date.now() -
    new Date(dateStr).getTime()

  const mins = Math.floor(
    diff / 60000
  )

  if (mins < 1) {
    return 'just now'
  }

  if (mins < 60) {
    return `${mins}m ago`
  }

  const hrs = Math.floor(
    mins / 60
  )

  if (hrs < 24) {
    return `${hrs}h ago`
  }

  const days = Math.floor(
    hrs / 24
  )

  if (days < 7) {
    return `${days}d ago`
  }

  return new Date(
    dateStr
  ).toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
    }
  )
}