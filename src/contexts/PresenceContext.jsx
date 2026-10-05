import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'

const PresenceContext = createContext({
  onlineUserIds: new Set(),
  isOnline: () => false,
})

export function PresenceProvider({ children }) {
  const { user } = useAuth()
  const { ghostMode } = useUI()

  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set())

  const channelRef = useRef(null)
  const subscribedRef = useRef(false)
  const ghostModeRef = useRef(ghostMode)
  const userIdRef = useRef(null)

  // Keep the latest ghostMode available without recreating the channel.
  useEffect(() => {
    ghostModeRef.current = ghostMode

    const channel = channelRef.current

    if (!channel || !subscribedRef.current || !user?.id) {
      return
    }

    if (ghostMode) {
      channel.untrack().catch(() => {})
    } else {
      channel
        .track({
          user_id: user.id,
          online_at: new Date().toISOString(),
        })
        .catch(() => {})
    }
  }, [ghostMode, user?.id])

  useEffect(() => {
    if (!user?.id) {
      userIdRef.current = null
      subscribedRef.current = false
      setOnlineUserIds(new Set())

      if (channelRef.current) {
        const oldChannel = channelRef.current
        channelRef.current = null

        oldChannel.untrack().catch(() => {})
        supabase.removeChannel(oldChannel)
      }

      return undefined
    }

    const userId = user.id
    userIdRef.current = userId
    let active = true

    // Clean up any previous channel first.
    if (channelRef.current) {
      const oldChannel = channelRef.current
      channelRef.current = null
      subscribedRef.current = false

      oldChannel.untrack().catch(() => {})
      supabase.removeChannel(oldChannel)
    }

    setOnlineUserIds(new Set())

    const channel = supabase.channel('cirvy-online-presence', {
      config: {
        presence: {
          key: userId,
        },
      },
    })

    channelRef.current = channel

    channel.on('presence', { event: 'sync' }, () => {
      if (!active) return

      const state = channel.presenceState()
      const ids = new Set()

      Object.entries(state).forEach(([key, entries]) => {
        // Presence key itself.
        if (key) {
          ids.add(key)
        }

        // Extra user_id stored in the tracked payload.
        if (Array.isArray(entries)) {
          entries.forEach((entry) => {
            if (entry?.user_id) {
              ids.add(entry.user_id)
            }
          })
        }
      })

      setOnlineUserIds(ids)
    })

    channel.on('presence', { event: 'join' }, () => {
      if (!active) return

      const state = channel.presenceState()
      const ids = new Set()

      Object.entries(state).forEach(([key, entries]) => {
        if (key) ids.add(key)

        if (Array.isArray(entries)) {
          entries.forEach((entry) => {
            if (entry?.user_id) {
              ids.add(entry.user_id)
            }
          })
        }
      })

      setOnlineUserIds(ids)
    })

    channel.on('presence', { event: 'leave' }, () => {
      if (!active) return

      const state = channel.presenceState()
      const ids = new Set()

      Object.entries(state).forEach(([key, entries]) => {
        if (key) ids.add(key)

        if (Array.isArray(entries)) {
          entries.forEach((entry) => {
            if (entry?.user_id) {
              ids.add(entry.user_id)
            }
          })
        }
      })

      setOnlineUserIds(ids)
    })

    channel.subscribe(async (status) => {
      if (!active) return

      if (status === 'SUBSCRIBED') {
        subscribedRef.current = true

        if (!ghostModeRef.current) {
          try {
            await channel.track({
              user_id: userId,
              online_at: new Date().toISOString(),
            })
          } catch (error) {
            console.error('Presence track error:', error)
          }
        }
      }

      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        subscribedRef.current = false
      }
    })

    return () => {
      active = false

      if (userIdRef.current === userId) {
        subscribedRef.current = false
      }

      channel.untrack().catch(() => {})

      if (channelRef.current === channel) {
        channelRef.current = null
      }

      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const isOnline = (userId) => {
    if (!userId) return false
    return onlineUserIds.has(userId)
  }

  return (
    <PresenceContext.Provider
      value={{
        onlineUserIds,
        isOnline,
      }}
    >
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  return useContext(PresenceContext)
}