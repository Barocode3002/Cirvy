import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Lock, Loader2, RefreshCw, Image as ImageIcon } from 'lucide-react'

function getAvatarUrl(author) {
  if (author?.avatar_url) return author.avatar_url
  const name = author?.display_name || author?.username || 'User'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=00AFA0&color=fff`
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return 'now'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function SharedPostCard({ postId, currentUserId, isSender }) {
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadPost = useCallback(async () => {
    if (!postId) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('posts')
        .select('id, author_id, content, image_url, is_archived, created_at, author:author_id(id, username, display_name, avatar_url)')
        .eq('id', postId)
        .maybeSingle()

      if (fetchError) {
        setError('retry')
        setLoading(false)
        return
      }

      if (!data || data.is_archived) {
        setError('unavailable')
        setLoading(false)
        return
      }

      setPost(data)
      setLoading(false)
    } catch (err) {
      setError('retry')
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    let active = true
    if (postId) {
      loadPost()
    }
    return () => { active = false }
  }, [postId, loadPost])

  if (loading) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-2.5 flex items-center justify-center min-h-[80px]">
        <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
      </div>
    )
  }

  if (error === 'retry') {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-2.5 flex items-center gap-2 min-h-[70px]">
        <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
          <RefreshCw size={14} className="text-red-400" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-[var(--text-main)]">Could not load post</p>
          <p className="text-[10px] text-sub mt-0.5">Network error. Tap to retry.</p>
        </div>
        <button
          type="button"
          onClick={loadPost}
          className="text-[10px] font-semibold text-[var(--accent)] hover:underline cursor-pointer"
        >
          Retry
        </button>
      </div>
    )
  }

  if (error === 'unavailable' || (!post && !loading)) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl p-2.5 flex items-center gap-2 min-h-[70px]">
        <div className="w-8 h-8 rounded-full bg-[var(--card-border)]/40 flex items-center justify-center shrink-0">
          <Lock size={14} className="text-sub" />
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-[var(--text-main)]">Post unavailable</p>
          <p className="text-[10px] text-sub mt-0.5">
            This post is no longer available or you don't have permission to view it
          </p>
        </div>
      </div>
    )
  }

  if (!post) return null

  const author = post.author || {}
  const timeAgo = formatTimeAgo(post.created_at)
  const contentPreview = post.content
    ? post.content.length > 120
      ? post.content.slice(0, 120) + '…'
      : post.content
    : 'No content'

  const videoSrc =
    post.image_url &&
    (post.image_url.match(/\.(mp4|webm|ogg|mov)$/i) ||
      post.image_url.startsWith('data:video/'))
      ? post.image_url
      : null
  const imageSrc = !videoSrc ? post.image_url : null
  const mediaSrc = videoSrc || imageSrc
  const isVideo = !!videoSrc

  return (
    <Link
      to={`/post/${post.id}`}
      className="block bg-[var(--card-bg)] border border-[var(--card-border)] rounded-2xl overflow-hidden hover:border-[var(--accent)]/50 transition-colors cursor-pointer max-w-[280px]"
    >
      <div className="p-2">
        <div className="flex items-center gap-2 mb-1.5">
          <img
            src={getAvatarUrl(author)}
            alt=""
            className="w-6 h-6 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-[var(--text-main)] truncate">
              {author.display_name || author.username || 'user'}
            </p>
            <p className="text-[9px] text-sub">{timeAgo}</p>
          </div>
        </div>

        <p className="text-[11px] text-[var(--text-main)] leading-relaxed line-clamp-2 mb-1.5">
          {contentPreview}
        </p>
      </div>

      {mediaSrc && (
        <div className="relative bg-[var(--card-border)]/20 h-[130px]">
          {isVideo ? (
            <video
              src={mediaSrc}
              className="w-full h-full object-cover"
              muted
              playsInline
            />
          ) : (
            <img
              src={mediaSrc}
              alt="Post media"
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute bottom-1.5 right-1.5 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-lg flex items-center gap-1">
            <ImageIcon size={10} className="text-white" />
            <span className="text-[9px] text-white font-medium">Media</span>
          </div>
        </div>
      )}
    </Link>
  )
}
