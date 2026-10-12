// src/pages/ChatPage.jsx

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'

import {
  ArrowLeft,
  Check,
  CheckCheck,
  Copy,
  Heart,
  Image,
  Info,
  Mic,
  MicOff,
  Pause,
  Phone,
  Play,
  Send,
  Share2,
  Smile,
  Sparkles,
  Trash2,
  UserX,
  Video,
} from 'lucide-react'

import { supabase, teardownChannel } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'

import {
  ensureUserKeys,
  getSharedKey,
  encryptMessage,
  decryptMessage,
} from '@/lib/e2ee'

import {
  sendTextMessage,
  sendVoiceMessage,
  editMessage,
  deleteForEveryone,
  addReaction,
  saveStoredReaction,
  markMessagesAsSeen,
  fetchMessages,
  subscribeToMessages,
} from '@/services/chatService'

import AppShell from '@/components/AppShell'
import MessagesListPage from '@/pages/MessagesListPage'
import ChatMessage from '@/components/ChatMessage'
import ChatInput from '@/components/ChatInput'
import ForwardModal from '@/components/ForwardModal'

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const MESSAGE_MAX_WIDTH = 'max-w-[82%] sm:max-w-[72%]'

const VOICE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function getSupportedAudioMimeType() {
  if (
    typeof MediaRecorder === 'undefined' ||
    typeof MediaRecorder.isTypeSupported !== 'function'
  ) {
    return ''
  }

  for (const type of VOICE_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }

  return ''
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  const chunkSize = 0x8000

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(
      i,
      Math.min(i + chunkSize, bytes.length)
    )

    binary += String.fromCharCode(...chunk)
  }

  return window.btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  return bytes.buffer
}

function formatMessageTime(value) {
  if (!value) return ''

  try {
    return new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function formatRecordingTime(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)

  return `${minutes}:${(seconds % 60)
    .toString()
    .padStart(2, '0')}`
}

function getAvatarUrl(friend) {
  if (friend?.avatar_url) {
    return friend.avatar_url
  }

  const name =
    friend?.display_name ||
    friend?.username ||
    'Friend'

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name
  )}&background=00AFA0&color=fff`
}

function isSameDay(dateA, dateB) {
  if (!dateA || !dateB) return false

  const a = new Date(dateA)
  const b = new Date(dateB)

  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDateSeparator(value) {
  if (!value) return ''

  const date = new Date(value)

  const today = new Date()

  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  if (isSameDay(date, today)) {
    return 'Today'
  }

  if (isSameDay(date, yesterday)) {
    return 'Yesterday'
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year:
      date.getFullYear() === today.getFullYear()
        ? undefined
        : 'numeric',
  })
}

function getMessageText(msg) {
  if (msg?.deleted_for_everyone) {
    return 'This message was deleted'
  }

  if (msg?.message_type === 'voice') {
    return 'Voice message'
  }

  return msg?.text || ''
}

// -----------------------------------------------------------------------------
// Voice encryption
// -----------------------------------------------------------------------------

async function encryptVoiceBlob(sharedKey, blob) {
  if (!sharedKey) {
    throw new Error('Missing shared encryption key.')
  }

  const arrayBuffer = await blob.arrayBuffer()

  const iv = window.crypto.getRandomValues(
    new Uint8Array(12)
  )

  const ciphertextBuffer =
    await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      sharedKey,
      arrayBuffer
    )

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
  }
}

async function decryptVoiceBlob(
  sharedKey,
  ciphertextBase64,
  ivBase64,
  mimeType
) {
  if (!sharedKey) {
    return null
  }

  try {
    const ciphertext =
      base64ToArrayBuffer(ciphertextBase64)

    const iv =
      base64ToArrayBuffer(ivBase64)

    const decryptedBuffer =
      await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(iv),
        },
        sharedKey,
        ciphertext
      )

    const blob = new Blob(
      [decryptedBuffer],
      {
        type: mimeType || 'audio/webm',
      }
    )

    return URL.createObjectURL(blob)
  } catch (error) {
    console.warn(
      '[E2EE] Voice decryption failed:',
      error
    )

    return null
  }
}

function formatLastSeen(lastSeen, isOnline) {
  if (isOnline) return 'Active now'
  if (!lastSeen) return 'Offline'
  const diffMs = Date.now() - new Date(lastSeen).getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'Active just now'
  if (diffMins < 60) return `Active ${diffMins}m ago`
  if (diffHours <= 7) return `Active ${diffHours}h ago`
  if (diffDays <= 2) return 'Active yesterday'
  return 'Offline'
}

// -----------------------------------------------------------------------------
// Voice player
// -----------------------------------------------------------------------------

function VoicePlayer({ src, isMe }) {
  const audioRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (audioRef.current && src) {
      audioRef.current.load()
    }
  }, [src])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current

    if (!audio) return

    if (audio.paused) {
      audio.load()
      audio.play().catch((err) => {
        console.warn('[VoicePlayer] Play error:', err)
      })
    } else {
      audio.pause()
    }
  }, [])

  const handleSeek = useCallback((event) => {
    const audio = audioRef.current

    if (!audio || !audio.duration) {
      return
    }

    const rect =
      event.currentTarget.getBoundingClientRect()

    const position =
      (event.clientX - rect.left) / rect.width

    audio.currentTime =
      Math.max(
        0,
        Math.min(1, position)
      ) * audio.duration
  }, [])

  function formatTime(seconds) {
    if (
      !seconds ||
      Number.isNaN(seconds) ||
      !Number.isFinite(seconds)
    ) {
      return '0:00'
    }

    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)

    return `${minutes}:${secs
      .toString()
      .padStart(2, '0')}`
  }

  if (!src) {
    return (
      <div className="flex items-center gap-2 text-xs opacity-60 italic">
        <Mic size={13} />
        <span>Voice message unavailable</span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-center gap-3 min-w-[205px] ${
        isMe ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onLoadedMetadata={(event) => {
          const value = event.currentTarget.duration

          if (
            Number.isFinite(value) &&
            value > 0
          ) {
            setDuration(value)
          }
        }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget

          setProgress(
            audio.duration
              ? audio.currentTime / audio.duration
              : 0
          )
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false)
          setProgress(0)
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={
          playing
            ? 'Pause voice message'
            : 'Play voice message'
        }
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 ${
          isMe
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20'
        }`}
      >
        {playing ? (
          <Pause size={15} />
        ) : (
          <Play size={15} className="ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={handleSeek}
          className={`w-full h-6 flex items-center cursor-pointer ${
            isMe
              ? 'hover:opacity-90'
              : 'hover:opacity-80'
          }`}
          aria-label="Seek voice message"
        >
          <div
            className={`w-full h-1.5 rounded-full overflow-hidden ${
              isMe
                ? 'bg-white/25'
                : 'bg-[var(--card-border)]'
            }`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${
                isMe
                  ? 'bg-white'
                  : 'bg-[var(--accent)]'
              }`}
              style={{
                width: `${progress * 100}%`,
              }}
            />
          </div>
        </button>

        <div
          className={`flex items-center gap-1 text-[10px] ${
            isMe
              ? 'text-white/75'
              : 'text-sub'
          }`}
        >
          <Mic size={9} />
          <span>
            {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({
  msg,
  isMe,
  friend,
  user,
  onReaction,
  onReply,
  onForward,
  onDeleteForEveryone,
  activeMenuMsgId,
  setActiveMenuMsgId,
  showAvatar,
}) {
  const lastTapRef = useRef({ time: 0, msgId: null })
  const longPressTimerRef = useRef(null)
  const touchStartXRef = useRef(0)
  const touchCurrentXRef = useRef(0)

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX
    touchCurrentXRef.current = e.touches[0].clientX
    longPressTimerRef.current = window.setTimeout(() => {
      setActiveMenuMsgId(msg.id)
    }, 500)
  }

  const handleTouchMove = (e) => {
    touchCurrentXRef.current = e.touches[0].clientX
    const diff = touchCurrentXRef.current - touchStartXRef.current
    if (Math.abs(diff) > 15 && longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    const diff = touchCurrentXRef.current - touchStartXRef.current
    if (diff > 40) {
      onReply(msg)
    }
  }

  const handleBubbleClick = () => {
    const now = Date.now()
    if (
      lastTapRef.current.msgId === msg.id &&
      now - lastTapRef.current.time < 300
    ) {
      onReaction(msg, '❤️')
      lastTapRef.current = { time: 0, msgId: null }
    } else {
      lastTapRef.current = { time: now, msgId: msg.id }
    }
  }

  const isVoice = msg.message_type === 'voice'
  const reactions = msg.reactions || {}

  return (
    <div
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} group relative my-0.5`}
      onContextMenu={(e) => {
        e.preventDefault()
        setActiveMenuMsgId(msg.id)
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleBubbleClick}
    >
      {/* Single Hover Emoji Trigger Button */}
      <div
        className={`absolute top-1/2 -translate-y-1/2 ${
          isMe ? '-left-9' : '-right-9'
        } opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setActiveMenuMsgId(activeMenuMsgId === msg.id ? null : msg.id)
          }}
          className="w-7 h-7 rounded-full bg-[#262626] border border-[#363636] shadow-md flex items-center justify-center text-xs hover:scale-110 transition-transform text-gray-300 hover:text-white"
          title="React / Options"
        >
          😊
        </button>
      </div>

      {!isMe && showAvatar && friend && (
        <img
          src={getAvatarUrl(friend)}
          alt=""
          className="w-7 h-7 rounded-full object-cover shrink-0 mr-2 self-end mb-1"
        />
      )}

      {!isMe && !showAvatar && (
        <div className="w-7 shrink-0 mr-2" />
      )}

      <div className={MESSAGE_MAX_WIDTH}>
        {msg.is_forwarded && (
          <div className="text-[10px] text-gray-400 mb-1 flex items-center gap-1 opacity-75">
            <Share2 size={10} />
            <span>Forwarded</span>
          </div>
        )}

        <div
          className={`px-4 py-2.5 sm:px-4.5 sm:py-3 rounded-2xl transition-all shadow-sm ${
            msg.deleted_for_everyone
              ? 'bg-[#1a1a1a] text-gray-500 border border-[#262626] italic text-[13px]'
              : isMe
              ? 'bg-[#0095f6] text-white rounded-tr-sm'
              : 'bg-[#262626] text-white rounded-tl-sm'
          }`}
        >
          {msg.reply_to && !msg.deleted_for_everyone && (
            <div className="mb-2 px-3 py-1.5 rounded-xl text-xs bg-black/25 border-l-2 border-white/80 truncate">
              <p className="font-semibold text-[11px] opacity-90">
                {msg.reply_to.sender_id === user?.id ? 'You' : friend?.display_name || 'Friend'}
              </p>
              <p className="truncate opacity-75">{msg.reply_to.text || (msg.reply_to.message_type === 'voice' ? 'Voice message' : 'Encrypted message')}</p>
            </div>
          )}

          {isVoice && !msg.deleted_for_everyone ? (
            <VoicePlayer src={msg.voiceSrc} isMe={isMe} />
          ) : (
            <p
              dir="auto"
              className="text-[14px] sm:text-[15px] leading-[1.55] whitespace-pre-wrap break-words"
            >
              {getMessageText(msg)}
            </p>
          )}

          <div
            className={`text-[9px] mt-1.5 flex items-center gap-1 ${
              isMe ? 'text-white/75 justify-end' : 'text-gray-400 justify-start'
            }`}
          >
            {isVoice && <Mic size={8} className="shrink-0" />}
            {msg.is_edited && <span className="italic opacity-80">(edited)</span>}
            <span>{formatMessageTime(msg.created_at)}</span>

            {/* Seen status with avatar */}
            {isMe &&
              (msg.is_read ? (
                <span className="inline-flex items-center gap-1 ml-1" title="Seen">
                  <CheckCheck size={13} className="text-[#38C4E8]" />
                  {friend && (
                    <img
                      src={getAvatarUrl(friend)}
                      alt=""
                      className="w-3.5 h-3.5 rounded-full object-cover ring-1 ring-white/50"
                    />
                  )}
                </span>
              ) : (
                <CheckCheck size={13} className="opacity-75 ml-1" title="Delivered" />
              ))}
          </div>
        </div>

        {/* Reactions row */}
        {Object.keys(reactions).length > 0 && (
          <div
            className={`flex flex-wrap gap-1 mt-1 ${
              isMe ? 'justify-end' : 'justify-start'
            }`}
          >
            {Object.entries(reactions).map(([emoji, userIds]) => (
              <button
                key={emoji}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onReaction(msg, emoji)
                }}
                className={`px-2 py-0.5 rounded-full text-xs border flex items-center gap-1 shadow-sm transition-transform active:scale-95 ${
                  userIds.includes(user?.id)
                    ? 'bg-[#0095f6]/20 border-[#0095f6] text-white'
                    : 'bg-[#262626] border-[#363636] text-gray-300'
                }`}
              >
                <span>{emoji}</span>
                <span className="text-[10px] font-semibold">{userIds.length}</span>
              </button>
            ))}
          </div>
        )}

        {/* Context Menu Modal */}
        {activeMenuMsgId === msg.id && (
          <div className="absolute z-30 top-full mt-1 bg-[#262626]/95 backdrop-blur-md border border-[#363636] shadow-xl rounded-2xl p-2 min-w-[180px] text-xs space-y-1 text-white">
            <div className="flex items-center justify-around py-1.5 border-b border-[#363636]">
              {['❤️', '😂', '👍', '🔥', '🙏'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReaction(msg, emoji)
                    setActiveMenuMsgId(null)
                  }}
                  className="hover:scale-125 transition-transform text-base p-1"
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                onReply(msg)
                setActiveMenuMsgId(null)
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#363636] flex items-center gap-2 font-medium"
            >
              <Sparkles size={14} className="text-[#0095f6]" /> Reply
            </button>
            <button
              type="button"
              onClick={() => {
                onForward(msg)
                setActiveMenuMsgId(null)
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#363636] flex items-center gap-2 font-medium"
            >
              <Share2 size={14} /> Forward
            </button>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(getMessageText(msg))
                setActiveMenuMsgId(null)
              }}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#363636] flex items-center gap-2 font-medium"
            >
              <Copy size={14} /> Copy text
            </button>
            {isMe && (
              <button
                type="button"
                onClick={() => {
                  onDeleteForEveryone(msg.id)
                  setActiveMenuMsgId(null)
                }}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-500/10 text-red-400 flex items-center gap-2 font-medium"
              >
                <Trash2 size={14} /> Delete for everyone
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveMenuMsgId(null)}
              className="w-full text-center py-1.5 text-gray-400 text-[11px] border-t border-[#363636] mt-1"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Loading skeleton
// -----------------------------------------------------------------------------

function ChatSkeleton({ dark }) {
  return (
    <div className="space-y-5 py-6 animate-pulse">
      <div className="flex justify-end">
        <div className="w-44 h-14 rounded-2xl bg-gray-200 dark:bg-[#262626]" />
      </div>

      <div className="flex justify-start">
        <div className="w-52 h-16 rounded-2xl bg-gray-200 dark:bg-[#262626]" />
      </div>

      <div className="flex justify-end">
        <div className="w-32 h-12 rounded-2xl bg-gray-200 dark:bg-[#262626]" />
      </div>

      <div className="flex justify-start">
        <div className="w-40 h-12 rounded-2xl bg-gray-200 dark:bg-[#262626]" />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main ChatPage
// -----------------------------------------------------------------------------

export default function ChatPage({ isSplitView = false, friendId: propFriendId }) {
  const { friendId: paramFriendId, chatId } = useParams()
  const friendId = propFriendId || paramFriendId || chatId

  const { user } = useAuth()
  const { t, showToast, dark } = useUI()
  const { isOnline } = usePresence()

  const navigate = useNavigate()

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [friend, setFriend] = useState(null)
  const [isFriend, setIsFriend] = useState(null)

  const [messages, setMessages] = useState([])

  const [inputText, setInputText] = useState('')

  const [sharedKey, setSharedKey] = useState(null)

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const [keyError, setKeyError] = useState(null)

  const [recording, setRecording] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)

  const [showScrollButton, setShowScrollButton] =
    useState(false)

  // ---------------------------------------------------------------------------
  // Refs
  // ---------------------------------------------------------------------------

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])

  const recordingTimerRef = useRef(null)

  const voiceMimeTypeRef = useRef('')

  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)

  const messagesRef = useRef([])

  const sharedKeyRef = useRef(null)
  const messageChannelRef = useRef(null)

  const voiceUrlsRef = useRef([])

  const inputRef = useRef(null)

  const shouldStickToBottomRef = useRef(true)

  const [replyingTo, setReplyingTo] = useState(null)
  const [forwardingMsg, setForwardingMsg] = useState(null)
  const [showForwardModal, setShowForwardModal] = useState(false)
  const [showGifModal, setShowGifModal] = useState(false)
  const [showStickerModal, setShowStickerModal] = useState(false)
  const [editingMsgId, setEditingMsgId] = useState(null)
  const [editText, setEditText] = useState('')
  const [activeMenuMsgId, setActiveMenuMsgId] = useState(null)
  const [recentFriends, setRecentFriends] = useState([])

  const [attachments, setAttachments] = useState([])
  const attachmentsRef = useRef([])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((att) => {
        try {
          URL.revokeObjectURL(att.url)
        } catch {}
      })
    }
  }, [])
  const [peerTyping, setPeerTyping] = useState(false)

  const [showReactsBar, setShowReactsBar] = useState({})

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const friendOnline = friendId
    ? isOnline(friendId)
    : false

  // Auto-mark incoming messages and notifications as seen
  useEffect(() => {
    if (!user?.id || !friendId) return
    const markAsSeen = async () => {
      try {
        await supabase
          .from('messages')
          .update({ is_read: true })
          .eq('receiver_id', user.id)
          .eq('sender_id', friendId)
          .eq('is_read', false)

        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .eq('actor_id', friendId)
          .eq('is_read', false)
      } catch (err) {
        console.warn('[CHAT] markAsSeen error:', err)
      }
    }
    markAsSeen()
  }, [user?.id, friendId, messages.length])

  async function handleReaction(msg, emoji) {
    if (!user?.id || !msg?.id) return

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id) return m
        const currentReactions = m.reactions || {}
        const userList = currentReactions[emoji] || []
        const hasReacted = userList.includes(user.id)
        const nextList = hasReacted
          ? userList.filter((id) => id !== user.id)
          : [...userList, user.id]
        const nextReactions = { ...currentReactions }
        if (nextList.length > 0) {
          nextReactions[emoji] = nextList
        } else {
          delete nextReactions[emoji]
        }
        return { ...m, reactions: nextReactions }
      })
    )

    // Broadcast reaction to peer in real time
    try {
      messageChannelRef.current?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { msgId: msg.id, emoji, userId: user.id },
      })
    } catch (err) {
      console.warn('[CHAT] Broadcast reaction error:', err)
    }

    try {
      await addReaction(msg.id, emoji, user.id)
    } catch (error) {
      console.warn('Reaction backend sync skipped:', error)
    }
  }

  async function handleDeleteForEveryone(msgId) {
    try {
      await deleteForEveryone(msgId, user.id)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      setActiveMenuMsgId(null)
      showToast('Message deleted')
    } catch (error) {
      console.warn('Delete fallback:', error)
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      setActiveMenuMsgId(null)
    }
  }

  async function handleEditMessage(msgId, newText) {
    if (!sharedKey || !newText.trim()) return

    try {
      await editMessage(msgId, newText.trim(), sharedKey, user.id)

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId ? { ...m, text: newText.trim(), is_edited: true } : m
        )
      )
      setEditingMsgId(null)
      setActiveMenuMsgId(null)
    } catch (error) {
      console.error('Edit failed:', error)
      showToast('Failed to edit message')
    }
  }

  // ---------------------------------------------------------------------------
  // Message ref
  // ---------------------------------------------------------------------------

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // ---------------------------------------------------------------------------
  // Scroll helpers
  // ---------------------------------------------------------------------------

  const scrollToBottom = useCallback(
    (behavior = 'smooth') => {
      messagesEndRef.current?.scrollIntoView({
        behavior,
        block: 'end',
      })

      shouldStickToBottomRef.current = true
      setShowScrollButton(false)
    },
    []
  )

  const handleMessagesScroll = useCallback(() => {
    const container =
      messagesContainerRef.current

    if (!container) return

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight

    const nearBottom =
      distanceFromBottom < 100

    shouldStickToBottomRef.current =
      nearBottom

    setShowScrollButton(!nearBottom)
  }, [])

  // ---------------------------------------------------------------------------
  // Auto focus
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!loading && sharedKey) {
      const timeout = window.setTimeout(() => {
        inputRef.current?.focus()
      }, 150)

      return () => {
        window.clearTimeout(timeout)
      }
    }

    return undefined
  }, [loading, sharedKey])

  // ---------------------------------------------------------------------------
  // Encryption key
  // ---------------------------------------------------------------------------

  const loadEncryptionKey = useCallback(
    async (currentUserId, contactId) => {
      try {
        setKeyError(null)

        const privateKey =
          await ensureUserKeys(currentUserId)

        if (!privateKey) {
          throw new Error(
            'Your encryption key could not be created.'
          )
        }

        const {
          data,
          error,
        } = await supabase
          .from('user_keys')
          .select('public_key')
          .eq('user_id', contactId)
          .maybeSingle()

        if (error) {
          console.error(
            '[E2EE] Friend public key query failed:',
            error
          )

          throw new Error(
            `Could not read friend's encryption key: ${error.message}`
          )
        }

        if (!data?.public_key) {
          setSharedKey(null)
          sharedKeyRef.current = null

          setKeyError(
            t('waitingForKeys') ||
              "Waiting for your friend's encryption key…"
          )

          return null
        }

        const derived =
          await getSharedKey(
            currentUserId,
            privateKey,
            data.public_key
          )

        if (!derived) {
          setSharedKey(null)
          sharedKeyRef.current = null

          setKeyError(
            'Could not establish the encrypted connection with this friend.'
          )

          return null
        }

        setSharedKey(derived)
        sharedKeyRef.current = derived
        setKeyError(null)

        return derived
      } catch (error) {
        console.error(
          '[E2EE] Encryption setup failed:',
          error
        )

        setSharedKey(null)
        sharedKeyRef.current = null

        setKeyError(
          error?.message ||
            'Encryption setup failed.'
        )

        return null
      }
    },
    [t]
  )

  // ---------------------------------------------------------------------------
  // Initial chat setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!friendId || !user?.id) {
      return undefined
    }

    let active = true

    let messageChannel = null
    let keyChannel = null

    const currentUserId = user.id
    const currentFriendId = friendId

    async function initChat() {
      setLoading(true)
      setKeyError(null)
      setIsFriend(null)

      setSharedKey(null)
      sharedKeyRef.current = null

      setMessages([])
      messagesRef.current = []

      try {
        // ---------------------------------------------------------------------
        // 1. Friendship
        // ---------------------------------------------------------------------

        const {
          data: areFriendsResult,
          error: friendshipError,
        } = await supabase.rpc('are_friends', {
          user_a: currentUserId,
          user_b: currentFriendId,
        })

        if (!active) return

        if (friendshipError) {
          throw friendshipError
        }

        if (!areFriendsResult) {
          setIsFriend(false)
          setLoading(false)
          return
        }

        setIsFriend(true)

        // ---------------------------------------------------------------------
        // 2. Profile
        // ---------------------------------------------------------------------

        const {
          data: friendProfile,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select(
            'id, username, display_name, avatar_url'
          )
          .eq('id', currentFriendId)
          .maybeSingle()

        if (!active) return

        if (profileError) {
          console.warn(
            '[CHAT] Friend profile error:',
            profileError
          )
        }

        if (friendProfile) {
          setFriend(friendProfile)
        }

        // ---------------------------------------------------------------------
        // 3. Encryption
        // ---------------------------------------------------------------------

        const derivedSharedKey =
          await loadEncryptionKey(
            currentUserId,
            currentFriendId
          )

        if (!active) return

        // ---------------------------------------------------------------------
        // 4. Realtime BEFORE history
        // ---------------------------------------------------------------------

        const peerPair = [currentUserId, currentFriendId].sort().join('-')
        const messageChannelName = `cirvy-chat:${peerPair}`

        messageChannel = supabase.channel(messageChannelName)
        messageChannelRef.current = messageChannel

        messageChannel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${currentUserId}`,
          },
          async (payload) => {
            if (!active) return

            const newMsg = payload?.new

            if (!newMsg) return

            if (
              newMsg.sender_id !==
              currentFriendId
            ) {
              return
            }

            if (
              newMsg.receiver_id !==
              currentUserId
            ) {
              return
            }

            if (
              messagesRef.current.some(
                (message) =>
                  message.id === newMsg.id
              )
            ) {
              return
            }

            const key =
              sharedKeyRef.current

            if (!key) {
              console.warn(
                '[E2EE] Realtime message received without shared key.'
              )

              return
            }

            const isVoice =
              newMsg.message_type === 'voice'

            let decryptedMessage = {
              ...newMsg,
            }

            if (isVoice) {
              let voiceSrc = null

              if (
                newMsg.ciphertext &&
                newMsg.iv
              ) {
                voiceSrc =
                  await decryptVoiceBlob(
                    key,
                    newMsg.ciphertext,
                    newMsg.iv,
                    newMsg.mime_type
                  )

                if (voiceSrc) {
                  voiceUrlsRef.current.push(
                    voiceSrc
                  )
                }
              }

              decryptedMessage.voiceSrc =
                voiceSrc
            } else {
              let text =
                '[Encrypted message]'

              if (
                newMsg.ciphertext &&
                newMsg.iv
              ) {
                try {
                  text =
                    await decryptMessage(
                      key,
                      newMsg.ciphertext,
                      newMsg.iv
                    )
                } catch (error) {
                  console.warn(
                    '[E2EE] Realtime message decryption failed:',
                    error
                  )
                }
              }

              decryptedMessage.text = text
            }

            if (!active) return

            setMessages((prev) => {
              if (
                prev.some(
                  (message) =>
                    message.id === newMsg.id
                )
              ) {
                return prev
              }

              const next = [
                ...prev,
                decryptedMessage,
              ]

              messagesRef.current = next

              return next
            })

            if (
              shouldStickToBottomRef.current
            ) {
              window.setTimeout(() => {
                if (active) {
                  scrollToBottom()
                }
              }, 60)
            }
          }
        )

        messageChannel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `sender_id=eq.${currentUserId}`,
          },
          (payload) => {
            if (!active) return
            const updated = payload?.new
            if (!updated) return
            setMessages((prev) =>
              prev.map((m) =>
                m.id === updated.id
                  ? { ...m, is_read: updated.is_read }
                  : m
              )
            )
          }
        )

        messageChannel.on(
          'broadcast',
          { event: 'reaction' },
          ({ payload }) => {
            if (!active || !payload?.msgId || !payload?.emoji || !payload?.userId) return
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== payload.msgId) return m
                const cur = m.reactions || {}
                const list = cur[payload.emoji] || []
                const has = list.includes(payload.userId)
                const nextList = has
                  ? list.filter((id) => id !== payload.userId)
                  : [...list, payload.userId]
                const next = { ...cur }
                if (nextList.length > 0) next[payload.emoji] = nextList
                else delete next[payload.emoji]
                saveStoredReaction(payload.msgId, next)
                return { ...m, reactions: next }
              })
            )
          }
        )

        messageChannel.subscribe(
          (status, error) => {
            if (status === 'CHANNEL_ERROR') {
              console.error(
                '[CHAT REALTIME] Channel error:',
                error
              )
            }

            if (status === 'TIMED_OUT') {
              console.error(
                '[CHAT REALTIME] Channel timed out:',
                error
              )
            }
          }
        )

        // ---------------------------------------------------------------------
        // 5. History (using chatService for proper reply_to hydration)
        // ---------------------------------------------------------------------

        const rawMessages = await fetchMessages(currentUserId, currentFriendId)

        if (!active) return

        if (rawMessages) {
          const msgMap = new Map(rawMessages.map((m) => [m.id, m]))

          const decryptedList =
            await Promise.all(
              rawMessages.map(async (msg) => {
                if (msg.deleted_for_everyone) {
                  return {
                    ...msg,
                    text: 'This message was deleted',
                  }
                }

                const isVoice =
                  msg.message_type === 'voice'

                let reply_to = null
                if (msg.reply_to_id && msgMap.has(msg.reply_to_id)) {
                  const parent = msgMap.get(msg.reply_to_id)
                  let parentText = parent.message_type === 'voice' ? 'Voice message' : 'Encrypted message'
                  if (parent.ciphertext && parent.iv && derivedSharedKey) {
                    try {
                      parentText = await decryptMessage(derivedSharedKey, parent.ciphertext, parent.iv)
                    } catch {}
                  }
                  reply_to = { ...parent, text: parentText }
                } else if (msg.reply_to) {
                  // Already hydrated by fetchMessages
                  let parentText = msg.reply_to.message_type === 'voice' ? 'Voice message' : 'Encrypted message'
                  if (msg.reply_to.ciphertext && msg.reply_to.iv && derivedSharedKey) {
                    try {
                      parentText = await decryptMessage(derivedSharedKey, msg.reply_to.ciphertext, msg.reply_to.iv)
                    } catch {}
                  }
                  reply_to = { ...msg.reply_to, text: parentText }
                }

                if (isVoice) {
                  let voiceSrc = null

                  if (
                    derivedSharedKey &&
                    msg.ciphertext &&
                    msg.iv
                  ) {
                    voiceSrc =
                      await decryptVoiceBlob(
                        derivedSharedKey,
                        msg.ciphertext,
                        msg.iv,
                        msg.mime_type
                      )

                    if (voiceSrc) {
                      voiceUrlsRef.current.push(
                        voiceSrc
                      )
                    }
                  }

                  return {
                    ...msg,
                    voiceSrc,
                    reply_to,
                  }
                }

                let text =
                  '[Encrypted message]'

                if (
                  derivedSharedKey &&
                  msg.ciphertext &&
                  msg.iv
                ) {
                  try {
                    text =
                      await decryptMessage(
                        derivedSharedKey,
                        msg.ciphertext,
                        msg.iv
                      )
                  } catch (error) {
                    console.warn(
                      '[E2EE] History decryption failed:',
                      error
                    )
                  }
                }

                return {
                  ...msg,
                  text,
                  reply_to,
                }
              })
            )

          if (!active) return

          messagesRef.current =
            decryptedList

          setMessages(
            decryptedList
          )
        }

        if (!active) return

        setLoading(false)

        window.setTimeout(() => {
          if (active) {
            scrollToBottom('auto')
          }
        }, 100)

        // ---------------------------------------------------------------------
        // 6. Friend key realtime
        // ---------------------------------------------------------------------

        const keyChannelName =
          `cirvy-key:${currentUserId}:${currentFriendId}`

        keyChannel =
          supabase.channel(
            keyChannelName
          )

        const refreshFriendKey =
          async () => {
            if (!active) return

            try {
              await loadEncryptionKey(
                currentUserId,
                currentFriendId
              )
            } catch (error) {
              console.error(
                '[E2EE] Failed to refresh friend key:',
                error
              )
            }
          }

        keyChannel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'user_keys',
            filter: `user_id=eq.${currentFriendId}`,
          },
          refreshFriendKey
        )

        keyChannel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'user_keys',
            filter: `user_id=eq.${currentFriendId}`,
          },
          refreshFriendKey
        )

        keyChannel.subscribe()
      } catch (error) {
        console.error(
          '[CHAT] Initialization failed:',
          error
        )

        if (active) {
          setKeyError(
            error?.message ||
              'Could not initialize encrypted chat.'
          )

          setLoading(false)
        }
      }
    }

    initChat()

    return () => {
      active = false

      const msgCh = messageChannel
      const kCh = keyChannel
      messageChannel = null
      keyChannel = null
      void teardownChannel(msgCh)
      void teardownChannel(kCh)
    }
  }, [
    friendId,
    user?.id,
    loadEncryptionKey,
    scrollToBottom,
  ])

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return () => {
      window.clearInterval(
        recordingTimerRef.current
      )

      const recorder =
        mediaRecorderRef.current

      if (
        recorder &&
        recorder.state !== 'inactive'
      ) {
        try {
          recorder.stop()
        } catch {
          // Ignore cleanup errors.
        }
      }

      voiceUrlsRef.current.forEach(
        (url) => {
          try {
            URL.revokeObjectURL(url)
          } catch {
            // Ignore cleanup errors.
          }
        }
      )

      voiceUrlsRef.current = []
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Send text
  // ---------------------------------------------------------------------------

  async function handleSendMessage(event) {
    event?.preventDefault?.()

    const trimmed = inputText.trim()
    const pendingAttachments = [...attachments]

    if (
      (!trimmed && pendingAttachments.length === 0) ||
      !sharedKey ||
      sending ||
      !user ||
      !friendId
    ) {
      return
    }

    setSending(true)

    try {
      const activeReply = replyingTo
      setReplyingTo(null)
      setInputText('')

      if (pendingAttachments.length > 0) {
        // Upload all attachments in order
        const uploadedItems = []
        for (const att of pendingAttachments) {
          const isVideo = att.file.type.startsWith('video/')
          let publicUrl = ''

          try {
            const ext = att.file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg')
            const path = `chat/${user.id}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`
            const { error: uploadErr } = await supabase.storage
              .from('post-media')
              .upload(path, att.file, { cacheControl: '3600', contentType: att.file.type })

            if (!uploadErr) {
              const { data: pubData } = supabase.storage.from('post-media').getPublicUrl(path)
              publicUrl = pubData?.publicUrl || ''
            }
          } catch (err) {
            console.warn('[CHAT] Storage upload error:', err)
          }

          if (!publicUrl) {
            publicUrl = await new Promise((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(reader.result)
              reader.readAsDataURL(att.file)
            })
          }

          if (publicUrl) {
            uploadedItems.push({
              url: publicUrl,
              type: isVideo ? 'video' : 'image',
            })
          } else {
            showToast(`Failed to upload ${att.name || 'file'}`)
          }
        }

        // Revoke preview object URLs now that files are sent
        pendingAttachments.forEach((att) => {
          try {
            URL.revokeObjectURL(att.url)
          } catch {}
        })
        setAttachments([])

        if (uploadedItems.length > 0) {
          const payloadObject = {
            media: uploadedItems[0],
            items: uploadedItems,
            caption: trimmed || '',
          }
          const mediaPayload = JSON.stringify(payloadObject)

          const newRow = await sendTextMessage({
            senderId: user.id,
            receiverId: friendId,
            text: mediaPayload,
            sharedKey,
          })

          if (newRow) {
            setMessages((prev) => {
              if (prev.some((message) => message.id === newRow.id)) return prev
              const next = [
                ...prev,
                {
                  ...newRow,
                  text: mediaPayload,
                  media_url: uploadedItems[0].url,
                  media_type: uploadedItems[0].type,
                  media_items: uploadedItems,
                  reply_to: activeReply,
                },
              ]
              messagesRef.current = next
              return next
            })
            window.setTimeout(() => scrollToBottom(), 40)
          }
        }
      } else {
        // Standard text message
        const newRow = await sendTextMessage({
          senderId: user.id,
          receiverId: friendId,
          text: trimmed,
          sharedKey,
        })

        if (newRow) {
          setMessages((prev) => {
            if (
              prev.some(
                (message) =>
                  message.id === newRow.id
              )
            ) {
              return prev
            }

            const next = [
              ...prev,
              {
                ...newRow,
                text: trimmed,
                reply_to: activeReply,
              },
            ]

            messagesRef.current = next

            return next
          })

          window.setTimeout(() => {
            scrollToBottom()
          }, 40)
        }
      }
    } catch (error) {
      console.error(
        '[CHAT] Send message failed:',
        error
      )

      showToast(
        error?.message ||
          'Failed to send encrypted message.'
      )
    } finally {
      setSending(false)
    }
  }

  const mediaInputRef = useRef(null)

  function handleMediaSelect(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    const currentCount = attachments.length
    if (currentCount >= 10) {
      showToast('Maximum 10 attachments allowed.')
      return
    }

    const slotsAvailable = 10 - currentCount
    if (files.length > slotsAvailable) {
      showToast(`Only up to 10 files can be attached. Extra ${files.length - slotsAvailable} files were omitted.`)
    }

    const selectedFiles = files.slice(0, slotsAvailable)
    const newAttachments = []

    for (const file of selectedFiles) {
      if (file.size > 20 * 1024 * 1024) {
        showToast(`${file.name} exceeds 20 MB limit.`)
        continue
      }
      const isVideo = file.type.startsWith('video/')
      const url = URL.createObjectURL(file)
      newAttachments.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        url,
        type: file.type,
        isVideo,
        name: file.name,
      })
    }

    if (newAttachments.length > 0) {
      setAttachments((prev) => [...prev, ...newAttachments])
    }
  }

  function handleRemoveAttachment(id) {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target?.url) {
        try {
          URL.revokeObjectURL(target.url)
        } catch {}
      }
      return prev.filter((a) => a.id !== id)
    })
  }

  // ---------------------------------------------------------------------------
  // Keyboard behavior
  // ---------------------------------------------------------------------------

  function handleInputKeyDown(event) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent?.isComposing
    ) {
      event.preventDefault()

      if (inputText.trim() || attachments.length > 0) {
        handleSendMessage(event)
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Start recording
  // ---------------------------------------------------------------------------

  async function startRecording() {
    if (
      !sharedKey ||
      recording ||
      sending
    ) {
      return
    }

    if (
      !navigator.mediaDevices?.getUserMedia
    ) {
      showToast(
        'Voice recording is not supported in this browser.'
      )

      return
    }

    if (
      typeof MediaRecorder === 'undefined'
    ) {
      showToast(
        'Audio recording is not supported in this browser.'
      )

      return
    }

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        })

      const mimeType =
        getSupportedAudioMimeType()

      voiceMimeTypeRef.current =
        mimeType

      const recorder =
        new MediaRecorder(
          stream,
          mimeType
            ? { mimeType }
            : undefined
        )

      mediaRecorderRef.current =
        recorder

      audioChunksRef.current = []

      recorder.ondataavailable = (
        event
      ) => {
        if (event.data?.size > 0) {
          audioChunksRef.current.push(
            event.data
          )
        }
      }

      recorder.start(250)

      setRecording(true)
      setRecordingMs(0)

      recordingTimerRef.current =
        window.setInterval(() => {
          setRecordingMs(
            (ms) => ms + 100
          )
        }, 100)
    } catch (error) {
      console.error(
        '[CHAT] Recording error:',
        error
      )

      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError'
      ) {
        showToast(
          'Microphone access denied. Please allow microphone permissions in browser settings.'
        )
      } else {
        showToast(
          `Could not record: ${error.message || 'Microphone error'}`
        )
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stop and send voice
  // ---------------------------------------------------------------------------

  async function stopAndSendVoice() {
    const recorder = mediaRecorderRef.current

    if (
      !recorder ||
      !sharedKey ||
      recorder.state === 'inactive'
    ) {
      return
    }

    window.clearInterval(recordingTimerRef.current)

    setRecording(false)

    await new Promise((resolve) => {
      recorder.onstop = async () => {
        const mimeType = voiceMimeTypeRef.current || 'audio/webm'

        const blob = new Blob(audioChunksRef.current, { type: mimeType })

        recorder.stream.getTracks().forEach((track) => track.stop())

        audioChunksRef.current = []

        if (!blob || blob.size === 0) {
          setRecordingMs(0)
          resolve()
          return
        }

        const tempId = `voice_opt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const localSrc = URL.createObjectURL(blob)
        voiceUrlsRef.current.push(localSrc)

        // Optimistic voice message with loading spinner
        const optimisticVoice = {
          id: tempId,
          sender_id: user.id,
          receiver_id: friendId,
          message_type: 'voice',
          voiceSrc: localSrc,
          is_pending: true,
          error: false,
          blob,
          mimeType,
          created_at: new Date().toISOString(),
          reactions: {},
        }

        setMessages((prev) => {
          const next = [...prev, optimisticVoice]
          messagesRef.current = next
          return next
        })
        window.setTimeout(() => scrollToBottom(), 40)

        setSending(true)

        try {
          const { ciphertext, iv } = await encryptVoiceBlob(sharedKey, blob)

          const newRow = await sendVoiceMessage({
            senderId: user.id,
            receiverId: friendId,
            ciphertext,
            iv,
            mimeType,
          })

          if (newRow) {
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === tempId
                  ? {
                      ...newRow,
                      voiceSrc: localSrc,
                      is_pending: false,
                      error: false,
                    }
                  : m
              )
              messagesRef.current = next
              return next
            })

            window.setTimeout(() => {
              scrollToBottom()
            }, 40)
          }
        } catch (error) {
          console.error(
            '[CHAT] Voice send failed:',
            error
          )

          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === tempId
                ? {
                    ...m,
                    is_pending: false,
                    error: true,
                  }
                : m
            )
            messagesRef.current = next
            return next
          })

          showToast(
            error?.message ||
              'Failed to send voice message.'
          )
        } finally {
          setSending(false)
          setRecordingMs(0)
          resolve()
        }
      }

      try {
        recorder.stop()
      } catch {
        resolve()
      }
    })
  }

  async function handleRetryVoice(msg) {
    if (!msg?.blob || !sharedKey || !user || !friendId) return

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, is_pending: true, error: false } : m
      )
    )

    try {
      const { ciphertext, iv } = await encryptVoiceBlob(sharedKey, msg.blob)
      const newRow = await sendVoiceMessage({
        senderId: user.id,
        receiverId: friendId,
        ciphertext,
        iv,
        mimeType: msg.mimeType || 'audio/webm',
      })

      if (newRow) {
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === msg.id
              ? {
                  ...newRow,
                  voiceSrc: msg.voiceSrc,
                  is_pending: false,
                  error: false,
                }
              : m
          )
          messagesRef.current = next
          return next
        })
      }
    } catch (err) {
      console.error('[CHAT] Retry voice failed:', err)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, is_pending: false, error: true } : m
        )
      )
      showToast('Failed to retry sending voice message.')
    }
  }

  function handleRemoveVoice(msgId) {
    setMessages((prev) => {
      const next = prev.filter((m) => m.id !== msgId)
      messagesRef.current = next
      return next
    })
  }

  // ---------------------------------------------------------------------------
  // Cancel recording
  // ---------------------------------------------------------------------------

  function cancelRecording() {
    window.clearInterval(
      recordingTimerRef.current
    )

    setRecording(false)
    setRecordingMs(0)

    const recorder =
      mediaRecorderRef.current

    if (
      recorder &&
      recorder.state !== 'inactive'
    ) {
      recorder.stream
        .getTracks()
        .forEach((track) =>
          track.stop()
        )

      try {
        recorder.stop()
      } catch {
        // Ignore.
      }
    }

    audioChunksRef.current = []
  }

  // ---------------------------------------------------------------------------
  // Not friends
  // ---------------------------------------------------------------------------

  if (isFriend === false) {
    const notFriendsContent = (
      <main className="min-w-0 min-h-[calc(100vh-6rem)] flex items-center justify-center px-4 bg-[#121212] text-white">
        <div className="bg-[#1a1a1a] border border-[#262626] rounded-3xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
            <UserX size={25} />
          </div>

          <div>
            <h2 className="font-display font-bold text-lg text-white">
              Friends-Only Messaging
            </h2>

            <p className="text-xs text-gray-400 leading-relaxed mt-2">
              Cirvy chats are strictly private.
              You can only exchange end-to-end
              encrypted messages with accepted
              circle friends.
            </p>
          </div>

          <Link
            to="/messages"
            className="inline-flex items-center justify-center bg-[#3797f0] text-white font-display font-bold text-xs px-6 py-3 rounded-full transition-transform active:scale-95 hover:bg-[#3797f0]/90"
          >
            Back to Messages
          </Link>
        </div>
      </main>
    )

    return isSplitView ? notFriendsContent : <AppShell>{notFriendsContent}</AppShell>
  }

// ---------------------------------------------------------------------------
  // Main UI
  // ---------------------------------------------------------------------------

  const chatContent = (
    <div className="h-full w-full bg-[var(--bg)] text-[var(--text-main)] overflow-hidden flex">
      {/* Conversations Sidebar - Only rendered when NOT in split view */}
      {isSplitView ? null : (
        <aside className="w-[350px] md:w-[380px] bg-[var(--card-bg)] border-r border-[var(--card-border)] text-[var(--text-main)] flex flex-col h-full flex-shrink-0 hidden md:flex">
          <MessagesListPage
            isEmbedded
            selectedChatId={friendId}
            onSelectChat={(id) => navigate(`/messages/${id}`)}
          />
        </aside>
      )}

      {/* Active Chat Viewport */}
      <div className="flex-1 flex flex-col h-full bg-[var(--bg)] relative min-w-0">
        {/* Header */}
        <header className="shrink-0 px-4 h-16 border-b border-[var(--card-border)] bg-[var(--card-bg)] flex items-center justify-between z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <Link
              to="/messages"
              className="md:hidden p-1.5 -ml-1 text-sub hover:text-[var(--text-main)] transition-colors cursor-pointer"
              title="Back"
            >
              <ArrowLeft size={20} />
            </Link>

            <Link
              to={friend?.username ? `/${friend.username}` : `/${friend?.id || ''}`}
              className="relative shrink-0 flex items-center gap-3"
            >
              <img
                src={getAvatarUrl(friend)}
                alt=""
                className="w-10 h-10 rounded-full object-cover ring-1 ring-[var(--card-border)]"
              />
              <div className="leading-tight">
                <span className="font-display font-semibold text-sm text-[var(--text-main)] block">
                  {friend?.display_name || friend?.username || 'Friend'}
                </span>
                <span className="text-[11px] text-sub block">
                  {friend?.username ? `@${friend.username}` : ''}
                </span>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-3 text-sub">
            <Link to={friend?.username ? `/${friend.username}` : `/${friend?.id || ''}`} className="p-2 rounded-full hover:bg-[var(--card-border)]/40 hover:text-[var(--text-main)] transition-colors" title="Chat Info">
              <Info size={18} />
            </Link>
          </div>
        </header>

        {/* Messages Stream */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-2 scrollbar-thin bg-[var(--bg)]"
        >
          {loading ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            <div className="min-h-full flex items-center justify-center">
              <div className="text-center px-5 py-12 max-w-sm">
                <div className="w-14 h-14 rounded-2xl accent-soft-bg text-[var(--accent)] flex items-center justify-center mx-auto mb-4 border border-[var(--accent)]/30">
                  <Sparkles size={24} />
                </div>
                <h3 className="font-display font-bold text-base text-[var(--text-main)]">
                  Start an encrypted conversation
                </h3>
                <p className="text-xs text-sub leading-relaxed mt-2 font-body">
                  Your messages are end-to-end encrypted before leaving your device.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, index) => {
                const isMe = msg.sender_id === user?.id
                const previousMessage = messages[index - 1]
                const showDate =
                  index === 0 ||
                  !isSameDay(previousMessage?.created_at, msg.created_at)

                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex items-center justify-center py-4">
                        <span className="px-3 py-1 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] text-[10px] font-medium text-sub">
                          {formatDateSeparator(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <ChatMessage
                      msg={{ ...msg, showAvatar: true }}
                      isMe={isMe}
                      friend={friend}
                      user={user}
                      isFriendOnline={friendOnline}
                      currentUserId={user?.id}
                      onReaction={handleReaction}
                      onReply={(m) => setReplyingTo(m)}
                      onForward={(m) => {
                        setForwardingMsg(m)
                        setShowForwardModal(true)
                      }}
                      onDeleteForEveryone={handleDeleteForEveryone}
                      onRetryVoice={handleRetryVoice}
                      onRemoveVoice={handleRemoveVoice}
                      activeMenuMsgId={activeMenuMsgId}
                      setActiveMenuMsgId={setActiveMenuMsgId}
                      showReactsBar={showReactsBar[msg.id] || false}
                      setShowReactsBar={(val) => {
                        setShowReactsBar(prev => ({ ...prev, [msg.id]: val }))
                      }}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <div ref={messagesEndRef} className="h-1" />
        </div>

        {/* Footer / Input Capsule */}
        <footer className="shrink-0 pt-2 pb-3 px-4 bg-[var(--card-bg)] border-t border-[var(--card-border)]">
          {/* Hidden File Input for Media Uploads */}
          <input
            type="file"
            ref={mediaInputRef}
            onChange={handleMediaSelect}
            accept="image/*,video/*"
            className="hidden"
            multiple
          />

          {replyingTo && (
            <div className="px-4 py-2 bg-[var(--bg)] border border-[var(--card-border)] rounded-2xl mb-2 flex items-center justify-between text-xs shadow-sm text-[var(--text-main)]">
              <div className="flex items-center gap-2 truncate">
                <span className="w-1 h-6 rounded-full accent-bg shrink-0" />
                <div className="truncate">
                  <p className="font-semibold text-[var(--text-main)]">
                    Replying to {replyingTo.sender_id === user?.id ? 'yourself' : friend?.display_name || 'friend'}
                  </p>
                  <p className="text-sub truncate">{getMessageText(replyingTo)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="w-6 h-6 rounded-full hover:bg-[var(--card-border)]/50 text-sub flex items-center justify-center shrink-0 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          <ChatInput
            inputText={inputText}
            setInputText={setInputText}
            handleSendMessage={handleSendMessage}
            handleInputKeyDown={handleInputKeyDown}
            startRecording={startRecording}
            cancelRecording={cancelRecording}
            stopAndSendVoice={stopAndSendVoice}
            recording={recording}
            recordingMs={recordingMs}
            sending={sending}
            loading={loading}
            sharedKey={sharedKey}
            onImageClick={() => mediaInputRef.current?.click()}
            onHeartClick={() => {
              setInputText('❤️')
              inputRef.current?.focus()
            }}
            inputRef={inputRef}
            attachments={attachments}
            onRemoveAttachment={handleRemoveAttachment}
            onAddAttachmentClick={() => mediaInputRef.current?.click()}
          />
        </footer>

        <ForwardModal
          isOpen={showForwardModal}
          onClose={() => {
            setShowForwardModal(false)
            setForwardingMsg(null)
          }}
          forwardingMsg={forwardingMsg}
          currentUserId={user?.id}
        />
      </div>
    </div>
  )

  return isSplitView ? chatContent : <AppShell>{chatContent}</AppShell>
}