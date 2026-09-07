import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const PresenceContext = createContext({
  onlineUserIds: new Set(),
  isOnline: () => false,
})

export function PresenceProvider({ children }) {
  const { user } = useAuth()
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set())

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
          await channel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      channel.untrack().then(() => {
        supabase.removeChannel(channel)
      }).catch(() => {
        supabase.removeChannel(channel)
      })
    }
  }, [user?.id])

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
