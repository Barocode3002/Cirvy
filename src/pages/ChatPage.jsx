// src/pages/ChatPage.jsx

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'

import {
  ArrowDown,
  ArrowLeft,
  Lock,
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  UserX,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useUI } from '@/contexts/UIContext'
import { usePresence } from '@/contexts/PresenceContext'

import {
  ensureUserKeys,
  getSharedKey,
  encryptMessage,
  decryptMessage,
} from '@/lib/e2ee'

import AppShell from '@/components/AppShell'

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

// -----------------------------------------------------------------------------
// Voice player
// -----------------------------------------------------------------------------

function VoicePlayer({ src, isMe }) {
  const audioRef = useRef(null)

  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)

  const togglePlay = useCallback(() => {
    const audio = audioRef.current

    if (!audio) return

    if (audio.paused) {
      audio.play().catch(() => {})
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
        preload="metadata"
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

// -----------------------------------------------------------------------------
// Loading skeleton
// -----------------------------------------------------------------------------

function ChatSkeleton() {
  return (
    <div className="space-y-5 py-6 animate-pulse">
      <div className="flex justify-end">
        <div className="w-44 h-14 rounded-2xl bg-[var(--card-border)]/50" />
      </div>

      <div className="flex justify-start">
        <div className="w-52 h-16 rounded-2xl bg-[var(--card-border)]/50" />
      </div>

      <div className="flex justify-end">
        <div className="w-32 h-12 rounded-2xl bg-[var(--card-border)]/50" />
      </div>

      <div className="flex justify-start">
        <div className="w-40 h-12 rounded-2xl bg-[var(--card-border)]/50" />
      </div>
    </div>
  )
}

// -----------------------------------------------------------------------------
// Main ChatPage
// -----------------------------------------------------------------------------

export default function ChatPage() {
  const { friendId } = useParams()

  const { user } = useAuth()
  const { t, showToast } = useUI()
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

  const voiceUrlsRef = useRef([])

  const inputRef = useRef(null)

  const shouldStickToBottomRef = useRef(true)

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const friendOnline = friendId
    ? isOnline(friendId)
    : false

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

        const messageChannelName =
          `cirvy-chat:${currentUserId}:${currentFriendId}`

        messageChannel =
          supabase.channel(
            messageChannelName
          )

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
        // 5. History
        // ---------------------------------------------------------------------

        const {
          data: rawMessages,
          error: messagesError,
        } = await supabase
          .from('messages')
          .select(
            'id, sender_id, receiver_id, ciphertext, iv, created_at, message_type, mime_type'
          )
          .or(
            `and(sender_id.eq.${currentUserId},receiver_id.eq.${currentFriendId}),and(sender_id.eq.${currentFriendId},receiver_id.eq.${currentUserId})`
          )
          .order('created_at', {
            ascending: true,
          })

        if (!active) return

        if (messagesError) {
          throw messagesError
        }

        if (rawMessages) {
          const decryptedList =
            await Promise.all(
              rawMessages.map(async (msg) => {
                const isVoice =
                  msg.message_type === 'voice'

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

      if (messageChannel) {
        supabase.removeChannel(
          messageChannel
        )

        messageChannel = null
      }

      if (keyChannel) {
        supabase.removeChannel(
          keyChannel
        )

        keyChannel = null
      }
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
    event.preventDefault()

    const trimmed =
      inputText.trim()

    if (
      !trimmed ||
      !sharedKey ||
      sending ||
      !user ||
      !friendId
    ) {
      return
    }

    setSending(true)

    try {
      const {
        ciphertext,
        iv,
      } = await encryptMessage(
        sharedKey,
        trimmed
      )

      const {
        data: newRow,
        error,
      } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: friendId,
          ciphertext,
          iv,
          message_type: 'text',
        })
        .select()
        .single()

      if (error) {
        throw error
      }

      setInputText('')

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
            },
          ]

          messagesRef.current = next

          return next
        })

        window.setTimeout(() => {
          scrollToBottom()
        }, 40)
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

      if (inputText.trim()) {
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

      showToast(
        'Microphone access was denied.'
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Stop and send voice
  // ---------------------------------------------------------------------------

  async function stopAndSendVoice() {
    const recorder =
      mediaRecorderRef.current

    if (
      !recorder ||
      !sharedKey ||
      recorder.state === 'inactive'
    ) {
      return
    }

    window.clearInterval(
      recordingTimerRef.current
    )

    setRecording(false)

    await new Promise((resolve) => {
      recorder.onstop = async () => {
        const mimeType =
          voiceMimeTypeRef.current ||
          'audio/webm'

        const blob = new Blob(
          audioChunksRef.current,
          {
            type: mimeType,
          }
        )

        recorder.stream
          .getTracks()
          .forEach((track) =>
            track.stop()
          )

        audioChunksRef.current = []

        if (blob.size < 1000) {
          setRecordingMs(0)
          resolve()
          return
        }

        setSending(true)

        try {
          const {
            ciphertext,
            iv,
          } = await encryptVoiceBlob(
            sharedKey,
            blob
          )

          const localSrc =
            URL.createObjectURL(blob)

          voiceUrlsRef.current.push(
            localSrc
          )

          const {
            data: newRow,
            error,
          } = await supabase
            .from('messages')
            .insert({
              sender_id: user.id,
              receiver_id: friendId,
              ciphertext,
              iv,
              message_type: 'voice',
              mime_type: mimeType,
            })
            .select()
            .single()

          if (error) {
            URL.revokeObjectURL(
              localSrc
            )

            throw error
          }

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
                  voiceSrc: localSrc,
                },
              ]

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
    return (
      <AppShell>
        <main className="min-w-0 min-h-[calc(100vh-6rem)] flex items-center justify-center px-4">
          <div className="glass rounded-3xl p-8 border border-[var(--card-border)] max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
              <UserX size={25} />
            </div>

            <div>
              <h2 className="font-display font-bold text-lg text-[var(--text-main)]">
                Friends-Only Messaging
              </h2>

              <p className="text-xs text-sub leading-relaxed mt-2">
                Cirvy chats are strictly private.
                You can only exchange end-to-end
                encrypted messages with accepted
                circle friends.
              </p>
            </div>

            <Link
              to="/messages"
              className="inline-flex items-center justify-center accent-bg text-white dark:text-[#070D0C] font-display font-bold text-xs px-6 py-3 rounded-full transition-transform active:scale-95"
            >
              Back to Messages
            </Link>
          </div>
        </main>
      </AppShell>
    )
  }

  // ---------------------------------------------------------------------------
  // Main UI
  // ---------------------------------------------------------------------------

  return (
    <AppShell>
      <main className="min-w-0 max-w-3xl mx-auto flex flex-col h-[calc(100dvh-5rem)] md:h-[calc(100vh-4rem)]">

        {/* ------------------------------------------------------------------ */}
        {/* Header */}
        {/* ------------------------------------------------------------------ */}

        <header className="shrink-0 px-2 sm:px-1 py-2 border-b border-[var(--card-border)] bg-[var(--bg)]/90 backdrop-blur-xl">
          <div className="flex items-center gap-3">

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full field flex items-center justify-center text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)]/30 active:scale-95 transition-all shrink-0"
              aria-label="Go back"
            >
              <ArrowLeft size={19} />
            </button>

            <Link
              to={
                friend?.username
                  ? `/${friend.username}`
                  : `/${friend?.id || ''}`
              }
              className="relative shrink-0"
              aria-label="Open profile"
            >
              <img
                src={getAvatarUrl(friend)}
                alt=""
                className="w-11 h-11 rounded-full object-cover ring-2 ring-[var(--card-border)]"
              />

              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-[var(--bg)] ${
                  friendOnline
                    ? 'bg-[#8FBC94]'
                    : 'bg-gray-400'
                }`}
              />
            </Link>

            <div className="min-w-0 flex-1 leading-tight">
              <Link
                to={
                  friend?.username
                    ? `/${friend.username}`
                    : `/${friend?.id || ''}`
                }
                className="font-display font-bold text-[15px] sm:text-base text-[var(--text-main)] hover:underline truncate block"
              >
                {friend?.display_name ||
                  friend?.username ||
                  'Friend'}
              </Link>

              <p className="text-[11px] text-sub flex items-center gap-1.5 mt-1 font-medium">
                <Lock
                  size={10}
                  className="text-[var(--accent)] shrink-0"
                />

                <span>
                  End-to-end encrypted
                </span>

                <span className="opacity-50">
                  ·
                </span>

                <span
                  className={
                    friendOnline
                      ? 'text-[#8FBC94]'
                      : 'text-sub'
                  }
                >
                  {friendOnline
                    ? 'Online'
                    : 'Offline'}
                </span>
              </p>
            </div>
          </div>
        </header>

        {/* ------------------------------------------------------------------ */}
        {/* Encryption banner */}
        {/* ------------------------------------------------------------------ */}

        <div className="shrink-0 px-1 pt-3 pb-1">
          <div className="field rounded-2xl px-3.5 py-3 border border-[var(--card-border)] flex items-start gap-2.5 text-[11px] text-sub bg-[var(--card-bg)]/75">
            <ShieldCheck
              size={17}
              className="text-[var(--accent)] shrink-0 mt-0.5"
            />

            <span className="leading-relaxed">
              Messages and voice notes are
              end-to-end encrypted. Not even
              Cirvy can read them.
            </span>
          </div>

          {keyError && (
            <p className="text-[11px] text-amber-500 mt-1.5 px-1 leading-relaxed">
              {keyError}
            </p>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Messages */}
        {/* ------------------------------------------------------------------ */}

        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 sm:px-1 py-4 scrollbar-thin"
        >
          {loading ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            <div className="min-h-full flex items-center justify-center">
              <div className="text-center px-5 py-12 max-w-sm">
                <div className="w-14 h-14 rounded-2xl accent-soft-bg text-[var(--accent)] flex items-center justify-center mx-auto mb-4">
                  <Sparkles size={24} />
                </div>

                <h3 className="font-display font-bold text-base text-[var(--text-main)]">
                  Start a private conversation
                </h3>

                <p className="text-xs text-sub leading-relaxed mt-2">
                  Your messages are encrypted
                  before they leave your device.
                  Only you and{' '}
                  {friend?.display_name ||
                    'your friend'}{' '}
                  can decrypt them.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, index) => {
                const isMe =
                  msg.sender_id === user?.id

                const isVoice =
                  msg.message_type === 'voice'

                const previousMessage =
                  messages[index - 1]

                const showDate =
                  index === 0 ||
                  !isSameDay(
                    previousMessage?.created_at,
                    msg.created_at
                  )

                return (
                  <div key={msg.id}>
                    {/* Date separator */}

                    {showDate && (
                      <div className="flex items-center justify-center py-4">
                        <span className="px-3 py-1 rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] text-[10px] font-medium text-sub">
                          {formatDateSeparator(
                            msg.created_at
                          )}
                        </span>
                      </div>
                    )}

                    {/* Message */}

                    <div
                      className={`flex ${
                        isMe
                          ? 'justify-end'
                          : 'justify-start'
                      }`}
                    >
                      <div
                        className={`${MESSAGE_MAX_WIDTH} group relative`}
                      >
                        <div
                          className={`px-4 py-2.5 sm:px-4.5 sm:py-3 rounded-[20px] transition-all shadow-sm ${
                            isMe
                              ? 'bg-gradient-to-r from-[#00AFA0] to-[#38C4E8] text-white font-medium rounded-br-[6px]'
                              : 'field bg-[var(--card-bg)] border border-[var(--card-border)] text-[var(--text-main)] rounded-bl-[6px]'
                          }`}
                        >
                          {isVoice ? (
                            <VoicePlayer
                              src={msg.voiceSrc}
                              isMe={isMe}
                            />
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
                              isMe
                                ? 'text-white/75 justify-end'
                                : 'text-sub justify-start'
                            }`}
                          >
                            {isVoice && (
                              <Mic
                                size={8}
                                className="shrink-0"
                              />
                            )}

                            <span>
                              {formatMessageTime(
                                msg.created_at
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div
            ref={messagesEndRef}
            className="h-1"
          />

          {/* Scroll to bottom */}

          {showScrollButton && (
            <button
              type="button"
              onClick={() =>
                scrollToBottom()
              }
              className="sticky bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full field border border-[var(--card-border)] shadow-lg flex items-center justify-center text-sub hover:text-[var(--text-main)] active:scale-95 transition-all z-10"
              aria-label="Scroll to latest messages"
              title="Latest messages"
            >
              <ArrowDown size={16} />
            </button>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Composer */}
        {/* ------------------------------------------------------------------ */}

        <footer className="shrink-0 pt-2 pb-1 px-1">
          {recording ? (
            <div className="field rounded-[24px] border border-red-500/30 p-1.5 pl-4 flex items-center gap-3 bg-[var(--card-bg)] shadow-lg">
              <span className="relative flex items-center justify-center shrink-0">
                <span className="absolute w-4 h-4 rounded-full bg-red-500/20 animate-ping" />

                <span className="relative w-2.5 h-2.5 rounded-full bg-red-500" />
              </span>

              <span className="flex-1 text-sm font-display font-semibold text-red-400">
                Recording…{' '}
                {formatRecordingTime(
                  recordingMs
                )}
              </span>

              <button
                type="button"
                onClick={cancelRecording}
                className="w-10 h-10 rounded-full bg-[var(--card-border)]/40 flex items-center justify-center text-sub hover:text-[var(--text-main)] active:scale-95 transition-all shrink-0"
                aria-label="Cancel recording"
              >
                <MicOff size={17} />
              </button>

              <button
                type="button"
                onClick={
                  stopAndSendVoice
                }
                disabled={sending}
                className="w-10 h-10 rounded-full accent-bg text-white dark:text-[#070D0C] flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 shrink-0"
                aria-label="Send voice message"
              >
                <Send size={17} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={
                handleSendMessage
              }
              className="field rounded-[26px] border border-[var(--card-border)] p-1.5 pl-4 flex items-end gap-2 bg-[var(--card-bg)] shadow-lg"
            >
              <textarea
                ref={inputRef}
                dir="auto"
                rows={1}
                value={inputText}
                onChange={(event) =>
                  setInputText(
                    event.target.value
                  )
                }
                onKeyDown={
                  handleInputKeyDown
                }
                placeholder={
                  friend?.display_name
                    ? `Message ${friend.display_name}…`
                    : 'Write an encrypted message…'
                }
                disabled={
                  loading ||
                  !sharedKey ||
                  sending
                }
                className="flex-1 min-w-0 max-h-28 resize-none bg-transparent border-0 outline-none text-[14px] text-[var(--text-main)] placeholder:text-sub py-2 leading-relaxed"
                style={{
                  scrollbarWidth: 'thin',
                }}
              />

              {!inputText.trim() &&
                sharedKey && (
                  <button
                    type="button"
                    onClick={
                      startRecording
                    }
                    disabled={
                      sending ||
                      loading ||
                      !sharedKey
                    }
                    className="w-10 h-10 rounded-full bg-[var(--card-border)]/40 text-sub hover:text-[var(--text-main)] hover:bg-[var(--card-border)] active:scale-95 flex items-center justify-center transition-all disabled:opacity-40 shrink-0"
                    aria-label="Record voice message"
                    title="Record voice message"
                  >
                    <Mic size={17} />
                  </button>
                )}

              <button
                type="submit"
                disabled={
                  !inputText.trim() ||
                  sending ||
                  !sharedKey
                }
                className="w-10 h-10 rounded-full bg-gradient-to-r from-[#00AFA0] to-[#38C4E8] text-white flex items-center justify-center active:scale-95 transition-all disabled:opacity-35 disabled:cursor-not-allowed shrink-0 shadow-sm"
                aria-label="Send message"
                title="Send message"
              >
                {sending ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send
                    size={17}
                    className="translate-x-[1px]"
                  />
                )}
              </button>
            </form>
          )}

          {!recording && (
            <p className="text-[9px] text-sub text-center mt-1.5 opacity-60">
              Enter to send · Shift + Enter for a new line
            </p>
          )}
        </footer>
      </main>
    </AppShell>
  )
}