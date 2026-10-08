import React, { createContext, useContext, useState, useCallback, useRef } from 'react'

const DataCacheContext = createContext()

export const useDataCache = () => {
  const context = useContext(DataCacheContext)
  if (!context) {
    throw new Error('useDataCache must be used within a DataCacheProvider')
  }
  return context
}

export const DataCacheProvider = ({ children }) => {
  const [posts, setPosts] = useState([])
  const [profiles, setProfiles] = useState(new Map()) // userId -> profile
  const [conversations, setConversations] = useState([])
  
  const lastFetched = useRef({
    posts: 0,
    conversations: 0
  })

  const CACHE_TTL = 30000 // 30 seconds

  const updatePosts = useCallback((newPosts) => {
    setPosts(newPosts)
    lastFetched.current.posts = Date.now()
  }, [])

  const updateProfiles = useCallback((newProfiles) => {
    setProfiles(prev => {
      const next = new Map(prev)
      newProfiles.forEach(p => next.set(p.id, p))
      return next
    })
  }, [])

  const updateConversations = useCallback((newConvs) => {
    setConversations(newConvs)
    lastFetched.current.conversations = Date.now()
  }, [])

  const optimisticDeletePost = useCallback((postId) => {
    setPosts(prev => prev.filter(p => p.id !== postId))
  }, [])

  const optimisticUpdatePost = useCallback((postId, updates) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, ...updates } : p))
  }, [])

  const isPostsFresh = useCallback(() => {
    return Date.now() - lastFetched.current.posts < CACHE_TTL && posts.length > 0
  }, [posts.length])

  const isConversationsFresh = useCallback(() => {
    return Date.now() - lastFetched.current.conversations < CACHE_TTL && conversations.length > 0
  }, [conversations.length])

  const value = {
    posts,
    profiles,
    conversations,
    updatePosts,
    updateProfiles,
    updateConversations,
    optimisticDeletePost,
    optimisticUpdatePost,
    isPostsFresh,
    isConversationsFresh
  }

  return (
    <DataCacheContext.Provider value={value}>
      {children}
    </DataCacheContext.Provider>
  )
}
