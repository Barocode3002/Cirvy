import { useState, useEffect } from 'react'
import { Search, X, Send, Share2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ensureUserKeys, getSharedKey, encryptMessage } from '@/lib/e2ee'
import { useUI } from '@/contexts/UIContext'

function getAvatarUrl(friend) {
  if (friend?.avatar_url) return friend.avatar_url
  const name = friend?.display_name || friend?.username || 'Friend'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00AFA0&color=fff`
}

export default function SharePostModal({
  isOpen,
  onClose,
  post,
  currentUserId,
}) {
  const { showToast } = useUI()
  const [friends, setFriends] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sending, setSending] = useState(false)
  const [sendResults, setSendResults] = useState({})

  useEffect(() => {
    if (!isOpen || !currentUserId) return

    let active = true
    async function loadFriends() {
      setLoading(true)
      setSelectedIds(new Set())
      setSendResults({})
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
        console.warn('[SHARE POST] Failed to load friends:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadFriends()
    return () => { active = false }
  }, [isOpen, currentUserId])

  useEffect(() => {
    if (!isOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const filtered = friends.filter((f) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      (f.display_name && f.display_name.toLowerCase().includes(q)) ||
      (f.username && f.username.toLowerCase().includes(q))
    )
  })

  const MAX_RECIPIENTS = 10
  const atCap = selectedIds.size >= MAX_RECIPIENTS

  function toggleSelection(friendId) {
    if (atCap && !selectedIds.has(friendId)) {
      showToast(`Maximum ${MAX_RECIPIENTS} recipients`)
      return
    }
    const newSet = new Set(selectedIds)
    if (newSet.has(friendId)) {
      newSet.delete(friendId)
    } else {
      newSet.add(friendId)
    }
    setSelectedIds(newSet)
    setSendResults((prev) => {
      const next = { ...prev }
      delete next[friendId]
      return next
    })
  }

  function removeChip(friendId) {
    toggleSelection(friendId)
  }

  async function handleSend() {
    if (selectedIds.size === 0 || sending || !post) return
    setSending(true)
    setSendResults({})

    const myPrivateKey = await ensureUserKeys(currentUserId)
    if (!myPrivateKey) {
      showToast('Encryption key not found')
      setSending(false)
      return
    }

    const postPayload = JSON.stringify({ type: 'shared_post', post_id: post.id })

    const results = {}
    let successCount = 0

    for (const friendId of selectedIds) {
      try {
        const { data: targetKeyData, error: keyErr } = await supabase
          .from('user_keys')
          .select('public_key')
          .eq('user_id', friendId)
          .maybeSingle()

        if (keyErr || !targetKeyData?.public_key) {
          results[friendId] = { success: false, error: 'No encryption keys' }
          continue
        }

        const sharedKey = await getSharedKey(currentUserId, myPrivateKey, targetKeyData.public_key)
        if (!sharedKey) {
          results[friendId] = { success: false, error: 'Could not derive key' }
          continue
        }

        const { ciphertext, iv } = await encryptMessage(sharedKey, postPayload)

        const { error: insertErr } = await supabase
          .from('messages')
          .insert({
            sender_id: currentUserId,
            receiver_id: friendId,
            ciphertext,
            iv,
            message_type: 'text',
          })

        if (insertErr) {
          results[friendId] = { success: false, error: insertErr.message }
        } else {
          results[friendId] = { success: true }
          successCount++
        }
      } catch (err) {
        console.error('[SHARE POST] Error sending to', friendId, err)
        results[friendId] = { success: false, error: 'Send failed' }
      }
    }

    setSendResults(results)
    setSending(false)

    if (successCount === selectedIds.size) {
      showToast(`Shared with ${successCount} friend${successCount > 1 ? 's' : ''}`)
      setTimeout(onClose, 500)
    } else if (successCount > 0) {
      showToast(`Shared with ${successCount} of ${selectedIds.size}`)
    } else {
      showToast('Failed to share post')
    }
  }

  const selectedFriends = friends.filter((f) => selectedIds.has(f.id))

  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center p-0 md:p-4">
      <div
        className="modal-backdrop absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="modal-panel relative glass w-full md:w-96 rounded-t-3xl md:rounded-3xl p-4 z-10 border shadow-2xl border-[var(--card-border)] flex flex-col max-h-[85vh]">
        <div className="w-10 h-1 rounded-full bg-[var(--card-border)] mx-auto mb-3 md:hidden" />

        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Share2 size={16} className="text-[var(--accent)]" />
            <h3 className="font-display font-bold text-sm text-[var(--text-main)]">Share post</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-[var(--card-border)]/50 flex items-center justify-center text-sub hover:text-[var(--text-main)] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Selected recipients chips */}
        {selectedFriends.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="text-xs font-semibold text-sub mr-1 self-center">To:</span>
            {selectedFriends.map((f) => (
              <div
                key={f.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent)]/15 border border-[var(--accent)]/30 text-[var(--text-main)] text-xs"
              >
                <span className="font-medium truncate max-w-[100px]">
                  {f.display_name || f.username}
                </span>
                <button
                  type="button"
                  onClick={() => removeChip(f.id)}
                  className="hover:text-red-400 transition-colors cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {atCap && (
              <span className="text-[10px] text-sub self-center">(max {MAX_RECIPIENTS})</span>
            )}
          </div>
        )}

        {/* Search */}
        <div className="mb-3">
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
        <div className="flex-1 overflow-y-auto space-y-1">
          {loading ? (
            <div className="py-8 flex items-center justify-center text-sub">
              <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-sub py-8">No friends found</p>
          ) : (
            filtered.map((friend) => {
              const isSelected = selectedIds.has(friend.id)
              const result = sendResults[friend.id]
              const isDisabled = atCap && !isSelected

              return (
                <div
                  key={friend.id}
                  onClick={() => !isDisabled && toggleSelection(friend.id)}
                  className={`flex items-center justify-between p-2.5 rounded-2xl transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent)]/15 border border-[var(--accent)]/30'
                      : isDisabled
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-[var(--card-border)]/30'
                  }`}
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

                  <div className="flex items-center gap-2 shrink-0">
                    {result?.success === true && (
                      <CheckCircle2 size={16} className="text-green-500" />
                    )}
                    {result?.success === false && (
                      <AlertCircle size={16} className="text-red-400" />
                    )}
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-[var(--accent)] bg-[var(--accent)]'
                          : 'border-sub'
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle2 size={12} className="text-white dark:text-[#070D0C]" />
                      )}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={selectedIds.size === 0 || sending}
          className="w-full accent-bg text-white dark:text-[#070D0C] rounded-full py-3 font-bold font-display text-xs mt-4 scale-tap transition cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {sending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              <span>Sending…</span>
            </>
          ) : (
            <>
              <Send size={14} />
              <span>Send to {selectedIds.size} friend{selectedIds.size !== 1 ? 's' : ''}</span>
            </>
          )}
        </button>
      </div>
    </div>
  )
}
