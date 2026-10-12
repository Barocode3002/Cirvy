import { useRef, useState, useEffect } from 'react'
import { Check, CheckCheck, Copy, Share2, Trash2, Mic, Play, Pause, Smile, Reply, Loader2, AlertCircle, Layers } from 'lucide-react'
import { useUI } from '@/contexts/UIContext'
import MediaViewerModal from './MediaViewerModal'
import SharedPostCard from './SharedPostCard'

function getAvatarUrl(friend) {
  if (friend?.avatar_url) {
    return friend.avatar_url
  }
  const name = friend?.display_name || friend?.username || 'Friend'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00AFA0&color=fff`
}

function formatMessageTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

function getMessageMediaList(msg) {
  if (Array.isArray(msg?.media_items) && msg.media_items.length > 0) {
    return msg.media_items
  }
  if (typeof msg?.text === 'string' && msg.text.startsWith('{"media":')) {
    try {
      const parsed = JSON.parse(msg.text)
      if (Array.isArray(parsed.items) && parsed.items.length > 0) return parsed.items
      if (parsed.media) return [parsed.media]
    } catch {}
  }
  if (msg?.media_url) return [{ url: msg.media_url, type: msg.media_type || 'image' }]
  return []
}

function getMessageMedia(msg) {
  const list = getMessageMediaList(msg)
  return list[0] || null
}

function getMessageText(msg) {
  if (msg?.deleted_for_everyone) return 'This message was deleted'
  if (msg?.message_type === 'voice') return 'Voice message'
  if (typeof msg?.text === 'string' && msg.text.startsWith('{"media":')) {
    try {
      const parsed = JSON.parse(msg.text)
      if (parsed.caption) return parsed.caption
      return ''
    } catch {}
  }
  if (typeof msg?.text === 'string' && msg.text.startsWith('{"type":"shared_post"')) {
    try {
      const parsed = JSON.parse(msg.text)
      if (parsed.type === 'shared_post') return ''
      return msg.text
    } catch {
      return msg.text
    }
  }
  return msg?.text || ''
}

function getSharedPostId(msg) {
  if (typeof msg?.text === 'string' && msg.text.startsWith('{"type":"shared_post"')) {
    try {
      const parsed = JSON.parse(msg.text)
      if (parsed.type === 'shared_post' && parsed.post_id) return parsed.post_id
    } catch {}
  }
  return null
}

export default function ChatMessage({
  msg,
  isMe,
  friend,
  user,
  isFriendOnline = false,
  onReaction,
  onReply,
  onForward,
  onDeleteForEveryone,
  onRetryVoice,
  onRemoveVoice,
  activeMenuMsgId,
  setActiveMenuMsgId,
  showReactsBar,
  setShowReactsBar,
  currentUserId,
}) {
  const { dark } = useUI()
  const [showViewer, setShowViewer] = useState(false)
  const lastTapRef = useRef({ time: 0, msgId: null })
  const longPressTimerRef = useRef(null)
  const touchStartXRef = useRef(0)
  const touchCurrentXRef = useRef(0)

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX
    touchCurrentXRef.current = e.touches[0].clientX
    longPressTimerRef.current = setTimeout(() => setActiveMenuMsgId(msg.id), 500)
  }

  const handleTouchMove = (e) => {
    touchCurrentXRef.current = e.touches[0].clientX
    const diff = touchCurrentXRef.current - touchStartXRef.current
    if (Math.abs(diff) > 15 && longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    const diff = touchCurrentXRef.current - touchStartXRef.current
    if (diff > 40) onReply(msg)
  }

  const handleBubbleClick = () => {
    const now = Date.now()
    if (lastTapRef.current.msgId === msg.id && now - lastTapRef.current.time < 300) {
      onReaction(msg, '❤️')
      lastTapRef.current = { time: 0, msgId: null }
    } else {
      lastTapRef.current = { time: now, msgId: msg.id }
    }
  }

  const isVoice = msg.message_type === 'voice'
  const reactions = msg.reactions || {}
  const mediaList = getMessageMediaList(msg)
  const sharedPostId = getSharedPostId(msg)

  return (
    <div
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative my-0.5`}
      onContextMenu={(e) => { e.preventDefault(); setActiveMenuMsgId(msg.id) }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleBubbleClick}
    >
      {!isMe && msg.showAvatar && friend && (
        <img src={getAvatarUrl(friend)} alt="" className="w-7 h-7 rounded-full object-cover shrink-0 mr-2 self-end mb-1" />
      )}
      {!isMe && !msg.showAvatar && <div className="w-7 shrink-0 mr-2" />}

      <div className="max-w-[82%] sm:max-w-[72%] relative">
        {msg.is_forwarded && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1 opacity-75">
            <Share2 size={10} />
            <span>Forwarded</span>
          </div>
        )}

        {/* Reaction Trigger Button */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 ${isMe ? '-left-8' : '-right-8'} opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20`}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowReactsBar(!showReactsBar) }}
            className="w-7 h-7 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] shadow-md flex items-center justify-center text-xs hover:scale-110 transition-transform text-sub hover:text-[var(--text-main)] cursor-pointer"
            title="React"
          >
            <Smile size={15} />
          </button>
        </div>

        {/* Floating Reactions Bar */}
        {showReactsBar && (
          <div
            className={`absolute bottom-full mb-2 ${isMe ? 'right-0' : 'left-0'} flex items-center gap-1 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-full px-2 py-1.5 shadow-xl z-30 animate-in fade-in-0 zoom-in-95 duration-150`}
          >
            {['❤️', '😂', '😲', '😢', '🔥', '👍'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => { e.stopPropagation(); onReaction(msg, emoji); setShowReactsBar(false) }}
                className="w-8 h-8 rounded-full flex items-center justify-center text-base hover:bg-[var(--card-border)]/40 transition-colors active:scale-95 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className={`px-4 py-2.5 sm:px-4.5 sm:py-3 rounded-2xl transition-all shadow-sm ${
            msg.deleted_for_everyone
              ? 'bg-[var(--card-bg)] text-sub border border-[var(--card-border)] italic text-[13px]'
              : isMe
              ? 'accent-bg text-white dark:text-[#070D0C] rounded-tr-sm'
              : 'bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-main)] rounded-tl-sm'
          }`}
        >
          {msg.reply_to && !msg.deleted_for_everyone && (
            <div className="mb-2 px-3 py-1.5 rounded-xl text-xs bg-black/10 dark:bg-white/10 border-l-2 border-black/20 dark:border-white/20 truncate">
              <p className="font-semibold text-[11px] opacity-90">
                {msg.reply_to.sender_id === user?.id ? 'You' : friend?.display_name || 'Friend'}
              </p>
              <p className="truncate opacity-75">
                {msg.reply_to.text || (msg.reply_to.message_type === 'voice' ? 'Voice message' : 'Encrypted message')}
              </p>
            </div>
          )}

          {/* Render media attachments (image/video) - single or stacked */}
          {(() => {
            if (!mediaList.length || msg.deleted_for_everyone) return null

            if (mediaList.length === 1) {
              const media = mediaList[0]
              const isVideo = media.type === 'video' || media.url?.match(/\.(mp4|webm|mov)(\?.*)?$/i)
              return (
                <div
                  className="mb-2 cursor-pointer rounded-xl overflow-hidden"
                  onClick={(e) => { e.stopPropagation(); setShowViewer(true) }}
                >
                  {isVideo ? (
                    <video src={media.url} controls className="max-h-64 rounded-xl object-cover w-full" />
                  ) : (
                    <img src={media.url} alt="Attached" className="max-h-64 rounded-xl object-cover w-full hover:opacity-95 transition-opacity" />
                  )}
                </div>
              )
            }

            // Stacked "playing cards" layout for multiple items
            const topItem = mediaList[0]
            const secondItem = mediaList[1]
            const thirdItem = mediaList[2]
            const extraCount = mediaList.length - 1

            return (
              <div
                className="relative cursor-pointer group w-56 h-40 mb-3 pt-2 pl-2 select-none"
                onClick={(e) => { e.stopPropagation(); setShowViewer(true) }}
                title="Click to view all media items"
              >
                {/* 3rd background card (if >= 3 items) */}
                {thirdItem && (
                  <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-3 rounded-2xl overflow-hidden bg-black/40 border border-white/20 shadow-sm opacity-60">
                    <img src={thirdItem.url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* 2nd background card */}
                {secondItem && (
                  <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rotate-1.5 rounded-2xl overflow-hidden bg-black/30 border border-white/30 shadow-md opacity-85">
                    <img src={secondItem.url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}

                {/* Top card */}
                <div className="relative w-full h-full rounded-2xl overflow-hidden border border-[var(--card-border)] shadow-lg group-hover:scale-[1.02] transition-transform">
                  {topItem.type === 'video' ? (
                    <div className="relative w-full h-full">
                      <video src={topItem.url} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center">
                          <Play size={14} className="ml-0.5 fill-current" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <img src={topItem.url} alt="" className="w-full h-full object-cover" />
                  )}

                  {/* Badge for extra items */}
                  <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[11px] font-bold font-display flex items-center gap-1 shadow-md">
                    <Layers size={12} className="text-[var(--accent)]" />
                    <span>+{extraCount}</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Render shared post card */}
          {sharedPostId && !msg.deleted_for_everyone && (
            <div className="mb-2">
              <SharedPostCard
                postId={sharedPostId}
                currentUserId={currentUserId}
                isSender={isMe}
              />
            </div>
          )}

          {isVoice && !msg.deleted_for_everyone ? (
            msg.is_pending ? (
              <div className="flex items-center gap-2.5 py-1.5 px-1 text-xs font-medium">
                <Loader2 size={16} className="animate-spin text-[var(--accent)] shrink-0" />
                <span>Sending voice note…</span>
              </div>
            ) : msg.error ? (
              <div className="space-y-1.5 py-1 px-1">
                <div className="flex items-center gap-1.5 text-xs text-red-400 font-semibold">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>Failed to send voice note</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  {onRetryVoice && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRetryVoice(msg) }}
                      className="font-bold underline hover:opacity-80 cursor-pointer"
                    >
                      Retry
                    </button>
                  )}
                  {onRemoveVoice && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onRemoveVoice(msg.id) }}
                      className="opacity-75 hover:opacity-100 underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <VoicePlayer src={msg.voiceSrc} isMe={isMe} />
            )
          ) : (
            <p dir="auto" className="text-[14px] sm:text-[15px] leading-[1.55] whitespace-pre-wrap break-words">
              {getMessageText(msg)}
            </p>
          )}

          <div className={`text-[9px] mt-1.5 flex items-center gap-1 ${isMe ? 'text-white/75 dark:text-[#070D0C]/75 justify-end' : 'text-sub justify-start'}`}>
            {isVoice && <Mic size={8} className="shrink-0" />}
            {msg.is_edited && <span className="italic opacity-80">(edited)</span>}
            <span>{formatMessageTime(msg.created_at)}</span>

            {isMe && (
              msg.is_pending ? (
                <span className="text-[9px] opacity-75 ml-1 flex items-center gap-1">
                  <Loader2 size={8} className="animate-spin" />
                  <span>Sending…</span>
                </span>
              ) : msg.error ? (
                <span className="text-[9px] text-red-400 ml-1 font-semibold">Failed</span>
              ) : msg.is_read ? (
                <span className="inline-flex items-center gap-1 ml-1" title="Seen">
                  <CheckCheck size={13} className="text-[#38C4E8]" />
                  {friend && (
                    <img src={getAvatarUrl(friend)} alt="" className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/50" />
                  )}
                </span>
              ) : isFriendOnline ? (
                <span className="inline-flex items-center ml-1" title="Delivered (recipient online)">
                  <CheckCheck size={13} className="opacity-75" />
                </span>
              ) : (
                <span className="inline-flex items-center ml-1" title="Sent">
                  <Check size={13} className="opacity-75" />
                </span>
              )
            )}
          </div>
        </div>

        {/* Modal for viewing media */}
        <MediaViewerModal
          isOpen={showViewer}
          onClose={() => setShowViewer(false)}
          items={mediaList}
        />

        {/* Reactions row */}
        {Object.keys(reactions).length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
            {Object.entries(reactions).map(([emoji, userIds]) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => { e.stopPropagation(); onReaction(msg, emoji) }}
                className={`px-2 py-0.5 rounded-full text-xs border flex items-center gap-1 shadow-sm transition-transform active:scale-95 cursor-pointer ${
                  userIds.includes(user?.id)
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'bg-[var(--card-bg)] border-[var(--card-border)] text-sub hover:text-[var(--text-main)]'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] font-semibold">{userIds.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Context Menu */}
        {activeMenuMsgId === msg.id && (
          <div className={`absolute z-30 top-full mt-1 ${isMe ? 'right-0' : 'left-0'} bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl rounded-2xl p-2 min-w-[190px] text-xs space-y-1 text-[var(--text-main)] animate-in fade-in-0 zoom-in-95 duration-150`}>
            <div className="flex items-center justify-around py-1.5 border-b border-[var(--card-border)]">
              {['❤️', '😂', '👍', '🔥', '🙏'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onReaction(msg, emoji); setActiveMenuMsgId(null) }}
                  className="hover:scale-125 transition-transform text-base p-1 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { onReply(msg); setActiveMenuMsgId(null) }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--card-border)]/40 flex items-center gap-2 font-medium text-[var(--text-main)] cursor-pointer">
              <Reply size={14} className="text-[var(--accent)]" /> Reply
            </button>
            <button type="button" onClick={() => { onForward(msg); setActiveMenuMsgId(null) }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--card-border)]/40 flex items-center gap-2 font-medium text-[var(--text-main)] cursor-pointer">
              <Share2 size={14} /> Forward
            </button>
            <button type="button" onClick={() => { navigator.clipboard.writeText(getMessageText(msg)); setActiveMenuMsgId(null) }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-[var(--card-border)]/40 flex items-center gap-2 font-medium text-[var(--text-main)] cursor-pointer">
              <Copy size={14} /> Copy text
            </button>
            {isMe && (
              <button type="button" onClick={() => { onDeleteForEveryone(msg.id); setActiveMenuMsgId(null) }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-400 flex items-center gap-2 font-medium cursor-pointer">
                <Trash2 size={14} /> Delete for everyone
              </button>
            )}
            <button type="button" onClick={() => setActiveMenuMsgId(null)} className="w-full text-center py-1.5 text-sub text-[11px] border-t border-[var(--card-border)] mt-1 cursor-pointer">Cancel</button>
          </div>
        )}
      </div>
    </div>
  )
}

function VoicePlayer({ src, isMe }) {
  const { dark } = useUI()
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (audioRef.current && src) {
      audioRef.current.load()
    }
  }, [src])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) { audio.play().catch(console.warn) } else { audio.pause() }
  }

  const handleSeek = (e) => {
    const audio = audioRef.current
    if (!audio || !audio.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const position = (e.clientX - rect.left) / rect.width
    audio.currentTime = Math.max(0, Math.min(1, position)) * audio.duration
  }

  function formatTime(seconds) {
    if (!seconds || Number.isNaN(seconds) || !Number.isFinite(seconds)) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  if (!src) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-60 italic text-sub">
        <Mic size={13} />
        <span>Voice message unavailable</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 min-w-[205px] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
      <audio ref={audioRef} src={src} preload="auto"
        onLoadedMetadata={(e) => { const v = e.currentTarget.duration; if (Number.isFinite(v) && v > 0) setDuration(v) }}
        onTimeUpdate={(e) => { const a = e.currentTarget; setProgress(a.duration ? a.currentTime / a.duration : 0) }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setProgress(0) }} />
      <button type="button" onClick={togglePlay} aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer ${
          isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'accent-soft-bg text-[var(--accent)] hover:opacity-85'
        }`}>
        {playing ? <Pause size={15} className="fill-current" /> : <Play size={15} className="fill-current ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <button type="button" onClick={handleSeek} className={`w-full h-6 flex items-center cursor-pointer ${isMe ? 'hover:opacity-90' : 'hover:opacity-80'}`} aria-label="Seek voice message">
          <div className={`w-full h-1.5 rounded-full overflow-hidden ${isMe ? 'bg-white/25' : 'bg-[var(--card-border)]'}`}>
            <div className={`h-full rounded-full transition-[width] duration-100 ${isMe ? 'bg-white' : 'accent-bg'}`} style={{ width: `${progress * 100}%` }} />
          </div>
        </button>
        <div className={`flex items-center gap-1 text-[10px] ${isMe ? 'text-white/75 dark:text-[#070D0C]/75' : 'text-sub'}`}>
          <Mic size={9} />
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}