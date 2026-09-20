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
  const isSubscribedRef = useRef(false)

  useEffect(() => {
    if (!user?.id) {
      setOnlineUserIds(new Set())
      return undefined
    }

    const channel = supabase.channel('online-presence', {
      config: {
        presence: {
          key: user.id,
        },
      },
    })
    channelRef.current = channel

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const ids = new Set()
        Object.keys(state).forEach((key) => {
          ids.add(key)
          state[key]?.forEach((item) => {
            if (item.user_id) ids.add(item.user_id)
          })
        })
        setOnlineUserIds(ids)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true
          // Only track if ghost mode is disabled
          if (!ghostMode) {
            await channel.track({
              user_id: user.id,
              online_at: new Date().toISOString(),
            })
          }
        }
      })

    return () => {
      isSubscribedRef.current = false
      channel.untrack().catch(() => {})
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [user?.id])

  // Reactively track or untrack when ghostMode changes
  useEffect(() => {
    if (!user?.id || !channelRef.current || !isSubscribedRef.current) return

    if (ghostMode) {
      channelRef.current.untrack().catch(() => {})
    } else {
      channelRef.current.track({
        user_id: user.id,
        online_at: new Date().toISOString(),
      }).catch(() => {})
    }
  }, [ghostMode, user?.id])

  const isOnline = (userId) => {
    if (!userId) return false
    return onlineUserIds.has(userId)
  }

  return (
    <PresenceContext.Provider value={{ onlineUserIds, isOnline }}>
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  return useContext(PresenceContext)
}
