import { supabase } from '@/lib/supabase'
import { encryptMessage } from '@/lib/e2ee'

export async function sendTextMessage({ senderId, receiverId, text, sharedKey }) {
  const { ciphertext, iv } = await encryptMessage(sharedKey, text.trim())
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      ciphertext,
      iv,
      message_type: 'text',
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function sendVoiceMessage({ senderId, receiverId, ciphertext, iv, mimeType }) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id: senderId,
      receiver_id: receiverId,
      ciphertext,
      iv,
      message_type: 'voice',
      mime_type: mimeType,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function editMessage(messageId, newContent, sharedKey, userId) {
  const { ciphertext, iv } = await encryptMessage(sharedKey, newContent.trim())
  const { error } = await supabase
    .from('messages')
    .update({ ciphertext, iv })
    .eq('id', messageId)
    .eq('sender_id', userId)

  if (error) throw error
}

export async function deleteForEveryone(messageId, userId) {
  // First attempt database row delete
  const { error: delError } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', userId)

  if (!delError) return true

  // Fallback: tombstone update to clear ciphertext
  const { error: updError } = await supabase
    .from('messages')
    .update({
      ciphertext: 'DELETED',
      iv: 'DELETED',
    })
    .eq('id', messageId)
    .eq('sender_id', userId)

  if (updError) {
    console.warn('[CIRVY CHAT] Message delete restricted by policy:', delError, updError)
  }
  return true
}

export function getStoredReactions(messageId) {
  try {
    const raw = localStorage.getItem(`cirvy_react_${messageId}`)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveStoredReaction(messageId, reactions) {
  try {
    localStorage.setItem(`cirvy_react_${messageId}`, JSON.stringify(reactions))
  } catch {}
}

let isReactionsColumnSupported = null

export async function addReaction(messageId, emoji, userId) {
  // Always update local persistent storage so reactions survive reload
  const currentReactions = getStoredReactions(messageId) || {}
  const userList = currentReactions[emoji] || []
  const hasReacted = userList.includes(userId)

  const updatedList = hasReacted
    ? userList.filter((id) => id !== userId)
    : [...userList, userId]

  const nextReactions = { ...currentReactions }
  if (updatedList.length > 0) {
    nextReactions[emoji] = updatedList
  } else {
    delete nextReactions[emoji]
  }

  saveStoredReaction(messageId, nextReactions)

  // Also attempt Supabase update if the schema supports it
  if (isReactionsColumnSupported !== false) {
    try {
      const { error: updErr } = await supabase
        .from('messages')
        .update({ reactions: nextReactions })
        .eq('id', messageId)

      if (updErr) {
        isReactionsColumnSupported = false
      } else {
        isReactionsColumnSupported = true
      }
    } catch {
      isReactionsColumnSupported = false
    }
  }

  return nextReactions
}

export async function markMessagesAsSeen(userId, friendId) {
  try {
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('receiver_id', userId)
      .eq('sender_id', friendId)
      .eq('is_read', false)
  } catch (err) {
    console.warn('[CIRVY CHAT] markMessagesAsSeen error:', err)
  }
}

export async function fetchMessages(currentUserId, friendId) {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${currentUserId})`)
    .order('created_at', { ascending: true })

  if (error) throw error

  // Merge reactions from database row or persistent storage
  const messages = (data || []).map((msg) => {
    const stored = getStoredReactions(msg.id)
    return {
      ...msg,
      reactions: msg.reactions || stored || {},
    }
  })

  return messages
}

export function subscribeToMessages(currentUserId, friendId, onInsert, onUpdate) {
  const channelName = `cirvy-chat:${currentUserId}:${friendId}`
  const channel = supabase.channel(channelName)

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUserId}` },
    (payload) => {
      if (payload.new?.sender_id === friendId) onInsert(payload.new)
    }
  )

  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'messages', filter: `receiver_id=eq.${currentUserId}` },
    (payload) => {
      if (payload.new?.sender_id === friendId) onUpdate(payload.new)
    }
  )

  channel.subscribe()
  return channel
}