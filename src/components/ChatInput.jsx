import { useRef, useEffect, useState } from 'react'
import { Mic, Image, Heart, Send, Smile, X, Plus } from 'lucide-react'
import { useUI } from '@/contexts/UIContext'

const QUICK_EMOJIS = ['😀', '😂', '😍', '🔥', '👍', '❤️', '🎉', '🙌', '✨', '🥺', '😎', '🙏']

function formatRecordingTime(ms = 0) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
}

export default function ChatInput({
  inputText,
  setInputText,
  handleSendMessage,
  handleInputKeyDown,
  startRecording,
  cancelRecording,
  stopAndSendVoice,
  recording,
  recordingMs = 0,
  sending,
  loading,
  sharedKey,
  disabled,
  onImageClick,
  onHeartClick,
  inputRef,
  attachments = [],
  onRemoveAttachment,
  onAddAttachmentClick,
}) {
  const { dark } = useUI()
  const textareaRef = useRef(null)
  const ref = inputRef || textareaRef
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.min(ref.current.scrollHeight, 112) + 'px'
    }
  }, [inputText, ref])

  function handleSelectEmoji(emoji) {
    setInputText((prev) => prev + emoji)
    setShowEmojiPicker(false)
    ref.current?.focus()
  }

  const hasContentToSend = !!inputText.trim() || attachments.length > 0

  return (
    <div className="relative">
      {/* Floating Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-full left-4 mb-2 bg-[var(--card-bg)] border border-[var(--card-border)] shadow-xl rounded-2xl p-2.5 z-40 animate-in fade-in-0 zoom-in-95 duration-150">
          <div className="grid grid-cols-6 gap-1.5">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleSelectEmoji(emoji)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-lg hover:bg-[var(--card-border)]/40 transition-colors active:scale-95 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Horizontal Multi-file Attachment Tray (max 10) */}
      {attachments.length > 0 && !recording && (
        <div className="mx-4 mb-2 p-2 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl flex items-center gap-2.5 overflow-x-auto shadow-sm">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-black/10 border border-[var(--card-border)] group"
            >
              {att.type?.startsWith('video/') ? (
                <video src={att.url} className="w-full h-full object-cover" />
              ) : (
                <img src={att.url} alt="" className="w-full h-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => onRemoveAttachment?.(att.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
                title="Remove attachment"
              >
                <X size={11} />
              </button>
            </div>
          ))}

          {/* "+" Button if under hard cap (10) */}
          {attachments.length < 10 ? (
            <button
              type="button"
              onClick={onAddAttachmentClick || onImageClick}
              className="shrink-0 w-16 h-16 rounded-xl border border-dashed border-[var(--card-border)] hover:border-[var(--accent)] text-sub hover:text-[var(--accent)] flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer bg-[var(--bg)]/50"
              title="Add more attachments (max 10)"
            >
              <Plus size={18} />
              <span className="text-[9px] font-bold font-display">{attachments.length}/10</span>
            </button>
          ) : (
            <div className="shrink-0 text-[10px] text-amber-500 font-semibold px-2 py-1 font-display">
              Max 10 reached
            </div>
          )}
        </div>
      )}

      {recording ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (stopAndSendVoice) stopAndSendVoice()
          }}
          className="rounded-full bg-[var(--card-bg)] border border-red-500/40 px-4 py-2.5 mx-4 mb-4 flex items-center gap-3 shadow-lg"
        >
          <span className="relative flex items-center justify-center shrink-0">
            <span className="absolute w-4 h-4 rounded-full bg-red-500/20 animate-ping" />
            <span className="relative w-2.5 h-2.5 rounded-full bg-red-500" />
          </span>
          <span className="flex-1 text-xs font-display font-semibold text-red-400">
            Recording… {formatRecordingTime(recordingMs)}
          </span>
          <button
            type="button"
            onClick={cancelRecording}
            className="w-8 h-8 rounded-full accent-soft-bg text-sub hover:text-[var(--text-main)] flex items-center justify-center transition-colors cursor-pointer"
            title="Cancel"
          >
            <X size={16} />
          </button>
          <button
            type="button"
            onClick={stopAndSendVoice}
            disabled={sending}
            className="w-8 h-8 rounded-full accent-bg text-white dark:text-[#070D0C] flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
            title="Send voice note"
          >
            <Send size={15} />
          </button>
        </form>
      ) : (
        <form onSubmit={handleSendMessage} className="rounded-full bg-[var(--card-bg)] border border-[var(--card-border)] px-3.5 py-1.5 mx-4 mb-4 flex items-center gap-2 shadow-lg">
          <button
            type="button"
            onClick={() => setShowEmojiPicker((prev) => !prev)}
            className="text-sub hover:text-[var(--text-main)] transition-colors p-1.5 rounded-full hover:bg-[var(--card-border)]/40 cursor-pointer"
            title="Emoji"
          >
            <Smile size={20} />
          </button>

          <textarea
            ref={ref}
            dir="auto"
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={attachments.length > 0 ? "Add a caption…" : "Message…"}
            disabled={loading || !sharedKey || sending || disabled}
            className="flex-1 min-w-0 max-h-28 resize-none bg-transparent border-0 outline-none text-xs sm:text-sm text-[var(--text-main)] placeholder:text-sub py-1.5 leading-relaxed"
          />

          {!hasContentToSend && sharedKey && (
            <div className="flex items-center gap-0.5 text-sub">
              <button type="button" onClick={startRecording} disabled={sending || loading} className="p-1.5 rounded-full hover:bg-[var(--card-border)]/40 hover:text-[var(--text-main)] transition-colors cursor-pointer" title="Record voice note">
                <Mic size={19} />
              </button>
              <button type="button" onClick={onImageClick} className="p-1.5 rounded-full hover:bg-[var(--card-border)]/40 hover:text-[var(--text-main)] transition-colors cursor-pointer" title="Send photo or video">
                <Image size={19} />
              </button>
              <button type="button" onClick={onHeartClick} className="p-1.5 rounded-full hover:bg-[var(--card-border)]/40 text-red-400 hover:text-red-500 transition-colors cursor-pointer" title="Send heart">
                <Heart size={19} className="fill-current text-red-500" />
              </button>
            </div>
          )}

          {hasContentToSend && (
            <button
              type="submit"
              disabled={sending || !sharedKey || disabled}
              className="accent-bg text-white dark:text-[#070D0C] font-display font-bold text-xs px-3.5 py-1.5 rounded-full transition-opacity disabled:opacity-40 cursor-pointer"
            >
              Send
            </button>
          )}
        </form>
      )}
    </div>
  )
}