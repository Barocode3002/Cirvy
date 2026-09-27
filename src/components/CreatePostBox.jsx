import { useEffect, useState } from 'react'
import { Camera, Image, Video, BarChart2, Send, X, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function CreatePostBox({ onCreate, currentUser }) {
  const { user: authUser, profile } = useAuth()
  const activeUser = currentUser || authUser
  const [content, setContent] = useState('')
  const [mediaFile, setMediaFile] = useState(null)
  const [mediaType, setMediaType] = useState(null) // 'image' | 'video'
  const [previewUrl, setPreviewUrl] = useState('')
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [posting, setPosting] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!mediaFile) {
      setPreviewUrl('')
      setMediaType(null)
      return undefined
    }
    const isVid = mediaFile.type.startsWith('video/')
    setMediaType(isVid ? 'video' : 'image')
    const objectUrl = URL.createObjectURL(mediaFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [mediaFile])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      setUploadError('Please select a valid image or video file.')
      return
    }

    if (isVideo && file.size > 30 * 1024 * 1024) {
      setUploadError('Videos must be smaller than 30 MB.')
      return
    }

    if (isImage && file.size > 10 * 1024 * 1024) {
      setUploadError('Images must be smaller than 10 MB.')
      return
    }

    setUploadError('')
    setMediaFile(file)
  }

  function handleAddOption() {
    if (pollOptions.length < 4) {
      setPollOptions((prev) => [...prev, ''])
    }
  }

  function handleRemoveOption(idx) {
    if (pollOptions.length > 2) {
      setPollOptions((prev) => prev.filter((_, i) => i !== idx))
    }
  }

  function handleOptionChange(idx, val) {
    setPollOptions((prev) => {
      const copy = [...prev]
      copy[idx] = val
      return copy
    })
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadMedia() {
    if (!mediaFile || !activeUser?.id) return { imageUrl: null, videoUrl: null }
    const extension = mediaFile.name.split('.').pop()?.toLowerCase() || (mediaType === 'video' ? 'mp4' : 'jpg')
    const path = `${activeUser.id}/${crypto.randomUUID()}.${extension}`

    try {
      const { error } = await supabase.storage.from('post-media').upload(path, mediaFile, {
        cacheControl: '3600',
        contentType: mediaFile.type,
        upsert: false,
      })

      if (error) {
        const dataUrl = await fileToDataUrl(mediaFile)
        return mediaType === 'video'
          ? { imageUrl: null, videoUrl: dataUrl }
          : { imageUrl: dataUrl, videoUrl: null }
      }

      const { data } = supabase.storage.from('post-media').getPublicUrl(path)
      return mediaType === 'video'
        ? { imageUrl: null, videoUrl: data.publicUrl }
        : { imageUrl: data.publicUrl, videoUrl: null }
    } catch {
      const dataUrl = await fileToDataUrl(mediaFile)
      return mediaType === 'video'
        ? { imageUrl: null, videoUrl: dataUrl }
        : { imageUrl: dataUrl, videoUrl: null }
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if ((!content.trim() && !mediaFile && !showPoll) || posting) return

    // If poll is open, validate
    let pollPayload = null
    if (showPoll) {
      if (!pollQuestion.trim()) {
        setUploadError('Please enter a question for your poll.')
        return
      }
      const validOptions = pollOptions.filter((opt) => opt.trim().length > 0)
      if (validOptions.length < 2) {
        setUploadError('Poll must have at least 2 non-empty options.')
        return
      }
      pollPayload = {
        question: pollQuestion.trim(),
        options: validOptions.map((text, index) => ({ id: index, text: text.trim() })),
      }
    }

    setPosting(true)
    setUploadError('')

    try {
      const { imageUrl, videoUrl } = await uploadMedia()
      const success = await onCreate({
        content: content.trim(),
        imageUrl,
        videoUrl,
        poll: pollPayload,
      })

      if (success) {
        setContent('')
        setMediaFile(null)
        setShowPoll(false)
        setPollQuestion('')
        setPollOptions(['', ''])
      }
    } catch {
      setUploadError('Failed to publish post. Please check your network and try again.')
    } finally {
      setPosting(false)
    }
  }

  const avatar =
    profile?.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      profile?.display_name || profile?.username || 'You'
    )}&background=00AFA0&color=fff`

  return (
    <form
      onSubmit={handleSubmit}
      className="glass rounded-3xl p-5 sm:p-6 shadow-glass transition-all border border-[var(--card-border)]"
    >
      <div className="flex gap-3.5">
        <img
          src={avatar}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-[var(--card-border)]"
        />
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Share something with your private circle..."
          rows={3}
          className="min-h-24 flex-1 resize-none bg-transparent pt-1 text-sm leading-6 text-[var(--text-main)] outline-none placeholder:text-sub/60"
        />
      </div>

      {/* Media Preview */}
      {previewUrl && (
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-black/10 max-h-72 flex items-center justify-center">
          {mediaType === 'video' ? (
            <video
              src={previewUrl}
              controls
              playsInline
              className="max-h-72 w-full object-contain"
            />
          ) : (
            <img
              src={previewUrl}
              alt="Post upload preview"
              className="max-h-72 w-full object-contain"
            />
          )}
          <button
            type="button"
            onClick={() => setMediaFile(null)}
            className="absolute top-3 right-3 rounded-full bg-black/60 p-1.5 text-white hover:bg-black/80 transition scale-tap cursor-pointer"
            aria-label="Remove media"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Interactive Poll Creator Card */}
      {showPoll && (
        <div className="mt-4 rounded-2xl field p-4 border border-[var(--accent)]/30 bg-[var(--accent)]/5 transition-all space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-[var(--accent)]" />
              <p className="text-xs font-bold font-display text-[var(--text-main)] uppercase tracking-wider">
                Circle Poll
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPoll(false)
                setPollQuestion('')
                setPollOptions(['', ''])
              }}
              className="text-sub hover:text-[var(--text-main)] p-1 scale-tap cursor-pointer"
              aria-label="Cancel poll"
            >
              <X size={15} />
            </button>
          </div>

          <input
            type="text"
            placeholder="Ask a question..."
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            className="w-full rounded-xl field px-3.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
          />

          <div className="space-y-2">
            {pollOptions.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="w-5 text-[11px] font-display font-semibold text-sub text-center">
                  {idx + 1}.
                </span>
                <input
                  type="text"
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  className="flex-1 rounded-xl field px-3.5 py-2 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
                {pollOptions.length > 2 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(idx)}
                    className="p-1.5 text-sub hover:text-red-500 scale-tap cursor-pointer"
                    aria-label={`Remove option ${idx + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {pollOptions.length < 4 && (
            <button
              type="button"
              onClick={handleAddOption}
              className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline pt-1 cursor-pointer"
            >
              <Plus size={14} />
              <span>Add option ({pollOptions.length}/4)</span>
            </button>
          )}
        </div>
      )}

      {/* Error display */}
      {uploadError && (
        <p
          role="alert"
          className="mt-3 rounded-xl field px-3 py-2 text-xs font-semibold text-red-500 border-red-500/30"
        >
          {uploadError}
        </p>
      )}

      {/* Attachment Toolbar & Submit */}
      <div className="mt-5 flex flex-col gap-3 border-t border-[var(--card-border)] pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Image Upload */}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full field px-3.5 text-xs font-semibold text-[var(--text-main)] transition hover:border-[var(--accent)] scale-tap">
            <Image size={15} className="accent-text" />
            <span>Image</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {/* Video Upload */}
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full field px-3.5 text-xs font-semibold text-[var(--text-main)] transition hover:border-[var(--accent)] scale-tap">
            <Video size={15} className="text-[var(--accent-green)]" />
            <span>Video</span>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>

          {/* Poll Toggle */}
          <button
            type="button"
            onClick={() => setShowPoll(!showPoll)}
            className={`inline-flex h-9 items-center gap-2 rounded-full field px-3.5 text-xs font-semibold transition scale-tap cursor-pointer ${showPoll
                ? 'border-[var(--accent)] text-[var(--text-main)] bg-[var(--accent)]/10'
                : 'text-sub hover:text-[var(--text-main)] hover:border-[var(--accent)]'
              }`}
          >
            <BarChart2 size={15} />
            <span>Poll</span>
          </button>

          <span className="hidden items-center gap-1 text-[11px] text-sub lg:inline-flex ms-2">
            <Camera size={13} />
            <span>Gallery or camera</span>
          </span>
        </div>

        <button
          type="submit"
          disabled={(!content.trim() && !mediaFile && !showPoll) || posting}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full accent-bg px-6 text-xs font-bold font-display text-white dark:text-[#070D0C] transition scale-tap disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-sm"
        >
          <Send size={14} />
          <span>{posting ? 'Posting...' : 'Post to Circle'}</span>
        </button>
      </div>
    </form>
  )
}