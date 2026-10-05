import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  Search,
  Loader2,
  ChevronRight,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  ensureUserKeys,
  getSharedKey,
  decryptMessage,
} from '@/lib/e2ee'
import AppShell from '@/components/AppShell'

export default function MessagesListPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const userId = user?.id

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setConversations([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const [
        { data: sentMessages, error: sentError },
        { data: receivedMessages, error: receivedError },
      ] = await Promise.all([
        supabase
          .from('messages')
          .select(`
            id,
            sender_id,
            receiver_id,
            ciphertext,
            iv,
            created_at,
            message_type,
            mime_type
          `)
          .eq('sender_id', userId)
          .order('created_at', {
            ascending: false,
          }),

        supabase
          .from('messages')
          .select(`
            id,
            sender_id,
            receiver_id,
            ciphertext,
            iv,
            created_at,
            message_type,
            mime_type
          `)
          .eq('receiver_id', userId)
          .order('created_at', {
            ascending: false,
          }),
      ])

      if (sentError) {
        console.error(
          '[CIRVY MESSAGES LIST] Sent messages error:',
          sentError
        )
      }

      if (receivedError) {
        console.error(
          '[CIRVY MESSAGES LIST] Received messages error:',
          receivedError
        )
      }

      if (sentError || receivedError) {
        setConversations([])
        return
      }

      const allMessages = [
        ...(sentMessages || []),
        ...(receivedMessages || []),
      ]

      const latestByPartner = new Map()

      for (const message of allMessages) {
        const partnerId =
          message.sender_id === userId
            ? message.receiver_id
            : message.sender_id

        const existing = latestByPartner.get(partnerId)

        if (
          !existing ||
          new Date(message.created_at).getTime() >
            new Date(existing.created_at).getTime()
        ) {
          latestByPartner.set(partnerId, {
            ...message,
            partnerId,
          })
        }
      }

      const latestMessages = Array.from(
        latestByPartner.values()
      )

      if (latestMessages.length === 0) {
        setConversations([])
        return
      }

      const partnerIds = latestMessages.map(
        (conversation) => conversation.partnerId
      )

      const {
        data: profiles,
        error: profilesError,
      } = await supabase
        .from('profiles')
        .select(`
          id,
          username,
          display_name,
          avatar_url
        `)
        .in('id', partnerIds)

      if (profilesError) {
        console.error(
          '[CIRVY MESSAGES LIST] Profiles error:',
          profilesError
        )
      }

      const {
        data: publicKeys,
        error: keysError,
      } = await supabase
        .from('user_keys')
        .select(`
          user_id,
          public_key
        `)
        .in('user_id', partnerIds)

      if (keysError) {
        console.error(
          '[CIRVY MESSAGES LIST] Public keys error:',
          keysError
        )
      }

      const profileMap = new Map(
        (profiles || []).map((profile) => [
          profile.id,
          profile,
        ])
      )

      const keyMap = new Map(
        (publicKeys || []).map((key) => [
          key.user_id,
          key.public_key,
        ])
      )

      let privateKey = null

      try {
        privateKey = await ensureUserKeys(userId)
      } catch (error) {
        console.error(
          '[CIRVY MESSAGES LIST] Could not ensure local encryption key:',
          error
        )
      }

      const result = await Promise.all(
        latestMessages.map(async (message) => {
          const partnerId = message.partnerId

          const profile = profileMap.get(partnerId)

          const publicKey = keyMap.get(partnerId)

          let preview = 'Encrypted message'

          if (message.message_type === 'voice') {
            preview = '🎤 Voice message'
          } else if (
            privateKey &&
            publicKey &&
            message.ciphertext &&
            message.iv
          ) {
            try {
              const sharedKey = await getSharedKey(
                userId,
                privateKey,
                publicKey
              )

              if (sharedKey) {
                preview = await decryptMessage(
                  sharedKey,
                  message.ciphertext,
                  message.iv
                )
              }
            } catch (error) {
              console.warn(
                '[CIRVY MESSAGES LIST] Could not decrypt preview:',
                error
              )

              preview = 'Encrypted message'
            }
          }

          return {
            ...message,
            partnerId,
            profile:
              profile || {
                id: partnerId,
                username: 'User',
                display_name: 'User',
                avatar_url: null,
              },
            preview,
          }
        })
      )

      result.sort(
        (a, b) =>
          new Date(b.created_at).getTime() -
          new Date(a.created_at).getTime()
      )

      setConversations(result)
    } catch (error) {
      console.error(
        '[CIRVY MESSAGES LIST] Unexpected error:',
        error
      )

      setConversations([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return undefined

    let mounted = true
    let channel = null
    let pollingInterval = null
    let reloadTimer = null

    const scheduleReload = () => {
      if (!mounted) return

      if (reloadTimer) {
        clearTimeout(reloadTimer)
      }

      reloadTimer = setTimeout(() => {
        if (mounted) {
          loadConversations()
        }
      }, 150)
    }

    const startFallbackPolling = () => {
      if (!mounted || pollingInterval) return

      pollingInterval = setInterval(() => {
        if (mounted) {
          loadConversations()
        }
      }, 3000)
    }

    const setupRealtime = async () => {
      channel = supabase.channel(
        `messages-list:${userId}`
      )

      /*
       * IMPORTANT:
       * Every postgres_changes listener is attached
       * BEFORE subscribe().
       */

      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${userId}`,
        },
        (payload) => {
          if (!mounted) return

          console.log(
            '📤 [CIRVY MESSAGES LIST REALTIME] New sent message:',
            payload?.new
          )

          scheduleReload()
        }
      )

      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${userId}`,
        },
        (payload) => {
          if (!mounted) return

          console.log(
            '📩 [CIRVY MESSAGES LIST REALTIME] New received message:',
            payload?.new
          )

          scheduleReload()
        }
      )

      channel.subscribe((status, error) => {
        if (!mounted) return

        console.log(
          '[CIRVY MESSAGES LIST REALTIME]',
          status,
          error || ''
        )

        if (status === 'SUBSCRIBED') {
          console.log(
            '✅ CIRVY messages list realtime connected'
          )

          if (pollingInterval) {
            clearInterval(pollingInterval)
            pollingInterval = null
          }

          return
        }

        if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          console.error(
            '❌ [CIRVY MESSAGES LIST REALTIME] Connection problem:',
            status,
            error || ''
          )

          startFallbackPolling()
        }
      })
    }

    loadConversations()
    setupRealtime()

    return () => {
      mounted = false

      if (reloadTimer) {
        clearTimeout(reloadTimer)
        reloadTimer = null
      }

      if (pollingInterval) {
        clearInterval(pollingInterval)
        pollingInterval = null
      }

      if (channel) {
        console.log(
          '[CIRVY MESSAGES LIST] Cleaning up realtime channel'
        )

        supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [userId, loadConversations])

  const filteredConversations =
    conversations.filter((conversation) => {
      const profile = conversation.profile

      const searchText = search
        .toLowerCase()
        .trim()

      if (!searchText) {
        return true
      }

      return (
        profile?.display_name
          ?.toLowerCase()
          .includes(searchText) ||
        profile?.username
          ?.toLowerCase()
          .includes(searchText)
      )
    })

  const openChat = (partnerId) => {
    navigate(`/chat/${partnerId}`)
  }

  const formatTime = (date) => {
    if (!date) return ''

    const messageDate = new Date(date)

    if (Number.isNaN(messageDate.getTime())) {
      return ''
    }

    const now = new Date()

    const sameDay =
      messageDate.getFullYear() === now.getFullYear() &&
      messageDate.getMonth() === now.getMonth() &&
      messageDate.getDate() === now.getDate()

    if (sameDay) {
      return messageDate.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
      })
    }

    return messageDate.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    })
  }

  if (!userId) {
    return null
  }

  return (
    <AppShell>
      <div className="min-w-0 w-full">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-extrabold tracking-tight text-[var(--text-main)]">
                Messages
              </h1>

              <p className="mt-1 text-sm opacity-60">
                Your conversations
              </p>
            </div>

            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <MessageCircle size={21} />
            </div>
          </div>

          <div className="relative mb-5">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 opacity-50"
            />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search conversations..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none transition focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:focus:border-slate-500"
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2
                size={25}
                className="animate-spin opacity-60"
              />
            </div>
          )}

          {!loading &&
            filteredConversations.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                  <MessageCircle
                    size={28}
                    className="opacity-50"
                  />
                </div>

                <h2 className="text-lg font-semibold">
                  {search
                    ? 'No conversations found'
                    : 'No messages yet'}
                </h2>

                <p className="mt-1 max-w-xs text-sm opacity-60">
                  {search
                    ? 'Try another name or username.'
                    : 'Start a conversation with one of your friends.'}
                </p>
              </div>
            )}

          {!loading &&
            filteredConversations.length > 0 && (
              <div className="space-y-2">
                {filteredConversations.map(
                  (conversation) => {
                    const profile =
                      conversation.profile

                    const displayName =
                      profile?.display_name ||
                      profile?.username ||
                      'User'

                    const username =
                      profile?.username
                        ? `@${profile.username}`
                        : ''

                    return (
                      <button
                        key={conversation.partnerId}
                        type="button"
                        onClick={() =>
                          openChat(
                            conversation.partnerId
                          )
                        }
                        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50 active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
                      >
                        <div className="relative shrink-0">
                          {profile?.avatar_url ? (
                            <img
                              src={profile.avatar_url}
                              alt={displayName}
                              className="h-14 w-14 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold dark:bg-slate-700">
                              {displayName
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="truncate font-semibold">
                                {displayName}
                              </h3>

                              {username && (
                                <p className="truncate text-xs opacity-50">
                                  {username}
                                </p>
                              )}
                            </div>

                            <span className="shrink-0 text-xs opacity-50">
                              {formatTime(
                                conversation.created_at
                              )}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-sm opacity-60">
                            {conversation.preview}
                          </p>
                        </div>

                        <ChevronRight
                          size={18}
                          className="shrink-0 opacity-30"
                        />
                      </button>
                    )
                  }
                )}
              </div>
            )}
        </div>
      </div>
    </AppShell>
  )
}