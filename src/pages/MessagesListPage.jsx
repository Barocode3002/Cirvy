import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageCircle,
  Search,
  Loader2,
  ChevronRight,
} from 'lucide-react'

import { supabase, teardownChannel } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import {
  ensureUserKeys,
  getSharedKey,
  decryptMessage,
} from '@/lib/e2ee'
import AppShell from '@/components/AppShell'

function getMessagePreview(decryptedText, messageType, isMe) {
  if (!decryptedText || typeof decryptedText !== 'string') {
    return isMe ? 'You sent a message' : 'Sent you a message'
  }

  try {
    const parsed = JSON.parse(decryptedText)

    if (parsed.type === 'shared_post') {
      return isMe ? 'You sent a post' : 'Sent you a post'
    }

    if (parsed.media) {
      const media = parsed.media
      if (media.type === 'image' || media.type === 'video') {
        const label = media.type === 'image' ? 'photo' : 'video'
        return isMe ? `You sent a ${label}` : `Sent you a ${label}`
      }
    }

    if (parsed.items && Array.isArray(parsed.items) && parsed.items.length > 1) {
      return isMe ? `You sent ${parsed.items.length} attachments` : `Sent you ${parsed.items.length} attachments`
    }

    if (parsed.items && Array.isArray(parsed.items) && parsed.items.length === 1) {
      const item = parsed.items[0]
      if (item.type === 'image') return isMe ? 'You sent a photo' : 'Sent you a photo'
      if (item.type === 'video') return isMe ? 'You sent a video' : 'Sent you a video'
    }
  } catch {
  }

  if (messageType === 'voice') {
    return isMe ? 'You sent a voice message' : 'Sent you a voice message'
  }

  if (messageType === 'text' && decryptedText.startsWith('http')) {
    return isMe ? 'You sent a link' : 'Sent you a link'
  }

  if (decryptedText.length > 50) {
    return decryptedText.slice(0, 50) + '…'
  }

  return decryptedText || (isMe ? 'You sent a message' : 'Sent you a message')
}

export default function MessagesListPage({ isEmbedded = false, selectedChatId = null, onSelectChat = null }) {
  const { user } = useAuth()
  const { dark } = useUI()
  const navigate = useNavigate()

  const [conversations, setConversations] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const userId = user?.id

  const loadConversations = useCallback(async (isInitial = false) => {
    if (!userId) {
      setConversations([])
      setLoading(false)
      return
    }

    try {
      if (isInitial) {
        setLoading(true)
      }

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
          const isMe = message.sender_id === userId

          if (message.reactions && Object.keys(message.reactions).length > 0) {
            const emojis = Object.keys(message.reactions)
            const lastEmoji = emojis[emojis.length - 1]
            preview = `Reacted ${lastEmoji} to your message`
          } else if (message.message_type === 'voice') {
            preview = isMe ? 'You sent a voice message' : 'Sent you a voice message'
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
                const decrypted = await decryptMessage(
                  sharedKey,
                  message.ciphertext,
                  message.iv
                )
                preview = getMessagePreview(decrypted, message.message_type, isMe)
              }
            } catch (error) {
              console.warn(
                '[CIRVY MESSAGES LIST] Could not decrypt preview:',
                error
              )

              preview = isMe ? 'You sent a message' : 'Sent you a message'
            }
          } else {
            preview = isMe ? 'You sent a message' : 'Sent you a message'
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
    if (!userId) {
      setLoading(false)
      return undefined
    }

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
          loadConversations(false)
        }
      }, 300)
    }

    const startFallbackPolling = () => {
      if (!mounted || pollingInterval) return

      pollingInterval = setInterval(() => {
        if (mounted) {
          loadConversations(false)
        }
      }, 5000)
    }

    loadConversations(true).then(() => {
      if (!mounted) return

      try {
        channel = supabase
          .channel(`public:messages:list:${userId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
              filter: `sender_id=eq.${userId}`,
            },
            scheduleReload
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'messages',
              filter: `receiver_id=eq.${userId}`,
            },
            scheduleReload
          )
          .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || err) {
              startFallbackPolling()
            }
          })
      } catch {
        startFallbackPolling()
      }
    })

    return () => {
      mounted = false

      if (reloadTimer) {
        clearTimeout(reloadTimer)
      }

      if (pollingInterval) {
        clearInterval(pollingInterval)
      }

      if (channel) {
        void teardownChannel(channel)
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
    if (onSelectChat) {
      onSelectChat(partnerId)
    } else {
      navigate(`/messages/${partnerId}`)
    }
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

  const content = (
    <div className="min-w-0 w-full h-full flex flex-col bg-[var(--card-bg)] text-[var(--text-main)]">
      <div className="px-4 py-4 border-b border-[var(--card-border)] flex-shrink-0">

        <div className="mb-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-extrabold tracking-tight text-[var(--text-main)]">
              Messages
            </h1>

            <p className="mt-0.5 text-xs text-sub">
              Your conversations
            </p>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full accent-soft-bg text-[var(--accent)] border border-[var(--card-border)]">
            <MessageCircle size={20} />
          </div>
        </div>

        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sub"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search conversations..."
            className="w-full rounded-2xl bg-[var(--bg)] border border-[var(--card-border)] text-[var(--text-main)] placeholder:text-sub py-2.5 pl-10 pr-4 text-xs outline-none transition focus:border-[var(--accent)]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2
              size={24}
              className="animate-spin text-[var(--accent)]"
            />
          </div>
        )}

        {!loading &&
          filteredConversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full accent-soft-bg text-[var(--accent)]">
                <MessageCircle
                  size={24}
                />
              </div>

              <h2 className="text-base font-display font-bold text-[var(--text-main)]">
                {search
                  ? 'No conversations found'
                  : 'No messages yet'}
              </h2>

              <p className="mt-1 max-w-xs text-xs text-sub font-body">
                {search
                  ? 'Try another name or username.'
                  : 'Start a conversation with one of your friends.'}
              </p>
            </div>
          )}

        {!loading &&
          filteredConversations.length > 0 && (
            <div className="space-y-1 px-2.5 py-3">
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

                  const isActive = selectedChatId === conversation.partnerId

                  return (
                    <button
                      key={conversation.partnerId}
                      type="button"
                      onClick={() =>
                        openChat(
                          conversation.partnerId
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.99] cursor-pointer ${
                        isActive
                          ? 'border border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm'
                          : 'border border-transparent hover:bg-[var(--card-border)]/40'
                      }`}
                    >
                      <div className="relative shrink-0">
                        {profile?.avatar_url ? (
                          <img
                            src={profile.avatar_url}
                            alt={displayName}
                            className="h-11 w-11 rounded-full object-cover ring-1 ring-[var(--card-border)]"
                          />
                        ) : (
                          <div className="flex h-11 w-11 items-center justify-center rounded-full accent-soft-bg text-sm font-bold font-display text-[var(--accent)]">
                            {displayName
                              .charAt(0)
                              .toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="truncate font-display font-semibold text-xs text-[var(--text-main)]">
                              {displayName}
                            </h3>

                            {username && (
                              <p className="truncate text-[11px] text-sub">
                                {username}
                              </p>
                            )}
                          </div>

                          <span className="shrink-0 text-[10px] text-sub">
                            {formatTime(
                              conversation.created_at
                            )}
                          </span>
                        </div>

                        <p className="mt-1 truncate text-xs text-sub font-body">
                          {conversation.preview}
                        </p>
                      </div>

                      <ChevronRight
                        size={18}
                        className="shrink-0 opacity-30 text-gray-400 dark:text-gray-500"
                      />
                    </button>
                  )
                }
              )}
            </div>
          )}
      </div>
    </div>
  )

  if (isEmbedded) {
    return content
  }

  return <AppShell>{content}</AppShell>
}
