import { useState, useEffect } from 'react'
import { Search, X, Send, Share2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ensureUserKeys, getSharedKey, encryptMessage } from '@/lib/e2ee'
import { useUI } from '@/contexts/UIContext'

function getAvatarUrl(friend) {
  if (friend?.avatar_url) return friend.avatar_url
  const name = friend?.display_name || friend?.username || 'Friend'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00AFA0&color=fff`
}

export default function ForwardModal({
  isOpen,
  onClose,
  forwardingMsg,
  currentUserId,
}) {
  const { showToast } = useUI()
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sendingId, setSendingId] = useState(null)

  useEffect(() => {
    if (!isOpen || !currentUserId) return

    let active = true
    async function loadFriends() {
      setLoading(true)
      try {
        const { data: friendships } = await supabase
          .from('friendships')
          .select('requester_id, addressee_id')
          .or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`)
          .eq('status', 'accepted')

        const friendIds = (friendships || []).map((f) =>
          f.requester_id === currentUserId ? f.addressee_id : f.requester_id
        )

        if (friendIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .in('id', friendIds)

          if (active) setFriends(profiles || [])
        } else {
          if (active) setFriends([])
        }
      } catch (err) {
        console.warn('[FORWARD] Failed to load friends:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadFriends()
    return () => { active = false }
  }, [isOpen, currentUserId])

  if (!isOpen) return null

  const filtered = friends.filter((f) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      (f.display_name && f.display_name.toLowerCase().includes(q)) ||
      (f.username && f.username.toLowerCase().includes(q))
    )
  })

  async function handleForwardTo(targetFriend) {
    if (sendingId || !forwardingMsg) return
    setSendingId(targetFriend.id)

    try {
      const myPrivateKey = await ensureUserKeys(currentUserId)
      if (!myPrivateKey) throw new Error('Encryption key not found.')

      const { data: targetKeyData, error: keyErr } = await supabase
        .from('user_keys')
        .select('public_key')
        .eq('user_id', targetFriend.id)
        .maybeSingle()

      if (keyErr || !targetKeyData?.public_key) {
        throw new Error('This friend has not initialized encryption keys yet.')
      }

      const sharedKey = await getSharedKey(currentUserId, myPrivateKey, targetKeyData.public_key)
      if (!sharedKey) throw new Error('Could not derive encryption key.')

      const text = forwardingMsg.text || (forwardingMsg.message_type === 'voice' ? '[Voice note]' : '')
      const { ciphertext, iv } = await encryptMessage(sharedKey, text)

      const { error: insertErr } = await supabase
        .from('messages')
        .insert({
          sender_id: currentUserId,
          receiver_id: targetFriend.id,
          ciphertext,
          iv,
          message_type: 'text',
        })

      if (insertErr) throw insertErr

      showToast(`Forwarded to ${targetFriend.display_name || targetFriend.username}`)
      onClose()
    } catch (err) {
      console.error('[FORWARD] Error:', err)
      showToast(err.message || 'Failed to forward message')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in-0 duration-150">
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-[var(--accent)]" />
            <h3 className="font-display font-bold text-sm text-[var(--text-main)]">Forward message</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--card-border)]/50 flex items-center justify-center text-sub hover:text-[var(--text-main)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg)] border border-[var(--card-border)] rounded-2xl">
            <Search size={14} className="text-sub shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search friends…"
              className="bg-transparent border-0 outline-none text-xs text-[var(--text-main)] placeholder:text-sub w-full"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-sub">
              <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-sub py-8">No friends found</p>
          ) : (
            filtered.map((friend) => (
              <div
                key={friend.id}
                className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-[var(--card-border)]/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src={getAvatarUrl(friend)}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--text-main)] truncate">
                      {friend.display_name || friend.username}
                    </p>
                    <p className="text-[10px] text-sub truncate">@{friend.username}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleForwardTo(friend)}
                  disabled={sendingId === friend.id}
                  className="accent-bg text-white dark:text-[#070D0C] px-3 py-1.5 rounded-full text-xs font-bold font-display scale-tap transition cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 shrink-0"
                >
                  {sendingId === friend.id ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <>
                      <Send size={11} />
                      <span>Send</span>
                    </>
                  )}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
