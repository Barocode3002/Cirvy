import { useEffect, useState } from 'react'
import { Camera, Image, Send, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function CreatePostBox({ onCreate, currentUser }) {
  const [content, setContent] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [posting, setPosting] = useState(false)
  const [uploadError, setUploadError] = useState('')

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl('')
      return undefined
    }
    const objectUrl = URL.createObjectURL(imageFile)
    setPreviewUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [imageFile])

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setUploadError('Choose an image file to attach.')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setUploadError('Images must be smaller than 6 MB.')
      return
    }
    setUploadError('')
    setImageFile(file)
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  async function uploadImage() {
    if (!imageFile) return null
    const extension = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`
    const { error } = await supabase.storage.from('post-media').upload(path, imageFile, {
      cacheControl: '3600',
      contentType: imageFile.type,
      upsert: false,
    })
    if (error) return fileToDataUrl(imageFile)
    const { data } = supabase.storage.from('post-media').getPublicUrl(path)
    return data.publicUrl
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!content.trim() || posting) return
    setPosting(true)
    try {
      const imageUrl = await uploadImage()
      const success = await onCreate({ content: content.trim(), imageUrl })
      if (success) {
        setContent('')
        setImageFile(null)
      }
    } catch {
      setUploadError('This image could not be attached. Try a smaller image.')
    } finally {
      setPosting(false)
    }
  }

  const profile = currentUser?.user_metadata || {}
  const avatar =
    profile.avatar_url ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      profile.display_name || 'You'
    )}&background=4A7A8C&color=F5F7F8`

  return (
    <form
      onSubmit={handleSubmit}
      className="glass rounded-3xl p-5 shadow-glass transition-all"
    >
      <div className="flex gap-3">
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
          required
          className="min-h-20 flex-1 resize-none bg-transparent pt-1 text-sm leading-6 text-[var(--text-main)] outline-none placeholder:text-sub"
        />
      </div>
      <div className="mt-4 flex flex-col gap-4 border-t border-[var(--card-border)] pt-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-full field px-3 text-xs font-semibold text-[var(--text-main)] transition hover:border-[#4A7A8C] scale-tap">
              <Image size={15} className="accent-text" />
              <span>{imageFile ? 'Replace image' : 'Add image'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
            <span className="inline-flex items-center gap-1 text-[11px] text-sub">
              <Camera size={13} />
              <span>Gallery or camera</span>
            </span>
            {imageFile && (
              <button
                type="button"
                onClick={() => setImageFile(null)}
                className="inline-flex h-9 items-center gap-1 rounded-full field px-3 text-xs font-semibold text-sub hover:text-[var(--text-main)] scale-tap"
                aria-label="Remove image"
              >
                <X size={14} />
                <span>Remove</span>
              </button>
            )}
          </div>
          {imageFile && (
            <p className="mt-2 max-w-[18rem] truncate text-[11px] text-sub">
              {imageFile.name}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={!content.trim() || posting}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full accent-bg px-5 text-xs font-bold text-[#F5F7F8] dark:text-[#10181C] transition scale-tap disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={14} />
          <span>{posting ? 'Posting...' : 'Post'}</span>
        </button>
      </div>
      {uploadError && (
        <p
          role="alert"
          className="mt-3 rounded-xl field px-3 py-2 text-xs font-semibold text-[var(--text-main)]"
        >
          {uploadError}
        </p>
      )}
      {previewUrl && (
        <div className="relative mt-4 h-48 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-border)]">
          <img
            src={previewUrl}
            alt="Preview of your post"
            className="h-full w-full object-contain"
          />
          <span className="absolute bottom-3 left-3 rounded-full bg-[var(--bg)]/90 px-3 py-1 text-[11px] font-semibold text-[var(--text-main)] border border-[var(--card-border)]">
            Preview
          </span>
        </div>
      )}
    </form>
  )
}